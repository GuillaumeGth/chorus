import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import type { PlatformKey } from '../services/odesli';

const STORAGE_KEY = '@chorus/platform';

export function usePlatformPreference() {
  const [platform, setPlatformState] = useState<PlatformKey | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value) {
        setPlatformState(value as PlatformKey);
      }
      setLoaded(true);
    });
  }, []);

  const setPlatform = useCallback(async (newPlatform: PlatformKey) => {
    await AsyncStorage.setItem(STORAGE_KEY, newPlatform);
    setPlatformState(newPlatform);
  }, []);

  return { platform, setPlatform, loaded };
}
