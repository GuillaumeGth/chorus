import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import type { PlatformKey } from '../services/odesli';

const STORAGE_KEY = '@chorus/contacts';

export interface Contact {
  id: string;
  name: string;
  platform: PlatformKey;
}

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const value = await AsyncStorage.getItem(STORAGE_KEY);
    try {
      setContacts(value ? JSON.parse(value) : []);
    } catch {
      setContacts([]);
    }
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  const persist = useCallback(async (list: Contact[]) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    setContacts(list);
  }, []);

  const addContact = useCallback(async (name: string, platform: PlatformKey) => {
    const contact: Contact = { id: Date.now().toString(), name, platform };
    await persist([...contacts, contact]);
  }, [contacts, persist]);

  const removeContact = useCallback(async (id: string) => {
    await persist(contacts.filter((c) => c.id !== id));
  }, [contacts, persist]);

  return { contacts, loaded, reload: load, addContact, removeContact };
}
