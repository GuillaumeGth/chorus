import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth } from '../../src/config/firebase';
import type { Chat, ChatMessage, ReactionType } from '../../src/services/firestore';
import { subscribeToMessages, subscribeToChats, setMessageReaction, REACTIONS } from '../../src/services/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlatformKey } from '../../src/services/odesli';
import { fetchLinks } from '../../src/services/odesli';
import { usePlatformPreference } from '../../src/hooks/usePlatformPreference';

const PLATFORM_LABELS: Record<string, string> = {
  spotify: 'Spotify',
  appleMusic: 'Apple Music',
  youtubeMusic: 'YouTube Music',
  deezer: 'Deezer',
  tidal: 'Tidal',
};

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const uid = auth.currentUser?.uid;
  const listRef = useRef<FlatList>(null);
  const { platform: myPlatform } = usePlatformPreference();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chat, setChat] = useState<Chat | null>(null);
  const [subError, setSubError] = useState<string | null>(null);
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [pickerMsgId, setPickerMsgId] = useState<string | null>(null);
  const [localReactions, setLocalReactions] = useState<Record<string, ReactionType | null>>({});

  const pickerMsg = pickerMsgId ? messages.find((m) => m.id === pickerMsgId) ?? null : null;

  useEffect(() => {
    if (!id) return;
    setSubError(null);
    const unsub = subscribeToMessages(
      id,
      (msgs) => {
        setMessages(msgs);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      },
      (error) => setSubError(error.message)
    );
    return unsub;
  }, [id]);

  // Get chat info for the header name
  useEffect(() => {
    if (!uid || !id) return;
    const unsub = subscribeToChats(uid, (chats) => {
      const found = chats.find((c) => c.id === id);
      if (found) setChat(found);
    });
    return unsub;
  }, [uid, id]);

  const otherName = chat
    ? chat.participantInfo[chat.participants.find((p) => p !== uid) ?? '']?.displayName
    : '';

  function getAllReactions(item: ChatMessage): ReactionType[] {
    const base: Record<string, ReactionType> = { ...(item.reactions ?? {}) };
    if (item.id in localReactions) {
      const local = localReactions[item.id];
      if (local === null) delete base[uid ?? ''];
      else if (uid) base[uid] = local;
    }
    return [...new Set(Object.values(base))] as ReactionType[];
  }

  async function handleReact(msg: ChatMessage, reaction: ReactionType | null) {
    if (!uid || !id) return;
    setLocalReactions((prev) => ({ ...prev, [msg.id]: reaction }));
    setPickerMsgId(null);
    try {
      await setMessageReaction(id, msg.id, uid, reaction);
    } catch {
      setLocalReactions((prev) => {
        const next = { ...prev };
        delete next[msg.id];
        return next;
      });
    }
  }

  async function handleListen(item: ChatMessage) {
    // Always read the freshest platform preference in case it changed since mount
    const stored = await AsyncStorage.getItem('@chorus/platform');
    const activePlatform = (stored as PlatformKey | null) ?? myPlatform;

    // Already have the right platform link stored
    if (activePlatform && item.platformLinks?.[activePlatform]) {
      Linking.openURL(item.platformLinks[activePlatform]!);
      return;
    }
    // Fallback: re-fetch all platform links from Odesli using originalUrl
    if (activePlatform && item.originalUrl) {
      setFetchingId(item.id);
      try {
        const result = await fetchLinks(item.originalUrl);
        const url = result.platformLinks[activePlatform] ?? item.convertedUrl;
        Linking.openURL(url);
      } catch {
        Linking.openURL(item.convertedUrl);
      } finally {
        setFetchingId(null);
      }
      return;
    }
    Linking.openURL(item.convertedUrl);
  }

  function renderMessage({ item }: { item: ChatMessage }) {
    const isMe = item.senderId === uid;
    const listenPlatform = myPlatform ?? item.targetPlatform;
    const isLoading = fetchingId === item.id;
    const allReactions = getAllReactions(item);
    return (
      <View style={[styles.msgWrapper, isMe ? styles.msgWrapperMe : styles.msgWrapperOther]}>
        <TouchableOpacity activeOpacity={1} onLongPress={() => setPickerMsgId(item.id)}>
          <View style={[styles.card, isMe ? styles.cardMe : styles.cardOther]}>
            <View style={styles.cardRow}>
              {!!item.thumbnailUrl && (
                <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} />
              )}
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.songTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.artist} numberOfLines={1}>{item.artist}</Text>
            </View>
            <TouchableOpacity
              style={styles.listenBtn}
              onPress={() => handleListen(item)}
              activeOpacity={0.8}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <Ionicons name="play-circle" size={16} color="#000000" />
              )}
              <Text style={styles.listenBtnText}>
                Écouter sur {PLATFORM_LABELS[listenPlatform] ?? listenPlatform}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
        {allReactions.length > 0 && (
          <View style={styles.reactionRow}>
            {allReactions.map((type) => (
              <View key={type} style={styles.reactionBadge}>
                <Text style={styles.reactionBadgeEmoji}>
                  {REACTIONS.find((r) => r.type === type)?.emoji}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#1db954" />
        </TouchableOpacity>
        <View style={styles.headerAvatar}>
          <Text style={styles.headerAvatarText}>{otherName?.[0]?.toUpperCase()}</Text>
        </View>
        <Text style={styles.headerName}>{otherName}</Text>
      </View>

      {!!subError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>Erreur Firestore : {subError}</Text>
        </View>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        extraData={localReactions}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              Partage un morceau depuis ton app de musique pour démarrer !
            </Text>
          </View>
        }
      />

      <Modal
        visible={pickerMsgId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerMsgId(null)}
      >
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setPickerMsgId(null)}
        >
          <View style={styles.pickerCard}>
            {pickerMsg && (
              <>
                <Text style={styles.pickerCardTitle} numberOfLines={1}>{pickerMsg.title}</Text>
                <Text style={styles.pickerCardArtist} numberOfLines={1}>{pickerMsg.artist}</Text>
                <View style={styles.pickerRow}>
                  {REACTIONS.map(({ type, emoji, label }) => {
                    const isActive = getMyReaction(pickerMsg) === type;
                    return (
                      <TouchableOpacity
                        key={type}
                        style={[styles.pickerBtn, isActive && styles.pickerBtnActive]}
                        onPress={() => handleReact(pickerMsg, isActive ? null : type)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.pickerBtnEmoji}>{emoji}</Text>
                        <Text style={[styles.pickerBtnLabel, isActive && styles.pickerBtnLabelActive]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1db95420',
    borderWidth: 1.5,
    borderColor: '#1db95440',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: { color: '#1db954', fontSize: 15, fontWeight: '700' },
  headerName: { color: '#ffffff', fontSize: 17, fontWeight: '600' },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  msgWrapper: { marginBottom: 16, maxWidth: '85%' },
  msgWrapperMe: { alignSelf: 'flex-end' },
  msgWrapperOther: { alignSelf: 'flex-start' },
  card: { borderRadius: 16, overflow: 'hidden' },
  cardMe: { backgroundColor: '#1a2e1e', borderWidth: 1, borderColor: '#1db95430' },
  cardOther: { backgroundColor: '#1a1a1a' },
  cardRow: { alignItems: 'flex-start', paddingTop: 8, paddingHorizontal: 10 },
  thumbnail: { width: 75, height: 75, borderRadius: 8, backgroundColor: '#2a2a2a' },
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: -10,
    marginBottom: 4,
    paddingRight: 6,
    gap: 4,
  },
  reactionBadge: {
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1.5,
    borderColor: '#0d0d0d',
  },
  reactionBadgeEmoji: { fontSize: 16 },
  cardInfo: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 },
  songTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  artist: {
    color: '#666666',
    fontSize: 12,
  },
  listenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1db954',
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 13,
  },
  listenBtnText: { color: '#000000', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  empty: { flex: 1, alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#444444', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  errorBanner: { backgroundColor: '#2d0000', borderRadius: 8, marginHorizontal: 16, marginBottom: 8, padding: 10 },
  errorBannerText: { color: '#ff5555', fontSize: 12, textAlign: 'center' },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  pickerCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  pickerCardTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  pickerCardArtist: {
    color: '#666666',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
  },
  pickerRow: { flexDirection: 'row', justifyContent: 'space-around' },
  pickerBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    minWidth: 60,
  },
  pickerBtnActive: { backgroundColor: '#2a2a2a' },
  pickerBtnEmoji: { fontSize: 34, marginBottom: 6 },
  pickerBtnLabel: { color: '#555555', fontSize: 11, fontWeight: '500' },
  pickerBtnLabelActive: { color: '#1db954' },
});
