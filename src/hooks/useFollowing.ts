import { useCallback, useEffect, useState } from 'react';
import { auth } from '../config/firebase';
import type { FollowEntry } from '../services/firestore';
import { getFollowing, getUserProfile } from '../services/firestore';

export function useFollowing() {
  const [contacts, setContacts] = useState<FollowEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setLoading(true);
    try {
      const entries = await getFollowing(uid);
      // Rafraîchir les platforms en arrière-plan
      const refreshed = await Promise.all(
        entries.map(async (entry) => {
          const profile = await getUserProfile(entry.uid);
          return { ...entry, platform: profile?.platform ?? null };
        })
      );
      setContacts(refreshed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { contacts, loading, refresh };
}
