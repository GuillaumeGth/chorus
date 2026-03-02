"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onInvitationCreated = void 0;
/**
 * onInvitationCreated — Firebase Function
 *
 * Triggered when a new invitation document is created in `invitations/{invId}`.
 * Sends a push notification to the invited user so they can accept or decline
 * from the Chørus app.
 *
 * Notification data: { type: 'invitation' } — used client-side to navigate
 * to the playlists screen on tap.
 */
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const db = admin.firestore();
exports.onInvitationCreated = (0, firestore_1.onDocumentCreated)('invitations/{invId}', async (event) => {
    const inv = event.data?.data();
    if (!inv)
        return;
    const { invitedUid, invitedByName, playlistName } = inv;
    const userSnap = await db.doc(`users/${invitedUid}`).get();
    const expoPushToken = userSnap.data()?.expoPushToken;
    if (!expoPushToken)
        return;
    await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            to: expoPushToken,
            title: 'Invitation à une playlist',
            body: `${invitedByName} t'a invité dans « ${playlistName} »`,
            data: { type: 'invitation' },
            sound: 'default',
        }),
    });
});
