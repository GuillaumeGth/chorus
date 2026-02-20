import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth } from '../src/config/firebase';
import type { Chat } from '../src/services/firestore';
import { subscribeToChats } from '../src/services/firestore';

export default function ChatsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [chats, setChats] = useState<Chat[]>([]);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) return;
    return subscribeToChats(uid, setChats);
  }, [uid]);

  function getOtherParticipant(chat: Chat) {
    const otherId = chat.participants.find((p) => p !== uid);
    return otherId ? chat.participantInfo[otherId] : null;
  }

  function renderChat({ item }: { item: Chat }) {
    const other = getOtherParticipant(item);
    if (!other) return null;
    return (
      <TouchableOpacity
        style={styles.chatRow}
        onPress={() => router.push(`/chat/${item.id}`)}
        activeOpacity={0.7}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{other.displayName[0]?.toUpperCase()}</Text>
        </View>
        <View style={styles.chatInfo}>
          <Text style={styles.chatName}>{other.displayName}</Text>
          {item.lastMessage ? (
            <Text style={styles.chatPreview} numberOfLines={1}>
              {item.lastMessage.title} — {item.lastMessage.artist}
            </Text>
          ) : (
            <Text style={styles.chatPreview}>Nouvelle conversation</Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={16} color="#333333" />
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={16} color="#1db954" />
          <Text style={styles.backBtnText}>Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Conversations</Text>
      </View>

      <FlatList
        data={chats}
        keyExtractor={(item) => item.id}
        renderItem={renderChat}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={48} color="#333333" style={{ marginBottom: 16 }} />
            <Text style={styles.emptyText}>
              Aucune conversation.{'\n'}Partage un morceau pour commencer !
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  header: { paddingHorizontal: 24, marginBottom: 16 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 16 },
  backBtnText: { color: '#1db954', fontSize: 15, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '700', color: '#ffffff' },
  list: { paddingHorizontal: 24, paddingBottom: 24 },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1db95420',
    borderWidth: 1.5,
    borderColor: '#1db95440',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#1db954', fontSize: 18, fontWeight: '700' },
  chatInfo: { flex: 1 },
  chatName: { color: '#ffffff', fontSize: 15, fontWeight: '600', marginBottom: 3 },
  chatPreview: { color: '#555555', fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyText: { color: '#444444', fontSize: 15, textAlign: 'center', lineHeight: 22 },
});
