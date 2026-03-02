/**
 * onTrackAdded — Firebase Function
 *
 * Triggered when a track document is created inside a playlist.
 * Sends a push notification to every playlist member except the user who
 * added the track.
 *
 * Payload in notification data: { playlistId } — used client-side to
 * navigate to the playlist on tap.
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const onTrackAdded = onDocumentCreated(
  'playlists/{playlistId}/tracks/{trackId}',
  async (event) => {
    const track = event.data?.data();
    if (!track) return;

    const { playlistId } = event.params;
    const { addedBy, addedByName, title, artist } = track as {
      addedBy:      string;
      addedByName:  string;
      title:        string;
      artist:       string;
    };

    // Fetch playlist to get member UIDs
    const playlistSnap = await db.doc(`playlists/${playlistId}`).get();
    const playlist = playlistSnap.data();
    if (!playlist) return;

    const memberUids = (playlist.memberUids as string[]).filter((uid) => uid !== addedBy);
    if (memberUids.length === 0) return;

    // Fetch push tokens for all recipients (parallel)
    const userSnaps = await Promise.all(
      memberUids.map((uid) => db.doc(`users/${uid}`).get()),
    );

    const tokens = userSnaps
      .map((snap) => snap.data()?.expoPushToken as string | undefined)
      .filter((t): t is string => !!t);

    if (tokens.length === 0) return;

    // Send one notification per token via Expo Push API
    await Promise.all(
      tokens.map((to) =>
        fetch('https://exp.host/--/api/v2/push/send', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to,
            title: `${addedByName} a ajouté un morceau`,
            body:  `${title} — ${artist}`,
            data:  { playlistId },
            sound: 'default',
          }),
        }),
      ),
    );
  },
);
