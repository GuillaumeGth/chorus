import { useEffect, useState } from 'react';
import { subscribeToMyPlaylists, type Playlist } from '../services/playlists';
import { useAuth } from './useAuth';

export function usePlaylists() {
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setPlaylists([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeToMyPlaylists(user.uid, (data) => {
      setPlaylists(data);
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  return { playlists, loading };
}
