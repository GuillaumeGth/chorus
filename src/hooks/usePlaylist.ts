/**
 * usePlaylist — real-time detail for a single collaborative playlist.
 *
 * Opens two parallel Firestore subscriptions:
 *   1. `playlists/{playlistId}` → playlist metadata + member map
 *   2. `playlists/{playlistId}/tracks` ordered by `position asc` → track list
 *
 * Both subscriptions are cleaned up together when the component unmounts or
 * `playlistId` changes. `playlist` is null if the document does not exist or
 * the user is not a member (Firestore rules deny the read).
 */
import { useEffect, useState } from 'react';
import {
  subscribeToPlaylist,
  subscribeToPlaylistTracks,
  type Playlist,
  type PlaylistTrack,
} from '../services/playlists';

export function usePlaylist(playlistId: string) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playlistId) return;
    setLoading(true);
    const unsubPlaylist = subscribeToPlaylist(playlistId, (data) => {
      setPlaylist(data);
      setLoading(false);
    });
    const unsubTracks = subscribeToPlaylistTracks(playlistId, setTracks);
    return () => {
      unsubPlaylist();
      unsubTracks();
    };
  }, [playlistId]);

  return { playlist, tracks, loading };
}
