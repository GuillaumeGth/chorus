import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { ShareIntentProvider } from 'expo-share-intent';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../src/hooks/useAuth';
import { usePlatformPreference } from '../src/hooks/usePlatformPreference';
import { createOrUpdateUser, updateUserPlatform, savePushToken } from '../src/services/firestore';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

WebBrowser.maybeCompleteAuthSession();

const MUSIC_HOSTS = [
  'open.spotify.com', 'spotify.link', 'music.apple.com',
  'music.youtube.com', 'www.deezer.com', 'deezer.com',
  'tidal.com', 'listen.tidal.com',
];

function isMusicUrl(url: string): boolean {
  try {
    return MUSIC_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

function AuthGate() {
  const { user, loaded } = useAuth();
  const { platform, loaded: platformLoaded } = usePlatformPreference();
  const { hasShareIntent } = useShareIntentContext();
  const router = useRouter();
  const syncedRef = useRef(false);
  const tokenSavedRef = useRef(false);

  // Auth redirect
  useEffect(() => {
    if (!loaded) return;
    if (!user) {
      router.replace('/auth');
    }
  }, [user, loaded]);

  // Share intent → toujours naviguer vers l'accueil pour afficher le contact picker
  useEffect(() => {
    if (!hasShareIntent || !loaded || !user) return;
    router.replace('/');
  }, [hasShareIntent, loaded, user]);

  // Sync profile → Firestore une fois par session (garantit displayNameLower + platform)
  useEffect(() => {
    if (!user || !platformLoaded || syncedRef.current) return;
    syncedRef.current = true;
    const name = user.displayName ?? user.email ?? '';
    void createOrUpdateUser({
      uid: user.uid,
      displayName: name,
      displayNameLower: name.toLowerCase(),
      email: user.email ?? '',
      photoURL: user.photoURL ?? null,
      ...(platform ? { platform } : {}),
    });
  }, [user, platformLoaded, platform]);

  // Push notifications: request permission + save token
  useEffect(() => {
    if (!user || tokenSavedRef.current) return;
    tokenSavedRef.current = true;
    void (async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
        });
      }
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: 'a72a749e-8378-4cb0-9683-4aaa88e25790',
      });
      await savePushToken(user.uid, token.data);
    })();
  }, [user]);

  // Tap on notification → navigate to chat
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const chatId = response.notification.request.content.data?.chatId as string | undefined;
      if (chatId) {
        router.navigate(`/chat/${chatId}`);
      }
    });
    return () => sub.remove();
  }, []);

  // Android intent filter — intercept music URLs
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url && isMusicUrl(url)) {
        router.navigate(`/?incomingUrl=${encodeURIComponent(url)}`);
      }
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (isMusicUrl(url)) {
        router.navigate(`/?incomingUrl=${encodeURIComponent(url)}`);
      }
    });
    return () => sub.remove();
  }, []);

  return null;
}

export default function RootLayout() {
  return (
    <ShareIntentProvider>
      <AuthGate />
      <Stack screenOptions={{ headerShown: false }} />
    </ShareIntentProvider>
  );
}
