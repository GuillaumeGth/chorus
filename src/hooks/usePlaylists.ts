/**
 * usePlaylists — real-time list of collaborative playlists for the current user.
 *
 * Subscribes to `playlists` where `memberUids array-contains uid`, ordered by
 * `updatedAt desc`. Re-subscribes when the authenticated user changes.
 * Returns an empty array (not null) while unauthenticated.
 */
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
