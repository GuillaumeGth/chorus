import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth } from '../src/config/firebase';
import type { PlatformKey } from '../src/services/odesli';
import type { UserProfile } from '../src/services/firestore';
import {
  followUser,
  isFollowing,
  searchUsers,
  unfollowUser,
} from '../src/services/firestore';

const PLATFORM_LABELS: Record<PlatformKey, string> = {
  spotify: 'Spotify',
  appleMusic: 'Apple Music',
  youtubeMusic: 'YouTube Music',
  deezer: 'Deezer',
  tidal: 'Tidal',
};

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const currentUser = auth.currentUser;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [followState, setFollowState] = useState<Record<string, boolean>>({});
  const [loadingFollow, setLoadingFollow] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!query.trim() || !currentUser) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const users = await searchUsers(query, currentUser.uid);
        setResults(users);
        const states: Record<string, boolean> = {};
        await Promise.all(
          users.map(async (u) => {
            states[u.uid] = await isFollowing(currentUser.uid, u.uid);
          })
        );
        setFollowState(states);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, currentUser]);

  async function handleToggleFollow(user: UserProfile) {
    if (!currentUser) return;
    setLoadingFollow((prev) => ({ ...prev, [user.uid]: true }));
    try {
      if (followState[user.uid]) {
        await unfollowUser(currentUser.uid, user.uid);
        setFollowState((prev) => ({ ...prev, [user.uid]: false }));
      } else {
        await followUser(currentUser.uid, user);
        setFollowState((prev) => ({ ...prev, [user.uid]: true }));
      }
    } finally {
      setLoadingFollow((prev) => ({ ...prev, [user.uid]: false }));
    }
  }

  function renderUser({ item }: { item: UserProfile }) {
    const followed = followState[item.uid] ?? false;
    const pending = loadingFollow[item.uid] ?? false;

    return (
      <View style={styles.userRow}>
        <View style={styles.userAvatar}>
          <Text style={styles.userInitial}>{item.displayName[0]?.toUpperCase()}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.displayName}</Text>
          <Text style={styles.userPlatform}>
            {item.platform ? PLATFORM_LABELS[item.platform] : 'Plateforme non définie'}
          </Text>
        </View>
        {pending ? (
          <ActivityIndicator size="small" color="#1db954" />
        ) : (
          <TouchableOpacity
            style={[styles.followBtn, followed && styles.followBtnActive]}
            onPress={() => handleToggleFollow(item)}
            activeOpacity={0.7}
          >
            <Text style={[styles.followBtnText, followed && styles.followBtnTextActive]}>
              {followed ? 'Suivi' : 'Suivre'}
            </Text>
          </TouchableOpacity>
        )}
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
        <Text style={styles.title}>Trouver des amis</Text>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={16} color="#555555" />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher par nom…"
          placeholderTextColor="#444444"
          value={query}
          onChangeText={setQuery}
          autoFocus
          autoCapitalize="none"
        />
        {searching && <ActivityIndicator size="small" color="#555555" />}
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.uid}
        renderItem={renderUser}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          query.trim() ? (
            searching ? null : (
              <Text style={styles.emptyText}>Aucun résultat pour "{query}"</Text>
            )
          ) : (
            <Text style={styles.emptyText}>Tape un nom pour rechercher</Text>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d', paddingHorizontal: 24 },
  header: { marginBottom: 20 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 16 },
  backBtnText: { color: '#1db954', fontSize: 15, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '700', color: '#ffffff' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#1a1a1a', borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, marginBottom: 16, borderWidth: 1, borderColor: '#2a2a2a',
  },
  searchInput: { flex: 1, color: '#ffffff', fontSize: 15 },
  list: { paddingBottom: 24 },
  userRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a',
    borderRadius: 14, padding: 14, marginBottom: 10, gap: 14,
  },
  userAvatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#1db95420', borderWidth: 1.5, borderColor: '#1db95440',
    alignItems: 'center', justifyContent: 'center',
  },
  userInitial: { color: '#1db954', fontSize: 18, fontWeight: '700' },
  userInfo: { flex: 1 },
  userName: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  userPlatform: { color: '#666666', fontSize: 12, marginTop: 2 },
  followBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#1db954',
  },
  followBtnActive: { backgroundColor: '#1db95420' },
  followBtnText: { color: '#1db954', fontSize: 13, fontWeight: '600' },
  followBtnTextActive: { color: '#1db954' },
  emptyText: { color: '#444444', fontSize: 14, textAlign: 'center', marginTop: 40 },
});
