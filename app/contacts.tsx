import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PlatformKey } from '../src/services/odesli';
import type { FollowEntry } from '../src/services/firestore';
import { useFollowing } from '../src/hooks/useFollowing';

const PLATFORM_LABELS: Record<PlatformKey, string> = {
  spotify: 'Spotify',
  appleMusic: 'Apple Music',
  youtubeMusic: 'YouTube Music',
  deezer: 'Deezer',
  tidal: 'Tidal',
};

export default function ContactsScreen() {
  const { contacts, loading, refresh } = useFollowing();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  function renderContact({ item }: { item: FollowEntry }) {
    return (
      <View style={styles.contactRow}>
        <View style={styles.contactAvatar}>
          <Text style={styles.contactInitial}>{item.displayName[0]?.toUpperCase()}</Text>
        </View>
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{item.displayName}</Text>
          <Text style={styles.contactPlatform}>
            {item.platform ? PLATFORM_LABELS[item.platform] : 'Plateforme non définie'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={16} color="#1db954" />
          <Text style={styles.backBtnText}>Retour</Text>
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Mes contacts</Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => router.push('/search')}
            activeOpacity={0.7}
          >
            <Ionicons name="person-add-outline" size={20} color="#1db954" />
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>Les personnes que tu suis sur Chorüs.</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#1db954" />
        </View>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(item) => item.uid}
          renderItem={renderContact}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="people-outline" size={48} color="#333333" style={{ marginBottom: 16 }} />
              <Text style={styles.emptyText}>Tu ne suis encore personne.</Text>
              <TouchableOpacity
                style={styles.findBtn}
                onPress={() => router.push('/search')}
                activeOpacity={0.8}
              >
                <Text style={styles.findBtnText}>Trouver des amis</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d', paddingHorizontal: 24 },
  header: { marginBottom: 24 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 16 },
  backBtnText: { color: '#1db954', fontSize: 15, fontWeight: '600' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 26, fontWeight: '700', color: '#ffffff' },
  addBtn: { padding: 4 },
  subtitle: { fontSize: 14, color: '#888888' },
  centered: { alignItems: 'center', paddingTop: 60 },
  list: { paddingBottom: 24 },
  emptyText: { color: '#444444', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  findBtn: {
    backgroundColor: '#1db954', borderRadius: 24,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  findBtnText: { color: '#000000', fontSize: 14, fontWeight: '700' },
  contactRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a',
    borderRadius: 14, padding: 14, marginBottom: 10, gap: 14,
  },
  contactAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1db95420', borderWidth: 1.5, borderColor: '#1db95440',
    alignItems: 'center', justifyContent: 'center',
  },
  contactInitial: { color: '#1db954', fontSize: 17, fontWeight: '700' },
  contactInfo: { flex: 1 },
  contactName: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  contactPlatform: { color: '#666666', fontSize: 12, marginTop: 2 },
});
