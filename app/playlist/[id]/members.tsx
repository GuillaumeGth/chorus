/**
 * Members screen — /playlist/:id/members
 *
 * Sections:
 *   1. Member list — avatar, name, role badge; owner can change role or remove
 *   2. Invite section (owner only) — search Chorus users + send invitation with role
 *
 * Authorization:
 *   - Only members can reach this screen (enforced by Firestore rules).
 *   - Owner-only actions (role change, remove, invite) are gated client-side
 *     and enforced server-side in the service layer.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../../src/config/firebase';
import type { UserProfile } from '../../../src/services/firestore';
import { searchUsers } from '../../../src/services/firestore';
import type { Playlist, PlaylistRole } from '../../../src/services/playlists';
import {
  removeMember,
  sendInvitation,
  subscribeToPlaylist,
  updateMemberRole,
} from '../../../src/services/playlists';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<PlaylistRole, string> = {
  owner:  'Propriétaire',
  editor: 'Éditeur',
  viewer: 'Lecteur',
};

const ROLE_COLORS: Record<PlaylistRole, string> = {
  owner:  '#1db954',
  editor: '#f0a500',
  viewer: '#888888',
};

const KEYBOARD_BEHAVIOR = Platform.OS === 'ios' ? 'padding' : 'height' as const;
const SEARCH_DEBOUNCE_MS = 300;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemberRow {
  uid:         string;
  displayName: string;
  photoURL:    string | null;
  role:        PlaylistRole;
}

// ---------------------------------------------------------------------------
// Small sub-components
// ---------------------------------------------------------------------------

interface AvatarProps {
  photoURL:    string | null;
  displayName: string;
  size:        number;
}

const Avatar = ({ photoURL, displayName, size }: AvatarProps) => {
  const style = { width: size, height: size, borderRadius: size / 2 };
  if (photoURL) {
    return <Image source={{ uri: photoURL }} style={[styles.avatarImg, style]} />;
  }
  return (
    <View style={[styles.avatarPlaceholder, style]}>
      <Text style={[styles.avatarInitial, { fontSize: size * 0.4 }]}>
        {displayName[0]?.toUpperCase() ?? '?'}
      </Text>
    </View>
  );
};

// ---------------------------------------------------------------------------
// MembersScreen
// ---------------------------------------------------------------------------

export default function MembersScreen() {
  const { id: playlistId } = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const uid      = auth.currentUser?.uid ?? '';

  const [playlist,        setPlaylist]        = useState<Playlist | null>(null);
  const [searchQuery,     setSearchQuery]      = useState('');
  const [searchResults,   setSearchResults]    = useState<UserProfile[]>([]);
  const [searching,       setSearching]        = useState(false);
  const [inviteRole,      setInviteRole]       = useState<'editor' | 'viewer'>('viewer');
  const [loadingAction,   setLoadingAction]    = useState<string | null>(null);
  // UIDs for which an invitation was sent in this session — shows "Envoyé" button
  const [invitedUids,     setInvitedUids]      = useState<string[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Real-time subscription to playlist
  useEffect(() => {
    if (!playlistId) return;
    return subscribeToPlaylist(playlistId, setPlaylist);
  }, [playlistId]);

  // Debounced user search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const users = await searchUsers(searchQuery, uid);
        // Exclude current members
        const memberUids = playlist?.memberUids ?? [];
        setSearchResults(users.filter((u) => !memberUids.includes(u.uid)));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery, playlist?.memberUids, uid]);

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

  const myRole: PlaylistRole = playlist?.members[uid] ?? 'viewer';
  const isOwner = myRole === 'owner';

  const members: MemberRow[] = playlist
    ? playlist.memberUids.map((memberUid) => ({
        uid:         memberUid,
        displayName: playlist.memberInfo[memberUid]?.displayName ?? 'Inconnu',
        photoURL:    playlist.memberInfo[memberUid]?.photoURL ?? null,
        role:        playlist.members[memberUid] ?? 'viewer',
      })).sort((a, b) => {
        const order: Record<PlaylistRole, number> = { owner: 0, editor: 1, viewer: 2 };
        return order[a.role] - order[b.role];
      })
    : [];

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleChangeRole = useCallback(async (targetUid: string, currentRole: PlaylistRole) => {
    if (!playlistId || currentRole === 'owner') return;
    const newRole: 'editor' | 'viewer' = currentRole === 'editor' ? 'viewer' : 'editor';
    setLoadingAction(targetUid);
    try {
      await updateMemberRole(playlistId, targetUid, newRole);
    } catch {
      Alert.alert('Erreur', 'Impossible de modifier le rôle.');
    } finally {
      setLoadingAction(null);
    }
  }, [playlistId]);

  const handleRemoveMember = useCallback((targetUid: string, name: string) => {
    if (!playlistId) return;
    Alert.alert(
      'Retirer le membre',
      `Retirer ${name} de la playlist ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: async () => {
            setLoadingAction(targetUid);
            try {
              await removeMember(playlistId, targetUid);
            } catch {
              Alert.alert('Erreur', 'Impossible de retirer ce membre.');
            } finally {
              setLoadingAction(null);
            }
          },
        },
      ],
    );
  }, [playlistId]);

  const handleInvite = useCallback(async (target: UserProfile) => {
    if (!playlistId || !playlist) return;
    const user = auth.currentUser;
    if (!user) return;
    setLoadingAction(`invite-${target.uid}`);
    try {
      await sendInvitation(
        playlistId,
        playlist.name,
        user.uid,
        user.displayName ?? user.email ?? '',
        user.photoURL ?? null,
        target.uid,
        inviteRole,
      );
      setInvitedUids((prev) => [...prev, target.uid]);
      setSearchQuery('');
      setSearchResults([]);
    } catch {
      Alert.alert('Erreur', 'Impossible d\'envoyer l\'invitation.');
    } finally {
      setLoadingAction(null);
    }
  }, [playlistId, playlist, inviteRole]);

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const renderMember = useCallback(({ item }: { item: MemberRow }) => {
    const isMe     = item.uid === uid;
    const loading  = loadingAction === item.uid;

    return (
      <View style={styles.memberRow}>
        <Avatar photoURL={item.photoURL} displayName={item.displayName} size={42} />
        <View style={styles.memberInfo}>
          <Text style={styles.memberName} numberOfLines={1}>
            {item.displayName}{isMe ? ' (vous)' : ''}
          </Text>
          <View style={[styles.roleBadge, { backgroundColor: `${ROLE_COLORS[item.role]}20` }]}>
            <Text style={[styles.roleBadgeText, { color: ROLE_COLORS[item.role] }]}>
              {ROLE_LABELS[item.role]}
            </Text>
          </View>
        </View>
        {isOwner && item.role !== 'owner' && (
          loading ? (
            <ActivityIndicator size="small" color="#888888" />
          ) : (
            <View style={styles.memberActions}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleChangeRole(item.uid, item.role)}
                testID={`role-btn-${item.uid}`}
              >
                <Ionicons
                  name={item.role === 'editor' ? 'eye-outline' : 'create-outline'}
                  size={18}
                  color="#888888"
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleRemoveMember(item.uid, item.displayName)}
                testID={`remove-btn-${item.uid}`}
              >
                <Ionicons name="person-remove-outline" size={18} color="#ff4444" />
              </TouchableOpacity>
            </View>
          )
        )}
      </View>
    );
  }, [uid, isOwner, loadingAction, handleChangeRole, handleRemoveMember]);

  const renderSearchResult = useCallback(({ item }: { item: UserProfile }) => {
    const loading  = loadingAction === `invite-${item.uid}`;
    const sent     = invitedUids.includes(item.uid);
    return (
      <View style={styles.memberRow}>
        <Avatar photoURL={item.photoURL ?? null} displayName={item.displayName} size={42} />
        <View style={styles.memberInfo}>
          <Text style={styles.memberName} numberOfLines={1}>{item.displayName}</Text>
          <Text style={styles.memberSub} numberOfLines={1}>{item.email}</Text>
        </View>
        {loading ? (
          <ActivityIndicator size="small" color="#1db954" />
        ) : sent ? (
          <View style={[styles.inviteBtn, styles.inviteBtnSent]}>
            <Ionicons name="checkmark" size={16} color="#888888" />
            <Text style={[styles.inviteBtnText, { color: '#888888' }]}>Envoyé</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.inviteBtn}
            onPress={() => handleInvite(item)}
            testID={`invite-btn-${item.uid}`}
          >
            <Ionicons name="person-add-outline" size={16} color="#1db954" />
            <Text style={styles.inviteBtnText}>Inviter</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [loadingAction, invitedUids, handleInvite]);

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (!playlist) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ActivityIndicator color="#1db954" />
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <KeyboardAvoidingView style={styles.container} behavior={KEYBOARD_BEHAVIOR}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={16} color="#1db954" />
            <Text style={styles.backBtnText}>Retour</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Membres</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{playlist.name}</Text>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Members list                                                     */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{members.length} membre{members.length > 1 ? 's' : ''}</Text>
          <FlatList
            data={members}
            keyExtractor={(item) => item.uid}
            renderItem={renderMember}
            scrollEnabled={false}
          />
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Invite section (owner only)                                      */}
        {/* ---------------------------------------------------------------- */}
        {isOwner && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Inviter un utilisateur</Text>

            {/* Role selector */}
            <View style={styles.roleRow}>
              <Text style={styles.roleLabel}>Rôle :</Text>
              <TouchableOpacity
                style={[styles.roleBtn, inviteRole === 'editor' && styles.roleBtnActive]}
                onPress={() => setInviteRole('editor')}
              >
                <Text style={[styles.roleBtnText, inviteRole === 'editor' && styles.roleBtnTextActive]}>
                  Éditeur
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleBtn, inviteRole === 'viewer' && styles.roleBtnActive]}
                onPress={() => setInviteRole('viewer')}
              >
                <Text style={[styles.roleBtnText, inviteRole === 'viewer' && styles.roleBtnTextActive]}>
                  Lecteur
                </Text>
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={16} color="#555555" />
              <TextInput
                style={styles.searchInput}
                placeholder="Rechercher par nom…"
                placeholderTextColor="#444444"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searching && <ActivityIndicator size="small" color="#555555" />}
            </View>

            {/* Results */}
            {!searching && searchQuery.trim().length > 0 && searchResults.length === 0 && (
              <Text style={styles.emptyText}>Aucun résultat</Text>
            )}
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.uid}
              renderItem={renderSearchResult}
              scrollEnabled={false}
              keyboardShouldPersistTaps="handled"
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0d0d0d' },
  centered:     { alignItems: 'center', justifyContent: 'center' },
  scroll:       { flex: 1 },
  content:      { paddingHorizontal: 20, gap: 24 },

  // Header
  header:       { gap: 4 },
  backBtn:      { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 12 },
  backBtnText:  { color: '#1db954', fontSize: 15, fontWeight: '600' },
  title:        { color: '#ffffff', fontSize: 26, fontWeight: '700' },
  subtitle:     { color: '#666666', fontSize: 14 },

  // Section
  section:      { gap: 12 },
  sectionTitle: { color: '#888888', fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },

  // Member rows
  memberRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1a1a1a', borderRadius: 14,
    padding: 12, marginBottom: 8, gap: 12,
  },
  memberInfo:    { flex: 1, minWidth: 0 },
  memberName:    { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  memberSub:     { color: '#666666', fontSize: 12, marginTop: 2 },
  roleBadge:     { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginTop: 4 },
  roleBadgeText: { fontSize: 11, fontWeight: '700' },
  memberActions: { flexDirection: 'row', gap: 4 },
  actionBtn:     { padding: 6 },

  // Avatars
  avatarImg:         { backgroundColor: '#2a2a2a' },
  avatarPlaceholder: { backgroundColor: '#1db95420', alignItems: 'center', justifyContent: 'center' },
  avatarInitial:     { color: '#1db954', fontWeight: '700' },

  // Invite section
  roleRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roleLabel:     { color: '#888888', fontSize: 13 },
  roleBtn:       {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1.5, borderColor: '#333333',
  },
  roleBtnActive: { backgroundColor: '#1db95420', borderColor: '#1db95440' },
  roleBtnText:   { color: '#666666', fontSize: 13, fontWeight: '600' },
  roleBtnTextActive: { color: '#1db954' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#1a1a1a', borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, borderWidth: 1, borderColor: '#2a2a2a',
  },
  searchInput:   { flex: 1, color: '#ffffff', fontSize: 15 },
  inviteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1db95420', borderRadius: 8, borderWidth: 1, borderColor: '#1db95440',
    paddingHorizontal: 10, paddingVertical: 6,
  },
  inviteBtnSent: { backgroundColor: '#2a2a2a', borderColor: '#333333' },
  inviteBtnText: { color: '#1db954', fontSize: 13, fontWeight: '600' },
  emptyText:     { color: '#444444', fontSize: 14, textAlign: 'center', paddingTop: 16 },
});
