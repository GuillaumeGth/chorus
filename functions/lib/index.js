"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onNewMessage = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();
exports.onNewMessage = (0, firestore_1.onDocumentCreated)('chats/{chatId}/messages/{msgId}', async (event) => {
    const msg = event.data?.data();
    if (!msg)
        return;
    const { chatId } = event.params;
    const { senderId, senderName, title, artist } = msg;
    // Trouver le destinataire
    const chatSnap = await db.doc(`chats/${chatId}`).get();
    const chat = chatSnap.data();
    if (!chat)
        return;
    const recipientUid = chat.participants.find((uid) => uid !== senderId);
    if (!recipientUid)
        return;
    // Récupérer le token push du destinataire
    const userSnap = await db.doc(`users/${recipientUid}`).get();
    const expoPushToken = userSnap.data()?.expoPushToken;
    if (!expoPushToken)
        return;
    // Envoyer via Expo Push API (fetch natif Node 20)
    await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            to: expoPushToken,
            title: `Nouveau morceau de ${senderName}`,
            body: `${title} - ${artist}`,
            data: { chatId },
            sound: 'default',
        }),
    });
});
