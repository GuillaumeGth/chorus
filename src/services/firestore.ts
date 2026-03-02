import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { PlatformKey } from './odesli';

export type ReactionType = 'like' | 'superlike' | 'wow' | 'dislike';

export const REACTIONS: Array<{ type: ReactionType; emoji: string; label: string }> = [
  { type: 'like',      emoji: '❤️',  label: "J'aime" },
  { type: 'superlike', emoji: '🔥',  label: 'Super' },
  { type: 'wow',       emoji: '😮',  label: 'Wow' },
  { type: 'dislike',   emoji: '👎',  label: 'Bof' },
];

export interface UserProfile {
  uid: string;
  displayName: string;
  displayNameLower: string;
  email: string;
  photoURL: string | null;
  platform: PlatformKey | null;
  expoPushToken?: string;
}

export interface FollowEntry {
  uid: string;
  displayName: string;
  photoURL: string | null;
  platform: PlatformKey | null;
  followedAt: any;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  originalUrl: string;
  convertedUrl: string;
  platformLinks?: Partial<Record<PlatformKey, string>>;
  title: string;
  artist: string;
  thumbnailUrl: string;
  targetPlatform: PlatformKey;
  createdAt: any;
  reactions?: Record<string, ReactionType>;
}

export interface Chat {
  id: string;
  participants: string[];
  participantInfo: Record<string, { displayName: string; photoURL: string | null }>;
  lastMessage: { title: string; artist: string; senderId: string; createdAt: any } | null;
  updatedAt: any;
}

// Deterministic chat ID for two users
export function getChatId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_');
}

export async function createOrUpdateUser(
  profile: Omit<UserProfile, 'platform'> & { platform?: PlatformKey | null }
): Promise<void> {
  const data: Record<string, any> = {
    uid: profile.uid,
    displayName: profile.displayName,
    displayNameLower: profile.displayNameLower,
    email: profile.email,
    photoURL: profile.photoURL,
  };
  if (profile.platform !== undefined) {
    data.platform = profile.platform;
  }
  await setDoc(doc(db, 'users', profile.uid), data, { merge: true });
}

export async function updateUserPlatform(uid: string, platform: PlatformKey): Promise<void> {
  await setDoc(doc(db, 'users', uid), { platform }, { merge: true });
}

export async function savePushToken(uid: string, token: string): Promise<void> {
  await setDoc(doc(db, 'users', uid), { expoPushToken: token }, { merge: true });
}

export async function removePushToken(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { expoPushToken: deleteField() });
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function searchUsers(q: string, currentUid: string): Promise<UserProfile[]> {
  if (!q.trim()) return [];
  const lower = q.toLowerCase().trim();
  const [nameSnap, emailSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, 'users'),
        where('displayNameLower', '>=', lower),
        where('displayNameLower', '<=', lower + '\uf8ff'),
        limit(10)
      )
    ),
    getDocs(
      query(
        collection(db, 'users'),
        where('email', '>=', lower),
        where('email', '<=', lower + '\uf8ff'),
        limit(10)
      )
    ),
  ]);
  const seen = new Set<string>();
  const results: UserProfile[] = [];
  for (const snap of [nameSnap, emailSnap]) {
    for (const d of snap.docs) {
      const u = d.data() as UserProfile;
      if (u.uid !== currentUid && !seen.has(u.uid)) {
        seen.add(u.uid);
        results.push(u);
      }
    }
  }
  return results;
}

export async function getOrCreateChat(
  myUid: string,
  myName: string,
  myPhoto: string | null,
  otherUid: string,
  otherName: string,
  otherPhoto: string | null
): Promise<string> {
  const chatId = getChatId(myUid, otherUid);
  const ref = doc(db, 'chats', chatId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      participants: [myUid, otherUid],
      participantInfo: {
        [myUid]: { displayName: myName, photoURL: myPhoto },
        [otherUid]: { displayName: otherName, photoURL: otherPhoto },
      },
      lastMessage: null,
      updatedAt: serverTimestamp(),
    });
  }
  return chatId;
}

export async function sendMusicMessage(
  chatId: string,
  message: Omit<ChatMessage, 'id' | 'createdAt'>
): Promise<void> {
  const payload = { ...message, createdAt: serverTimestamp() };
  await addDoc(collection(db, 'chats', chatId, 'messages'), payload);
  await updateDoc(doc(db, 'chats', chatId), {
    lastMessage: {
      title: message.title,
      artist: message.artist,
      senderId: message.senderId,
      createdAt: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  });
}

export function subscribeToChats(
  uid: string,
  callback: (chats: Chat[]) => void
): () => void {
  return onSnapshot(
    query(
      collection(db, 'chats'),
      where('participants', 'array-contains', uid),
      orderBy('updatedAt', 'desc')
    ),
    (snap) => {
      const chats = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Chat));
      callback(chats);
    }
  );
}

export async function followUser(myUid: string, user: UserProfile | FollowEntry): Promise<void> {
  await setDoc(doc(db, 'users', myUid, 'following', user.uid), {
    uid: user.uid,
    displayName: user.displayName,
    photoURL: user.photoURL,
    platform: user.platform,
    followedAt: serverTimestamp(),
  });
}

export async function unfollowUser(myUid: string, targetUid: string): Promise<void> {
  await deleteDoc(doc(db, 'users', myUid, 'following', targetUid));
}

export async function isFollowing(myUid: string, targetUid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'users', myUid, 'following', targetUid));
  return snap.exists();
}

export async function getFollowing(myUid: string): Promise<FollowEntry[]> {
  const snap = await getDocs(
    query(collection(db, 'users', myUid, 'following'), orderBy('followedAt', 'desc'))
  );
  return snap.docs.map((d) => d.data() as FollowEntry);
}

export interface ReceivedMessage extends ChatMessage {
  chatId: string;
}

export async function getReceivedMessages(uid: string): Promise<ReceivedMessage[]> {
  const chatsSnap = await getDocs(
    query(collection(db, 'chats'), where('participants', 'array-contains', uid))
  );
  const all: ReceivedMessage[] = [];
  await Promise.all(
    chatsSnap.docs.map(async (chatDoc) => {
      const msgsSnap = await getDocs(
        query(
          collection(db, 'chats', chatDoc.id, 'messages'),
          orderBy('createdAt', 'desc'),
          limit(50)
        )
      );
      msgsSnap.docs
        .map((d) => ({ id: d.id, chatId: chatDoc.id, ...d.data() } as ReceivedMessage))
        .filter((m) => m.senderId !== uid)
        .forEach((m) => all.push(m));
    })
  );
  return all.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
}

export async function setMessageReaction(
  chatId: string,
  msgId: string,
  uid: string,
  reaction: ReactionType | null
): Promise<void> {
  const ref = doc(db, 'chats', chatId, 'messages', msgId);
  await updateDoc(ref, {
    [`reactions.${uid}`]: reaction === null ? deleteField() : reaction,
  });
}

export function subscribeToMessages(
  chatId: string,
  callback: (messages: ChatMessage[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc')
    ),
    { includeMetadataChanges: false },
    (snap) => {
      const messages = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage));
      callback(messages);
    },
    (error) => {
      console.error('[subscribeToMessages]', error);
      onError?.(error);
    }
  );
}

