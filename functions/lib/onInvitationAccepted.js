"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onInvitationAccepted = void 0;
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
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const db = admin.firestore();
exports.onInvitationAccepted = (0, firestore_1.onDocumentUpdated)('invitations/{invId}', async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after)
        return;
    // Only react to pending → accepted transitions
    if (before.status !== 'pending' || after.status !== 'accepted')
        return;
    const { playlistId, invitedUid, role } = after;
    // Fetch invitee profile for memberInfo
    const userSnap = await db.doc(`users/${invitedUid}`).get();
    const userData = userSnap.data();
    if (!userData)
        return;
    const displayName = userData.displayName;
    const photoURL = userData.photoURL ?? null;
    // Add invitee to playlist (idempotent via arrayUnion)
    const playlistRef = db.doc(`playlists/${playlistId}`);
    const playlistSnap = await playlistRef.get();
    if (!playlistSnap.exists)
        return;
    const playlist = playlistSnap.data();
    const memberUids = playlist.memberUids;
    if (memberUids.includes(invitedUid))
        return;
    await playlistRef.update({
        [`members.${invitedUid}`]: role,
        [`memberInfo.${invitedUid}`]: { displayName, photoURL },
        memberUids: admin.firestore.FieldValue.arrayUnion(invitedUid),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
});
