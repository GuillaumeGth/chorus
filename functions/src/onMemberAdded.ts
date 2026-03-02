/**
 * onMemberAdded — Firebase Function
 *
 * Triggered on any playlist document update.
 * Compares memberUids before and after to detect newly added members and
 * sends each one a notification about the playlist they joined.
 *
 * Payload in notification data: { playlistId } — used client-side to
 * navigate to the playlist on tap.
 */
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const onMemberAdded = onDocumentUpdated(
  'playlists/{playlistId}',
  async (event) => {
    const before = event.data?.before.data();
    const after  = event.data?.after.data();
    if (!before || !after) return;

    const { playlistId } = event.params;

    const prevUids = before.memberUids as string[];
    const nextUids = after.memberUids  as string[];

    // Find UIDs that are new (present in after but not in before)
    const newUids = nextUids.filter((uid) => !prevUids.includes(uid));
    if (newUids.length === 0) return;

    const playlistName = after.name as string;

    // Fetch push tokens for new members (parallel)
    const userSnaps = await Promise.all(
      newUids.map((uid) => db.doc(`users/${uid}`).get()),
    );

    const tokens = userSnaps
      .map((snap) => snap.data()?.expoPushToken as string | undefined)
      .filter((t): t is string => !!t);

    if (tokens.length === 0) return;

    await Promise.all(
      tokens.map((to) =>
        fetch('https://exp.host/--/api/v2/push/send', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to,
            title: 'Tu as été invité à une playlist',
            body:  playlistName,
            data:  { playlistId },
            sound: 'default',
          }),
        }),
      ),
    );
  },
);
