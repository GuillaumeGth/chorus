import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlaylists } from '../src/hooks/usePlaylists';
import type { Playlist } from '../src/services/playlists';

function PlaylistItem({ item, onPress }: { item: Playlist; onPress: () => void }) {
  const memberCount = item.memberUids.length;
  return (
    <TouchableOpacity style={styles.item} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.itemCover}>
        {item.lastTrack?.thumbnailUrl ? (
          <Image source={{ uri: item.lastTrack.thumbnailUrl }} style={styles.itemThumb} />
        ) : (
          <View style={styles.itemThumbPlaceholder}>
            <Ionicons name="musical-notes" size={28} color="#333333" />
          </View>
        )}
      </View>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
        {item.description ? (
          <Text style={styles.itemDesc} numberOfLines={1}>{item.description}</Text>
        ) : null}
        <View style={styles.itemMeta}>
          <Text style={styles.itemMetaText}>
            {item.trackCount} {item.trackCount === 1 ? 'morceau' : 'morceaux'}
          </Text>
          <Text style={styles.itemMetaDot}>·</Text>
          <Text style={styles.itemMetaText}>
            {memberCount} {memberCount === 1 ? 'membre' : 'membres'}
          </Text>
        </View>
        {item.lastTrack && (
          <Text style={styles.itemLastTrack} numberOfLines={1}>
            {item.lastTrack.title} — {item.lastTrack.artist}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color="#444444" />
    </TouchableOpacity>
  );
}

export default function PlaylistsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { playlists, loading } = usePlaylists();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.title}>Mes playlists</Text>
        <TouchableOpacity onPress={() => router.push('/playlist/new')} style={styles.addBtn}>
          <Ionicons name="add" size={26} color="#1db954" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1db954" />
        </View>
      ) : playlists.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="albums-outline" size={56} color="#2a2a2a" />
          <Text style={styles.emptyTitle}>Aucune playlist</Text>
          <Text style={styles.emptyDesc}>Crée ta première playlist collaborative.</Text>
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => router.push('/playlist/new')}
            activeOpacity={0.8}
          >
            <Text style={styles.createBtnText}>Créer une playlist</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
          renderItem={({ item }) => (
            <PlaylistItem
              item={item}
              onPress={() => router.push(`/playlist/${item.id}`)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  backBtn: { padding: 4, marginRight: 12 },
  title: { flex: 1, fontSize: 22, fontWeight: '700', color: '#ffffff' },
  addBtn: { padding: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#ffffff', marginTop: 8 },
  emptyDesc: { fontSize: 14, color: '#555555', textAlign: 'center' },
  createBtn: {
    marginTop: 8,
    backgroundColor: '#1db954',
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  createBtnText: { color: '#000000', fontSize: 15, fontWeight: '700' },
  listContent: { paddingHorizontal: 20, paddingTop: 4 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 14,
  },
  itemCover: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#2a2a2a',
    flexShrink: 0,
  },
  itemThumb: { width: 56, height: 56 },
  itemThumbPlaceholder: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  itemInfo: { flex: 1, minWidth: 0 },
  itemName: { color: '#ffffff', fontSize: 15, fontWeight: '600', marginBottom: 2 },
  itemDesc: { color: '#666666', fontSize: 12, marginBottom: 4 },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  itemMetaText: { color: '#555555', fontSize: 11 },
  itemMetaDot: { color: '#333333', fontSize: 11 },
  itemLastTrack: { color: '#444444', fontSize: 11, fontStyle: 'italic' },
});
