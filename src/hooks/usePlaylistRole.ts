import { useAuth } from './useAuth';
import { usePlaylist } from './usePlaylist';
import type { PlaylistRole } from '../services/playlists';

export function usePlaylistRole(playlistId: string): PlaylistRole | null {
  const { user } = useAuth();
  const { playlist } = usePlaylist(playlistId);
  if (!user || !playlist) return null;
  return playlist.members[user.uid] ?? null;
}
