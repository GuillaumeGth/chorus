import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Dimensions,
  FlatList,
  Image,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useReceivedMessages } from '../src/hooks/useReceivedMessages';
import { useDismissedMessages } from '../src/hooks/useDismissedMessages';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PlatformKey } from '../src/services/odesli';
import type { FollowEntry } from '../src/services/firestore';
import {
  getFollowing,
  getUserProfile,
  getOrCreateChat,
  sendMusicMessage,
} from '../src/services/firestore';
import { usePlatformPreference } from '../src/hooks/usePlatformPreference';
import { useAuth } from '../src/hooks/useAuth';
import { useConversionFlow } from '../src/hooks/useConversionFlow';

const SCREEN_WIDTH = Dimensions.get('window').width;
const MOSAIC_COLS = 3;
const MOSAIC_GAP = 3;
const MOSAIC_SIDE = 8;
const CELL_SIZE = (SCREEN_WIDTH - MOSAIC_SIDE * 2 - MOSAIC_GAP * (MOSAIC_COLS - 1)) / MOSAIC_COLS;

const PLATFORM_LABELS: Record<PlatformKey, string> = {
  spotify: 'Spotify',
  appleMusic: 'Apple Music',
  youtubeMusic: 'YouTube Music',
  deezer: 'Deezer',
  tidal: 'Tidal',
};

const PLATFORM_SEARCH_URLS: Record<PlatformKey, (q: string) => string> = {
  spotify: (q) => `https://open.spotify.com/search/${encodeURIComponent(q)}`,
  appleMusic: (q) => `https://music.apple.com/search?term=${encodeURIComponent(q)}`,
  youtubeMusic: (q) => `https://music.youtube.com/search?q=${encodeURIComponent(q)}`,
  deezer: (q) => `https://www.deezer.com/search/${encodeURIComponent(q)}`,
  tidal: (q) => `https://listen.tidal.com/search?q=${encodeURIComponent(q)}`,
};

function getSearchUrl(p: PlatformKey, title: string, artist: string): string {
  return PLATFORM_SEARCH_URLS[p](`${title} ${artist}`);
}

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

export default function IndexScreen() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const { platform, loaded } = usePlatformPreference();
  const { user: authUser, loaded: authLoaded } = useAuth();
  const { incomingUrl } = useLocalSearchParams<{ incomingUrl?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const currentUser = authUser;

  const flow = useConversionFlow({ platform });

  const [copied, setCopied] = useState(false);
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);

  // Contact picker state
  const [searchQuery, setSearchQuery] = useState('');
  const [followedContacts, setFollowedContacts] = useState<FollowEntry[]>([]);
  const [selectedContact, setSelectedContact] = useState<FollowEntry | null>(null);
  const [sending, setSending] = useState(false);
  const [contactsLoaded, setContactsLoaded] = useState(false);

  const { messages: receivedMessages, loading: receivedLoading } = useReceivedMessages();
  const { dismissed, dismiss, undismiss } = useDismissedMessages();
  const [lastDismissedId, setLastDismissedId] = useState<string | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visibleMessages = receivedMessages.filter((m) => !dismissed.has(m.id));

  function handleDismiss(id: string) {
    dismiss(id);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setLastDismissedId(id);
    undoTimerRef.current = setTimeout(() => setLastDismissedId(null), 4000);
  }

  function handleUndismiss() {
    if (!lastDismissedId) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undismiss(lastDismissedId);
    setLastDismissedId(null);
  }

  const lastClipboardRef = useRef<string | null>(null);
  const handledIncomingUrlRef = useRef<string | null>(null);

  // Redirect to settings if no platform set (only when authenticated)
  useEffect(() => {
    if (authLoaded && loaded && authUser && !platform) {
      router.replace('/settings');
    }
  }, [authLoaded, loaded, authUser, platform]);

  // Share intent — store URL and show contact picker.
  // flow.onShareIntent also invalidates any in-flight conversion so a stale
  // fetchLinks result cannot hide the picker.
  useEffect(() => {
    if (!hasShareIntent || !shareIntent?.text) return;
    flow.onShareIntent(shareIntent.text.trim());
    setSelectedContact(null);
    setSearchQuery('');
    setClipboardUrl(null);
  }, [hasShareIntent, shareIntent]);

  // Android intent filter URL
  useEffect(() => {
    if (!incomingUrl || incomingUrl === handledIncomingUrlRef.current) return;
    if (!isMusicUrl(incomingUrl)) return;
    handledIncomingUrlRef.current = incomingUrl;
    flow.startConversion(incomingUrl);
  }, [incomingUrl]);

  // Clipboard detection
  useEffect(() => {
    async function checkClipboard() {
      const text = await Clipboard.getStringAsync();
      if (!text || text === lastClipboardRef.current) return;
      lastClipboardRef.current = text;
      if (isMusicUrl(text)) setClipboardUrl(text);
    }
    checkClipboard();
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') checkClipboard();
    });
    return () => sub.remove();
  }, []);

  // Charger les contacts suivis quand le picker s'ouvre
  useEffect(() => {
    if (!flow.showContactPicker || !currentUser || contactsLoaded) return;
    getFollowing(currentUser.uid).then(async (entries) => {
      const refreshed = await Promise.all(
        entries.map(async (entry) => {
          const profile = await getUserProfile(entry.uid);
          return { ...entry, platform: profile?.platform ?? null };
        })
      );
      setFollowedContacts(refreshed);
      setContactsLoaded(true);
    });
  }, [flow.showContactPicker, currentUser, contactsLoaded]);

  // Filtrer les contacts par nom
  const displayedContacts = searchQuery.trim()
    ? followedContacts.filter((c) =>
        c.displayName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : followedContacts;

  async function handleContactPick(contact: FollowEntry | null) {
    const url = flow.pendingUrl;
    if (!url) return;

    if (!contact) {
      setSelectedContact(null);
      flow.startConversion(url, platform ?? undefined);
      return;
    }

    // Toujours récupérer le profil frais pour avoir la plateforme à jour
    const freshProfile = await getUserProfile(contact.uid);
    const resolvedPlatform = freshProfile?.platform ?? contact.platform;

    if (!resolvedPlatform) {
      // Use flow to surface the error state
      flow.startConversion(url); // will fail gracefully or we handle inline
      setSelectedContact(null);
      return;
    }

    setSelectedContact({ ...contact, platform: resolvedPlatform });
    flow.startConversion(url, resolvedPlatform);
  }

  async function handleSendToContact() {
    if (!flow.result || !selectedContact || !currentUser || !flow.pendingUrl) return;
    if (!selectedContact.platform) return;

    const convertedUrl = flow.result.platformLinks[selectedContact.platform];
    if (!convertedUrl) return;

    setSending(true);
    try {
      const chatId = await getOrCreateChat(
        currentUser.uid,
        currentUser.displayName ?? currentUser.email ?? 'Moi',
        currentUser.photoURL ?? null,
        selectedContact.uid,
        selectedContact.displayName,
        selectedContact.photoURL
      );

      await sendMusicMessage(chatId, {
        senderId: currentUser.uid,
        senderName: currentUser.displayName ?? currentUser.email ?? 'Moi',
        originalUrl: flow.pendingUrl,
        convertedUrl,
        platformLinks: flow.result.platformLinks,
        title: flow.result.title,
        artist: flow.result.artist,
        thumbnailUrl: flow.result.thumbnailUrl,
        targetPlatform: selectedContact.platform,
      });

      router.push(`/chat/${chatId}`);
      handleReset();
    } catch (e: any) {
      // surface error without clobbering the conversion result
      setSending(false);
      throw e;
    } finally {
      setSending(false);
    }
  }

  async function handleOpen() {
    const link = flow.result && platform ? flow.result.platformLinks[platform] : null;
    if (!link) return;
    await Linking.openURL(link);
  }

  async function handleCopy() {
    const link = flow.result && platform ? flow.result.platformLinks[platform] : null;
    if (!link) return;
    await Clipboard.setStringAsync(link);
    lastClipboardRef.current = link;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShareSelf() {
    const link = flow.result && platform ? flow.result.platformLinks[platform] : null;
    if (!link) return;
    await Share.share({ message: link, url: link });
  }

  function handleReset() {
    resetShareIntent();
    flow.reset();
    setSelectedContact(null);
    setSearchQuery('');
    setFollowedContacts([]);
    setContactsLoaded(false);
  }

  const showContactPicker = flow.showContactPicker;
  const convertedForContact = flow.result && selectedContact?.platform
    ? flow.result.platformLinks[selectedContact.platform]
    : null;
  const convertedForSelf = flow.result && platform ? flow.result.platformLinks[platform] : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.appName}>Chørus</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => router.push('/search')} style={styles.iconBtn}>
            <Ionicons name="person-add-outline" size={22} color="#ffffff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/contacts')} style={styles.iconBtn}>
            <Ionicons name="people-outline" size={22} color="#ffffff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/chats')} style={styles.iconBtn}>
            <Ionicons name="chatbubbles-outline" size={22} color="#ffffff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/settings')} style={styles.avatarBtn}>
            {currentUser?.photoURL ? (
              <Image source={{ uri: currentUser.photoURL }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>
                  {(currentUser?.displayName ?? currentUser?.email ?? '?')[0].toUpperCase()}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Clipboard banner */}
      {clipboardUrl && flow.status === 'idle' && !showContactPicker && (
        <View style={styles.clipboardBanner}>
          <Ionicons name="clipboard-outline" size={18} color="#aaaaaa" />
          <View style={styles.clipboardText}>
            <Text style={styles.clipboardTitle}>Lien musical détecté</Text>
            <Text style={styles.clipboardUrl} numberOfLines={1}>{clipboardUrl}</Text>
          </View>
          <TouchableOpacity style={styles.clipboardConvertBtn} onPress={() => flow.startConversion(clipboardUrl)}>
            <Text style={styles.clipboardConvertBtnText}>Convertir</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setClipboardUrl(null)} style={styles.clipboardDismissBtn}>
            <Ionicons name="close" size={16} color="#555555" />
          </TouchableOpacity>
        </View>
      )}

      {/* Contact picker */}
      {showContactPicker && (
        <View style={styles.pickerContainer}>
          <Text style={styles.pickerTitle}>Envoyer à qui ?</Text>

          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={16} color="#555555" />
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher un contact Chørus…"
              placeholderTextColor="#444444"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
          </View>

          {displayedContacts.map((contact) => (
            <TouchableOpacity
              key={contact.uid}
              style={styles.contactOption}
              onPress={() => handleContactPick(contact)}
              activeOpacity={0.7}
            >
              <View style={styles.contactAvatar}>
                <Text style={styles.contactInitial}>{contact.displayName[0]?.toUpperCase()}</Text>
              </View>
              <View style={styles.contactOptionInfo}>
                <Text style={styles.contactOptionName}>{contact.displayName}</Text>
                <Text style={styles.contactOptionPlatform}>
                  {contact.platform ? PLATFORM_LABELS[contact.platform] : 'Plateforme non définie'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#444444" />
            </TouchableOpacity>
          ))}

          {followedContacts.length === 0 && contactsLoaded && (
            <View style={styles.emptyContacts}>
              <Text style={styles.searchHint}>Tu ne suis encore personne.</Text>
              <TouchableOpacity onPress={() => router.push('/contacts')} style={styles.goToContactsBtn}>
                <Text style={styles.goToContactsBtnText}>Gérer mes contacts</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={styles.selfOption} onPress={() => handleContactPick(null)}>
            <Text style={styles.selfOptionText}>
              Pour moi · {platform ? PLATFORM_LABELS[platform] : 'ma plateforme'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#444444" />
          </TouchableOpacity>

          <TouchableOpacity onPress={handleReset} style={styles.cancelShareBtn}>
            <Text style={styles.cancelShareBtnText}>Annuler</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Loading */}
      {flow.status === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1db954" />
          <Text style={styles.loadingText}>{flow.loadingMsg}</Text>
        </View>
      )}

      {/* Error */}
      {flow.status === 'error' && (
        <View style={styles.center}>
          <Text style={styles.errorText}>Impossible de convertir ce lien.</Text>
          <Text style={styles.errorDetail}>{flow.errorMsg}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleReset}>
            <Text style={styles.retryBtnText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Result */}
      {flow.status === 'success' && flow.result && (
        <View style={styles.card}>
          {!!flow.result.thumbnailUrl && (
            <Image source={{ uri: flow.result.thumbnailUrl }} style={styles.thumbnail} />
          )}
          <Text style={styles.songTitle} numberOfLines={2}>{flow.result.title}</Text>
          <Text style={styles.artist} numberOfLines={1}>{flow.result.artist}</Text>

          {selectedContact && (
            <View style={styles.recipientBadge}>
              <Ionicons name="person-circle-outline" size={16} color="#1db954" />
              <Text style={styles.recipientText}>Pour {selectedContact.displayName}</Text>
            </View>
          )}

          {selectedContact ? (
            convertedForContact ? (
              sending ? (
                <ActivityIndicator color="#1db954" style={{ marginBottom: 12 }} />
              ) : (
                <TouchableOpacity style={styles.primaryBtn} onPress={handleSendToContact} activeOpacity={0.8}>
                  <Ionicons name="paper-plane" size={16} color="#000000" />
                  <Text style={styles.primaryBtnText}>Envoyer à {selectedContact.displayName}</Text>
                </TouchableOpacity>
              )
            ) : (
              <>
                <Text style={styles.noLinkText}>
                  Lien introuvable dans notre base pour {PLATFORM_LABELS[selectedContact.platform ?? 'spotify']}.{'\n'}Cherche-le directement :
                </Text>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => Linking.openURL(getSearchUrl(selectedContact.platform!, flow.result!.title, flow.result!.artist))}
                  activeOpacity={0.8}
                >
                  <Text style={styles.secondaryBtnText}>Rechercher sur {PLATFORM_LABELS[selectedContact.platform ?? 'spotify']}</Text>
                </TouchableOpacity>
              </>
            )
          ) : (
            <>
              {convertedForSelf ? (
                <TouchableOpacity style={styles.primaryBtn} onPress={handleOpen} activeOpacity={0.8}>
                  <Text style={styles.primaryBtnText}>
                    Ouvrir dans {platform ? PLATFORM_LABELS[platform] : "l'app"}
                  </Text>
                </TouchableOpacity>
              ) : platform ? (
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => Linking.openURL(getSearchUrl(platform, flow.result!.title, flow.result!.artist))}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryBtnText}>Rechercher sur {PLATFORM_LABELS[platform]}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleShareSelf} activeOpacity={0.8}>
                <Text style={styles.secondaryBtnText}>Partager</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleCopy} activeOpacity={0.8}>
                <Text style={styles.secondaryBtnText}>{copied ? 'Copié !' : 'Copier le lien'}</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
            <Text style={styles.resetBtnText}>Effacer</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Idle / mosaic or welcome */}
      {flow.status === 'idle' && !showContactPicker && (
        receivedLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#1db954" />
          </View>
        ) : visibleMessages.length > 0 ? (
          <FlatList
            data={visibleMessages}
            keyExtractor={(item) => item.id}
            numColumns={MOSAIC_COLS}
            columnWrapperStyle={styles.mosaicRow}
            contentContainerStyle={styles.mosaicContent}
            style={styles.mosaicList}
            renderItem={({ item }) => (
              <View style={styles.mosaicCell}>
                <TouchableOpacity
                  onPress={() => Linking.openURL(item.convertedUrl)}
                  activeOpacity={0.85}
                >
                  <Image
                    source={{ uri: item.thumbnailUrl }}
                    style={styles.mosaicThumb}
                  />
                  <View style={styles.mosaicInfo}>
                    <Text style={styles.mosaicTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.mosaicSender} numberOfLines={1}>{item.senderName}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.mosaicDismissBtn}
                  onPress={() => handleDismiss(item.id)}
                  hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                >
                  <Ionicons name="close" size={13} color="#ffffff" />
                </TouchableOpacity>
              </View>
            )}
          />
        ) : (
          <View style={styles.center}>
            <Text style={styles.welcomeTitle}>Comment ça marche</Text>
            <View style={styles.steps}>
              <View style={styles.step}>
                <View style={styles.stepBadge}><Text style={styles.stepNumber}>1</Text></View>
                <View style={styles.stepBody}>
                  <Text style={styles.stepTitle}>Trouve un morceau</Text>
                  <Text style={styles.stepDesc}>Dans Spotify, Apple Music, Deezer…</Text>
                </View>
              </View>
              <View style={styles.stepConnector} />
              <View style={styles.step}>
                <View style={styles.stepBadge}><Text style={styles.stepNumber}>2</Text></View>
                <View style={styles.stepBody}>
                  <Text style={styles.stepTitle}>Partage vers Chørus</Text>
                  <Text style={styles.stepDesc}>Tape <Text style={styles.bold}>Partager</Text> → choisis <Text style={styles.bold}>Chørus</Text>.</Text>
                </View>
              </View>
              <View style={styles.stepConnector} />
              <View style={styles.step}>
                <View style={styles.stepBadge}><Text style={styles.stepNumber}>3</Text></View>
                <View style={styles.stepBody}>
                  <Text style={styles.stepTitle}>Choisis un ami</Text>
                  <Text style={styles.stepDesc}>Il reçoit le lien converti vers <Text style={styles.accent}>sa plateforme</Text>.</Text>
                </View>
              </View>
            </View>
          </View>
        )
      )}

      {/* Undo toast */}
      {lastDismissedId && (
        <View style={[styles.undoToast, { bottom: insets.bottom + 16 }]}>
          <Text style={styles.undoToastText}>Morceau masqué</Text>
          <TouchableOpacity onPress={handleUndismiss} style={styles.undoBtn}>
            <Text style={styles.undoBtnText}>Annuler</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d', paddingHorizontal: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  appName: { fontSize: 28, fontWeight: '800', color: '#ffffff', letterSpacing: -0.5 },
  headerActions: { flexDirection: 'row', gap: 16 },
  iconBtn: { padding: 4 },
  avatarBtn: { marginLeft: 4 },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  avatarFallback: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#1db95430', borderWidth: 1.5, borderColor: '#1db954',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { color: '#1db954', fontSize: 14, fontWeight: '700' },
  clipboardBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a',
    borderRadius: 12, padding: 12, marginBottom: 16, gap: 10, borderWidth: 1, borderColor: '#2a2a2a',
  },
  clipboardText: { flex: 1, minWidth: 0 },
  clipboardTitle: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  clipboardUrl: { color: '#555555', fontSize: 11, marginTop: 1 },
  clipboardConvertBtn: { backgroundColor: '#1db954', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  clipboardConvertBtnText: { color: '#000000', fontSize: 12, fontWeight: '700' },
  clipboardDismissBtn: { padding: 4 },
  pickerContainer: { flex: 1 },
  pickerTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff', marginBottom: 16 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#1a1a1a', borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, marginBottom: 16, borderWidth: 1, borderColor: '#2a2a2a',
  },
  searchInput: { flex: 1, color: '#ffffff', fontSize: 15 },
  searchHint: { color: '#333333', fontSize: 13, textAlign: 'center', marginTop: 8, marginBottom: 8 },
  emptyContacts: { alignItems: 'center', marginTop: 8 },
  goToContactsBtn: { marginTop: 8, paddingVertical: 8, paddingHorizontal: 16 },
  goToContactsBtnText: { color: '#1db954', fontSize: 13, fontWeight: '600' },
  contactOption: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a',
    borderRadius: 14, padding: 14, marginBottom: 10, gap: 14,
  },
  contactAvatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#1db95420', borderWidth: 1.5, borderColor: '#1db95440',
    alignItems: 'center', justifyContent: 'center',
  },
  contactInitial: { color: '#1db954', fontSize: 18, fontWeight: '700' },
  contactOptionInfo: { flex: 1 },
  contactOptionName: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  contactOptionPlatform: { color: '#666666', fontSize: 12, marginTop: 2 },
  selfOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#2a2a2a',
  },
  selfOptionText: { color: '#888888', fontSize: 14, fontWeight: '500' },
  cancelShareBtn: { alignItems: 'center', paddingVertical: 14 },
  cancelShareBtnText: { color: '#444444', fontSize: 14 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 16, color: '#888888', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  errorText: { color: '#ff5555', fontSize: 18, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  errorDetail: { color: '#888888', fontSize: 13, textAlign: 'center', marginBottom: 24 },
  retryBtn: { paddingHorizontal: 28, paddingVertical: 12, backgroundColor: '#1a1a1a', borderRadius: 10 },
  retryBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  card: { backgroundColor: '#1a1a1a', borderRadius: 20, padding: 24, alignItems: 'center', marginTop: 8 },
  thumbnail: { width: 160, height: 160, borderRadius: 12, marginBottom: 20, backgroundColor: '#2a2a2a' },
  songTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff', textAlign: 'center', marginBottom: 6 },
  artist: { fontSize: 15, color: '#888888', textAlign: 'center', marginBottom: 16 },
  recipientBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1db95415', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 20,
  },
  recipientText: { color: '#1db954', fontSize: 13, fontWeight: '600' },
  primaryBtn: {
    backgroundColor: '#1db954', borderRadius: 30, paddingHorizontal: 36, paddingVertical: 14,
    width: '100%', alignItems: 'center', marginBottom: 12, flexDirection: 'row', justifyContent: 'center', gap: 8,
  },
  primaryBtnText: { color: '#000000', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    backgroundColor: '#2a2a2a', borderRadius: 30, paddingHorizontal: 36, paddingVertical: 14,
    width: '100%', alignItems: 'center', marginBottom: 12,
  },
  secondaryBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  noLinkText: { color: '#888888', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  resetBtn: { padding: 8, marginTop: 4 },
  resetBtnText: { color: '#555555', fontSize: 13 },
  mosaicList: { marginHorizontal: -(24 - MOSAIC_SIDE) },
  mosaicContent: { paddingBottom: 16 },
  mosaicRow: { gap: MOSAIC_GAP, marginBottom: MOSAIC_GAP },
  mosaicCell: { width: CELL_SIZE, borderRadius: 8, overflow: 'hidden', backgroundColor: '#1a1a1a', position: 'relative' },
  mosaicDismissBtn: {
    position: 'absolute', top: 5, right: 5,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  mosaicThumb: { width: CELL_SIZE, height: CELL_SIZE, backgroundColor: '#2a2a2a' },
  mosaicInfo: { padding: 6 },
  mosaicTitle: { color: '#ffffff', fontSize: 11, fontWeight: '600' },
  mosaicSender: { color: '#555555', fontSize: 10, marginTop: 2 },
  welcomeTitle: { fontSize: 22, fontWeight: '700', color: '#ffffff', marginBottom: 32, textAlign: 'center' },
  steps: { width: '100%' },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  stepConnector: { width: 2, height: 20, backgroundColor: '#2a2a2a', marginLeft: 18 },
  stepBadge: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#1a1a1a',
    borderWidth: 1.5, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stepNumber: { color: '#888888', fontSize: 14, fontWeight: '700' },
  stepBody: { flex: 1, paddingBottom: 4 },
  stepTitle: { fontSize: 15, fontWeight: '600', color: '#ffffff', marginBottom: 3 },
  stepDesc: { fontSize: 13, color: '#666666', lineHeight: 19 },
  bold: { color: '#aaaaaa', fontWeight: '600' },
  accent: { color: '#1db954', fontWeight: '600' },
  undoToast: {
    position: 'absolute', left: 24, right: 24,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#2a2a2a', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16,
  },
  undoToastText: { color: '#aaaaaa', fontSize: 14 },
  undoBtn: { paddingVertical: 4, paddingHorizontal: 10 },
  undoBtnText: { color: '#1db954', fontSize: 14, fontWeight: '700' },
});
