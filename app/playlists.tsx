/**
 * PlaylistsScreen — /playlists
 *
 * Entry point for the collaborative playlists feature.
 *
 * Layout:
 *   - Header with back button and "+" to create a new playlist
 *   - Pending invitations section (InvitationCard) — real-time, auth-gated
 *   - FlatList of the user's playlists (usePlaylists hook — array-contains query)
 *   - Empty state with a shortcut to create the first playlist
 *
 * Invitations:
 *   respondToInvitation(id, true)  → sets status='accepted'
 *   The Firebase Function onInvitationAccepted then adds the user to the playlist.
 *   usePlaylists updates automatically when memberUids changes.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { auth } from '../src/config/firebase';
import { usePlaylists } from '../src/hooks/usePlaylists';
import type { Playlist, PlaylistInvitation } from '../src/services/playlists';
import { respondToInvitation, subscribeToMyInvitations } from '../src/services/playlists';

// ---------------------------------------------------------------------------
// PlaylistItem
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// InvitationCard
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<'editor' | 'viewer', string> = {
  editor: 'Éditeur',
  viewer: 'Lecteur',
};

const ROLE_COLORS: Record<'editor' | 'viewer', string> = {
  editor: '#f0a500',
  viewer: '#888888',
};

function InvitationCard({
  inv,
  onAccept,
  onDecline,
}: {
  inv: PlaylistInvitation;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <View style={styles.invCard}>
      <View style={styles.invAvatar}>
        {inv.invitedByPhoto ? (
          <Image source={{ uri: inv.invitedByPhoto }} style={styles.invAvatarImg} />
        ) : (
          <Text style={styles.invAvatarInitial}>
            {inv.invitedByName[0]?.toUpperCase() ?? '?'}
          </Text>
        )}
      </View>
      <View style={styles.invInfo}>
        <Text style={styles.invText} numberOfLines={2}>
          <Text style={styles.invSender}>{inv.invitedByName}</Text>
          {' t\'a invité dans '}
          <Text style={styles.invPlaylist}>« {inv.playlistName} »</Text>
        </Text>
        <View style={[styles.invRoleBadge, { backgroundColor: `${ROLE_COLORS[inv.role]}20` }]}>
          <Text style={[styles.invRoleBadgeText, { color: ROLE_COLORS[inv.role] }]}>
            {ROLE_LABELS[inv.role]}
          </Text>
        </View>
      </View>
      <View style={styles.invActions}>
        <TouchableOpacity style={styles.invAcceptBtn} onPress={onAccept} activeOpacity={0.8}>
          <Text style={styles.invAcceptText}>Accepter</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.invDeclineBtn} onPress={onDecline} activeOpacity={0.8}>
          <Text style={styles.invDeclineText}>Refuser</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// PlaylistsScreen
// ---------------------------------------------------------------------------

export default function PlaylistsScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { playlists, loading } = usePlaylists();

  const [pendingInvitations, setPendingInvitations] = useState<PlaylistInvitation[]>([]);

  // Real-time subscription to pending invitations
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return subscribeToMyInvitations(uid, setPendingInvitations);
  }, []);

  async function handleAccept(inv: PlaylistInvitation) {
    await respondToInvitation(inv.id, true);
    // La Function onInvitationAccepted ajoute l'utilisateur à la playlist.
    // subscribeToMyPlaylists mettra à jour la liste automatiquement.
  }

  async function handleDecline(inv: PlaylistInvitation) {
    await respondToInvitation(inv.id, false);
  }

  const ListHeader = pendingInvitations.length > 0 ? (
    <View style={styles.invSection}>
      <Text style={styles.invSectionTitle}>Invitations</Text>
      {pendingInvitations.map((inv) => (
        <InvitationCard
          key={inv.id}
          inv={inv}
          onAccept={() => { void handleAccept(inv); }}
          onDecline={() => { void handleDecline(inv); }}
        />
      ))}
    </View>
  ) : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.title}>Mes playlists</Text>
        <TouchableOpacity onPress={() => router.push('/playlist/new')} style={styles.headerBtn}>
          <Ionicons name="add" size={26} color="#1db954" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1db954" />
        </View>
      ) : playlists.length === 0 && pendingInvitations.length === 0 ? (
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
          contentContainerStyle={[styles.listContent, { paddingBottom: 24 }]}
          ListHeaderComponent={ListHeader}
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
  headerBtn: { padding: 4, marginLeft: 8 },
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
  // Invitations section
  invSection: { marginBottom: 20 },
  invSectionTitle: {
    color: '#888888',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  invCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#1db95430',
  },
  invAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1db95420',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  invAvatarImg: { width: 40, height: 40 },
  invAvatarInitial: { color: '#1db954', fontSize: 16, fontWeight: '700' },
  invInfo: { flex: 1, minWidth: 0, gap: 4 },
  invText: { color: '#cccccc', fontSize: 13, lineHeight: 18 },
  invSender: { fontWeight: '700', color: '#ffffff' },
  invPlaylist: { fontStyle: 'italic' },
  invRoleBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  invRoleBadgeText: { fontSize: 11, fontWeight: '700' },
  invActions: { flexDirection: 'column', gap: 6, flexShrink: 0 },
  invAcceptBtn: {
    backgroundColor: '#1db954',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
  },
  invAcceptText: { color: '#000000', fontSize: 12, fontWeight: '700' },
  invDeclineBtn: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
  },
  invDeclineText: { color: '#888888', fontSize: 12, fontWeight: '600' },
});
