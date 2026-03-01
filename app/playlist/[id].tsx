import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/hooks/useAuth';
import { usePlaylist } from '../../src/hooks/usePlaylist';
import type { PlaylistTrack } from '../../src/services/playlists';
import {
  deletePlaylist,
  generateNewInviteCode,
  removeMember,
  removeTrackFromPlaylist,
  setInviteLinkActive,
} from '../../src/services/playlists';
import type { PlatformKey } from '../../src/services/odesli';

const DELETE_HIT_SLOP = { top: 8, right: 8, bottom: 8, left: 8 } as const;

const PLATFORM_LABELS: Record<PlatformKey, string> = {
  spotify: 'Spotify',
  appleMusic: 'Apple Music',
  youtubeMusic: 'YouTube Music',
  deezer: 'Deezer',
  tidal: 'Tidal',
};

function TrackRow({
  track,
  canDelete,
  canDeleteAny,
  onDelete,
}: {
  track: PlaylistTrack;
  canDelete: boolean;
  canDeleteAny: boolean;
  onDelete: () => void;
}) {
  const platforms = Object.entries(track.platformLinks).filter(([, v]) => v) as [PlatformKey, string][];
  return (
    <View style={styles.trackRow}>
      {track.thumbnailUrl ? (
        <Image source={{ uri: track.thumbnailUrl }} style={styles.trackThumb} />
      ) : (
        <View style={[styles.trackThumb, styles.trackThumbPlaceholder]}>
          <Ionicons name="musical-notes" size={20} color="#333333" />
        </View>
      )}
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
        <Text style={styles.trackArtist} numberOfLines={1}>{track.artist}</Text>
        <Text style={styles.trackAdded} numberOfLines={1}>par {track.addedByName}</Text>
        {platforms.length > 0 && (
          <View style={styles.trackLinks}>
            {platforms.map(([platform, url]) => (
              <TouchableOpacity
                key={platform}
                onPress={() => Linking.openURL(url)}
                style={styles.trackLinkBtn}
              >
                <Text style={styles.trackLinkText}>{PLATFORM_LABELS[platform]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
      {(canDelete || canDeleteAny) && (
        <TouchableOpacity onPress={onDelete} style={styles.deleteTrackBtn} hitSlop={DELETE_HIT_SLOP}>
          <Ionicons name="trash-outline" size={16} color="#555555" />
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function PlaylistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { playlist, tracks, loading } = usePlaylist(id ?? '');

  const [menuVisible, setMenuVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const listContentStyle = useMemo(
    () => [styles.listContent, { paddingBottom: insets.bottom + 24 }] as const,
    [insets.bottom],
  );
  const menuCardStyle = useMemo(
    () => [styles.menuCard, { paddingBottom: insets.bottom + 12 }] as const,
    [insets.bottom],
  );

  if (!id) return null;

  const myRole = user && playlist ? (playlist.members[user.uid] ?? null) : null;
  const isOwner = myRole === 'owner';
  const canAdd = myRole === 'owner' || myRole === 'editor';

  async function handleDeletePlaylist() {
    setMenuVisible(false);
    Alert.alert(
      'Supprimer la playlist',
      `Supprimer "${playlist?.name}" définitivement ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            await deletePlaylist(id);
            router.back();
          },
        },
      ],
    );
  }

  async function handleShareInvite() {
    if (!playlist) return;
    setMenuVisible(false);
    const code = playlist.inviteCode;
    await Share.share({
      message: `Rejoins ma playlist "${playlist.name}" sur Chørus ! Code : ${code}\nchorus://playlist/join/${code}`,
    });
  }

  async function handleResetCode() {
    setMenuVisible(false);
    const newCode = await generateNewInviteCode(id);
    Alert.alert('Nouveau code', `Le nouveau code d'invitation est : ${newCode}`);
  }

  async function handleToggleLink() {
    if (!playlist) return;
    setMenuVisible(false);
    await setInviteLinkActive(id, !playlist.inviteLinkActive);
  }

  async function handleDeleteTrack(track: PlaylistTrack) {
    if (!user || !myRole) return;
    const canDeleteThis = myRole === 'owner' || (myRole === 'editor' && track.addedBy === user.uid);
    if (!canDeleteThis) return;
    Alert.alert(
      'Retirer le morceau',
      `Retirer "${track.title}" de la playlist ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: () => removeTrackFromPlaylist(id, track.id, user.uid, myRole),
        },
      ],
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#1db954" />
      </View>
    );
  }

  if (!playlist) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Playlist introuvable.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnCenter}>
          <Text style={styles.backBtnCenterText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const memberList = Object.entries(playlist.memberInfo).map(([uid, info]) => ({
    uid,
    ...info,
    role: playlist.members[uid],
  }));

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      {deleting && (
        <View style={styles.deletingOverlay}>
          <ActivityIndicator color="#ffffff" />
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{playlist.name}</Text>
        {isOwner && (
          <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.menuBtn}>
            <Ionicons name="ellipsis-horizontal" size={22} color="#ffffff" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={tracks}
        keyExtractor={(t) => t.id}
        contentContainerStyle={listContentStyle}
        ListHeaderComponent={
          <>
            {/* Cover + meta */}
            <View style={styles.coverRow}>
              {playlist.lastTrack?.thumbnailUrl ? (
                <Image source={{ uri: playlist.lastTrack.thumbnailUrl }} style={styles.cover} />
              ) : (
                <View style={[styles.cover, styles.coverPlaceholder]}>
                  <Ionicons name="albums-outline" size={48} color="#2a2a2a" />
                </View>
              )}
              <View style={styles.coverMeta}>
                <Text style={styles.playlistName}>{playlist.name}</Text>
                {playlist.description ? (
                  <Text style={styles.playlistDesc}>{playlist.description}</Text>
                ) : null}
                <Text style={styles.playlistStats}>
                  {playlist.trackCount} {playlist.trackCount === 1 ? 'morceau' : 'morceaux'} · {memberList.length} {memberList.length === 1 ? 'membre' : 'membres'}
                </Text>
              </View>
            </View>

            {/* Members strip */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.membersStrip} contentContainerStyle={styles.membersStripContent}>
              {memberList.map((m) => (
                <View key={m.uid} style={styles.memberChip}>
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberInitial}>{m.displayName[0]?.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.memberName} numberOfLines={1}>{m.displayName}</Text>
                  {m.role === 'owner' && (
                    <Ionicons name="star" size={10} color="#1db954" />
                  )}
                </View>
              ))}
            </ScrollView>

            {/* Actions */}
            <View style={styles.actionsRow}>
              {canAdd && (
                <TouchableOpacity style={styles.actionBtn} activeOpacity={0.8}>
                  <Ionicons name="add-circle-outline" size={18} color="#1db954" />
                  <Text style={styles.actionBtnText}>Ajouter</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSecondary]} activeOpacity={0.8}>
                <Ionicons name="share-outline" size={18} color="#888888" />
                <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>Exporter</Text>
              </TouchableOpacity>
            </View>

            {tracks.length > 0 && (
              <Text style={styles.sectionTitle}>Morceaux</Text>
            )}
          </>
        }
        renderItem={({ item }) => (
          <TrackRow
            track={item}
            canDelete={myRole === 'editor' && item.addedBy === user?.uid}
            canDeleteAny={myRole === 'owner'}
            onDelete={() => handleDeleteTrack(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyTracks}>
            <Ionicons name="musical-notes-outline" size={40} color="#2a2a2a" />
            <Text style={styles.emptyTracksText}>
              {canAdd ? 'Ajoute le premier morceau !' : 'Aucun morceau pour l\'instant.'}
            </Text>
          </View>
        }
      />

      {/* Owner menu modal */}
      <Modal
        transparent
        animationType="fade"
        visible={menuVisible}
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={menuCardStyle}>
            <TouchableOpacity style={styles.menuItem} onPress={handleShareInvite}>
              <Ionicons name="link-outline" size={20} color="#ffffff" />
              <Text style={styles.menuItemText}>Partager le lien d'invitation</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleToggleLink}>
              <Ionicons
                name={playlist.inviteLinkActive ? 'close-circle-outline' : 'checkmark-circle-outline'}
                size={20}
                color="#ffffff"
              />
              <Text style={styles.menuItemText}>
                {playlist.inviteLinkActive ? 'Désactiver le lien' : 'Activer le lien'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleResetCode}>
              <Ionicons name="refresh-outline" size={20} color="#ffffff" />
              <Text style={styles.menuItemText}>Réinitialiser le code</Text>
            </TouchableOpacity>
            <View style={styles.menuSeparator} />
            <TouchableOpacity style={styles.menuItem} onPress={handleDeletePlaylist}>
              <Ionicons name="trash-outline" size={20} color="#ff5555" />
              <Text style={[styles.menuItemText, styles.menuItemDestructive]}>Supprimer la playlist</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#ffffff' },
  menuBtn: { padding: 4 },
  listContent: { paddingHorizontal: 20 },
  coverRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  cover: {
    width: 100,
    height: 100,
    borderRadius: 14,
    backgroundColor: '#1a1a1a',
    flexShrink: 0,
  },
  coverPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  coverMeta: { flex: 1 },
  playlistName: { fontSize: 18, fontWeight: '700', color: '#ffffff', marginBottom: 4 },
  playlistDesc: { fontSize: 13, color: '#666666', marginBottom: 8 },
  playlistStats: { fontSize: 12, color: '#444444' },
  membersStrip: { marginBottom: 20, marginHorizontal: -20 },
  membersStripContent: { paddingHorizontal: 20, gap: 8 },
  memberChip: { alignItems: 'center', gap: 4, maxWidth: 64 },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1db95420',
    borderWidth: 1.5,
    borderColor: '#1db95440',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitial: { color: '#1db954', fontSize: 18, fontWeight: '700' },
  memberName: { color: '#666666', fontSize: 10, textAlign: 'center' },
  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1db95415',
    borderWidth: 1,
    borderColor: '#1db95440',
    borderRadius: 12,
    paddingVertical: 12,
  },
  actionBtnSecondary: {
    backgroundColor: '#1a1a1a',
    borderColor: '#2a2a2a',
  },
  actionBtnText: { color: '#1db954', fontSize: 14, fontWeight: '600' },
  actionBtnTextSecondary: { color: '#888888' },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#555555', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  trackThumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#2a2a2a', flexShrink: 0 },
  trackThumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  trackInfo: { flex: 1, minWidth: 0 },
  trackTitle: { color: '#ffffff', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  trackArtist: { color: '#888888', fontSize: 12, marginBottom: 2 },
  trackAdded: { color: '#444444', fontSize: 11, marginBottom: 6 },
  trackLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  trackLinkBtn: {
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  trackLinkText: { color: '#888888', fontSize: 10, fontWeight: '600' },
  deleteTrackBtn: { padding: 4, marginTop: 2 },
  emptyTracks: { alignItems: 'center', gap: 12, paddingVertical: 48 },
  emptyTracksText: { color: '#444444', fontSize: 14, textAlign: 'center' },
  errorText: { color: '#ff5555', fontSize: 16, marginBottom: 16 },
  backBtnCenter: { backgroundColor: '#1a1a1a', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  backBtnCenterText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  deletingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  menuCard: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 20,
    gap: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  menuItemText: { color: '#ffffff', fontSize: 16 },
  menuItemDestructive: { color: '#ff5555' },
  menuSeparator: { height: 1, backgroundColor: '#2a2a2a', marginVertical: 4 },
});
