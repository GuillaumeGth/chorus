/**
 * Firestore service for collaborative playlists.
 *
 * Data model:
 *   playlists/{playlistId}                   — playlist document
 *   playlists/{playlistId}/tracks/{trackId}  — ordered track subcollection
 *
 * Authorization is enforced by Firestore security rules (firestore.rules).
 * Service functions add role-based checks where rules cannot (e.g. editor
 * deleting only their own tracks).
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { PlatformKey } from './odesli';

export type PlaylistRole = 'owner' | 'editor' | 'viewer';

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverThumbnailUrl?: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  members: Record<string, PlaylistRole>;
  memberInfo: Record<string, { displayName: string; photoURL: string | null }>;
  memberUids: string[];
  trackCount: number;
  inviteCode: string;
  inviteLinkActive: boolean;
  inviteRole: 'editor' | 'viewer';
  lastTrack?: {
    title: string;
    artist: string;
    thumbnailUrl: string;
    addedByName: string;
    addedAt: Timestamp;
  };
}

export interface PlaylistTrack {
  id: string;
  addedBy: string;
  addedByName: string;
  addedByPhoto: string | null;
  addedAt: Timestamp;
  title: string;
  artist: string;
  thumbnailUrl: string;
  originalUrl: string;
  platformLinks: Partial<Record<PlatformKey, string>>;
  position: number;
}

function generateInviteCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/**
 * Creates a new playlist owned by the given user.
 * @param uid - Creator UID (assigned role 'owner').
 * @param displayName - Creator display name, stored in memberInfo.
 * @param photoURL - Creator photo URL, stored in memberInfo.
 * @param name - Playlist name (required, non-empty).
 * @param description - Optional description.
 * @param inviteRole - Role granted to users joining via invite link. Defaults to 'viewer'.
 * @returns The new playlist's Firestore document ID.
 */
export async function createPlaylist(
  uid: string,
  displayName: string,
  photoURL: string | null,
  name: string,
  description?: string,
  inviteRole: 'editor' | 'viewer' = 'viewer',
): Promise<string> {
  const ref = doc(collection(db, 'playlists'));
  await setDoc(ref, {
    id: ref.id,
    name,
    ...(description ? { description } : {}),
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    members: { [uid]: 'owner' },
    memberInfo: { [uid]: { displayName, photoURL } },
    memberUids: [uid],
    trackCount: 0,
    inviteCode: generateInviteCode(),
    inviteLinkActive: true,
    inviteRole,
  });
  return ref.id;
}

/** Permanently deletes a playlist document. Only callable by the owner (enforced by Firestore rules). */
export async function deletePlaylist(playlistId: string): Promise<void> {
  await deleteDoc(doc(db, 'playlists', playlistId));
}

/** Updates playlist name and/or description. Only callable by the owner. */
export async function updatePlaylistInfo(
  playlistId: string,
  updates: { name?: string; description?: string },
): Promise<void> {
  await updateDoc(doc(db, 'playlists', playlistId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Real-time subscription to all playlists where `uid` is listed in memberUids.
 * Results are ordered by updatedAt descending.
 * @returns Firestore unsubscribe function.
 */
export function subscribeToMyPlaylists(
  uid: string,
  callback: (playlists: Playlist[]) => void,
): () => void {
  return onSnapshot(
    query(
      collection(db, 'playlists'),
      where('memberUids', 'array-contains', uid),
      orderBy('updatedAt', 'desc'),
    ),
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Playlist)));
    },
  );
}

/** Real-time subscription to a single playlist document. Passes null if the document doesn't exist. */
export function subscribeToPlaylist(
  playlistId: string,
  callback: (playlist: Playlist | null) => void,
): () => void {
  return onSnapshot(doc(db, 'playlists', playlistId), (snap) => {
    callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as Playlist) : null);
  });
}

/** Real-time subscription to a playlist's tracks, ordered by position ascending. */
export function subscribeToPlaylistTracks(
  playlistId: string,
  callback: (tracks: PlaylistTrack[]) => void,
): () => void {
  return onSnapshot(
    query(
      collection(db, 'playlists', playlistId, 'tracks'),
      orderBy('position', 'asc'),
    ),
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PlaylistTrack)));
    },
  );
}

/** Changes a member's role. Only callable by the owner. */
export async function updateMemberRole(
  playlistId: string,
  targetUid: string,
  newRole: PlaylistRole,
): Promise<void> {
  await updateDoc(doc(db, 'playlists', playlistId), {
    [`members.${targetUid}`]: newRole,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Removes a member from the playlist, cleaning up members, memberInfo, and memberUids atomically.
 * Reads the document first to reconstruct the filtered maps — Firestore does not support
 * deleting individual map keys without a full rewrite.
 */
export async function removeMember(playlistId: string, targetUid: string): Promise<void> {
  const ref = doc(db, 'playlists', playlistId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const playlist = snap.data() as Playlist;
  const newMembers = { ...playlist.members };
  delete newMembers[targetUid];
  const newMemberInfo = { ...playlist.memberInfo };
  delete newMemberInfo[targetUid];
  await updateDoc(ref, {
    members: newMembers,
    memberInfo: newMemberInfo,
    memberUids: playlist.memberUids.filter((u) => u !== targetUid),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Directly invites a Chorus user to the playlist (owner-initiated, no invite code needed).
 * No-ops if the user is already a member.
 */
export async function inviteMember(
  playlistId: string,
  targetUid: string,
  role: 'editor' | 'viewer',
  targetDisplayName: string,
  targetPhotoURL: string | null,
): Promise<void> {
  const ref = doc(db, 'playlists', playlistId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const playlist = snap.data() as Playlist;
  if (playlist.memberUids.includes(targetUid)) return;
  await updateDoc(ref, {
    [`members.${targetUid}`]: role,
    [`memberInfo.${targetUid}`]: { displayName: targetDisplayName, photoURL: targetPhotoURL },
    memberUids: [...playlist.memberUids, targetUid],
    updatedAt: serverTimestamp(),
  });
}

/**
 * Joins a playlist using a 6-character invite code.
 * No-ops (returns the playlist ID) if the user is already a member.
 * @throws {Error} If no active playlist matches the code.
 * @returns The joined playlist's Firestore document ID.
 */
export async function joinPlaylistByCode(
  code: string,
  uid: string,
  displayName: string,
  photoURL: string | null,
): Promise<string> {
  const snap = await getDocs(
    query(
      collection(db, 'playlists'),
      where('inviteCode', '==', code),
      where('inviteLinkActive', '==', true),
    ),
  );
  if (snap.empty) throw new Error('Code invalide ou lien désactivé');
  const playlistDoc = snap.docs[0];
  const playlist = playlistDoc.data() as Playlist;
  if (playlist.memberUids.includes(uid)) return playlistDoc.id;
  await updateDoc(playlistDoc.ref, {
    [`members.${uid}`]: playlist.inviteRole,
    [`memberInfo.${uid}`]: { displayName, photoURL },
    memberUids: [...playlist.memberUids, uid],
    updatedAt: serverTimestamp(),
  });
  return playlistDoc.id;
}

/** Generates and persists a fresh 6-character invite code, invalidating the previous one. */
export async function generateNewInviteCode(playlistId: string): Promise<string> {
  const code = generateInviteCode();
  await updateDoc(doc(db, 'playlists', playlistId), {
    inviteCode: code,
    updatedAt: serverTimestamp(),
  });
  return code;
}

/** Enables or disables the invite link for a playlist. Only callable by the owner. */
export async function setInviteLinkActive(playlistId: string, active: boolean): Promise<void> {
  await updateDoc(doc(db, 'playlists', playlistId), {
    inviteLinkActive: active,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Removes a track from a playlist with role-based authorization.
 * - viewers: blocked entirely.
 * - editors: may only remove their own tracks (`addedBy === requesterId`).
 * - owners: may remove any track.
 * Authorization is enforced here because Firestore rules cannot compare
 * the requester's uid against the track's `addedBy` field for editors.
 */
export async function removeTrackFromPlaylist(
  playlistId: string,
  trackId: string,
  requesterId: string,
  requesterRole: PlaylistRole,
): Promise<void> {
  const trackRef = doc(db, 'playlists', playlistId, 'tracks', trackId);
  const trackSnap = await getDoc(trackRef);
  if (!trackSnap.exists()) return;
  const track = trackSnap.data() as PlaylistTrack;

  if (requesterRole === 'viewer') return;
  if (requesterRole === 'editor' && track.addedBy !== requesterId) return;

  await deleteDoc(trackRef);
  await updateDoc(doc(db, 'playlists', playlistId), {
    trackCount: increment(-1),
    updatedAt: serverTimestamp(),
  });
}
