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
