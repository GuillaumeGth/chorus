import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

admin.initializeApp();

export { onTrackAdded } from './onTrackAdded';
export { onInvitationCreated }  from './onInvitationCreated';
export { onInvitationAccepted } from './onInvitationAccepted';
const db = admin.firestore();

export const onNewMessage = onDocumentCreated(
  'chats/{chatId}/messages/{msgId}',
  async (event) => {
    const msg = event.data?.data();
    if (!msg) return;

    const { chatId } = event.params;
    const { senderId, senderName, title, artist } = msg as {
      senderId: string;
      senderName: string;
      title: string;
      artist: string;
    };

    // Trouver le destinataire
    const chatSnap = await db.doc(`chats/${chatId}`).get();
    const chat = chatSnap.data();
    if (!chat) return;

    const recipientUid = (chat.participants as string[]).find((uid) => uid !== senderId);
    if (!recipientUid) return;

    // Récupérer le token push du destinataire
    const userSnap = await db.doc(`users/${recipientUid}`).get();
    const expoPushToken = userSnap.data()?.expoPushToken as string | undefined;
    if (!expoPushToken) return;

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
  }
);
