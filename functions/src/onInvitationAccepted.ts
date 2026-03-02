/**
 * onInvitationAccepted — Firebase Function
 *
 * Triggered when an invitation document is updated.
 * When status transitions from 'pending' → 'accepted', adds the invitee
 * to the playlist with the role specified in the invitation.
 *
 * Runs with admin privileges so the invitee (not yet a member) can be added
 * without violating Firestore member-only update rules.
 */
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const onInvitationAccepted = onDocumentUpdated(
  'invitations/{invId}',
  async (event) => {
    const before = event.data?.before.data();
    const after  = event.data?.after.data();
    if (!before || !after) return;

    // Only react to pending → accepted transitions
    if (before.status !== 'pending' || after.status !== 'accepted') return;

    const { playlistId, invitedUid, role } = after as {
      playlistId: string;
      invitedUid: string;
      role:       'editor' | 'viewer';
    };

    // Fetch invitee profile for memberInfo
    const userSnap = await db.doc(`users/${invitedUid}`).get();
    const userData  = userSnap.data();
    if (!userData) return;

    const displayName = userData.displayName as string;
    const photoURL    = (userData.photoURL as string | null) ?? null;

    // Add invitee to playlist (idempotent via arrayUnion)
    const playlistRef  = db.doc(`playlists/${playlistId}`);
    const playlistSnap = await playlistRef.get();
    if (!playlistSnap.exists) return;

    const playlist  = playlistSnap.data()!;
    const memberUids = playlist.memberUids as string[];
    if (memberUids.includes(invitedUid)) return;

    await playlistRef.update({
      [`members.${invitedUid}`]:    role,
      [`memberInfo.${invitedUid}`]: { displayName, photoURL },
      memberUids:  admin.firestore.FieldValue.arrayUnion(invitedUid),
      updatedAt:   admin.firestore.FieldValue.serverTimestamp(),
    });
  },
);
