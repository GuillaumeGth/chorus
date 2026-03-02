/**
 * usePlaylistRole — derives the authenticated user's role in a playlist.
 *
 * Reads from `playlist.members[uid]`. Returns:
 *   - `null`    if auth is not loaded, user is not logged in, or playlist is not loaded
 *   - `'owner'` | `'editor'` | `'viewer'` once the playlist document is available
 *
 * Note: this hook subscribes to the full playlist via usePlaylist, so it is
 * not suited for cases where only the role is needed without the track list.
 */
import { useAuth } from './useAuth';
import { usePlaylist } from './usePlaylist';
import type { PlaylistRole } from '../services/playlists';

export function usePlaylistRole(playlistId: string): PlaylistRole | null {
  const { user } = useAuth();
  const { playlist } = usePlaylist(playlistId);
  if (!user || !playlist) return null;
  return playlist.members[user.uid] ?? null;
}
