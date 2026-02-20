import { useFocusEffect } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { useCallback, useEffect, useState } from 'react';
import { auth } from '../config/firebase';
import type { ReceivedMessage } from '../services/firestore';
import { getReceivedMessages } from '../services/firestore';

export function useReceivedMessages() {
  const [messages, setMessages] = useState<ReceivedMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    try {
      const received = await getReceivedMessages(uid);
      setMessages(received);
    } catch (e) {
      console.error('[useReceivedMessages]', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh on screen focus
  useFocusEffect(
    useCallback(() => {
      fetchMessages();
    }, [fetchMessages])
  );

  // Also fetch when auth resolves (currentUser may be null on first render)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) fetchMessages();
    });
    return unsub;
  }, [fetchMessages]);

  return { messages, loading };
}
