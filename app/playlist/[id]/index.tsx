/**
 * PlaylistDetailScreen — /playlist/[id]
 *
 * Main screen for a collaborative playlist. Shows tracks, metadata, and
 * exposes actions depending on the authenticated user's role.
 *
 * Sections:
 *   - Cover + description + contributor avatars + track count
 *   - "Ajouter" button (owner/editor only) → SearchTrackModal
 *   - "Exporter" button (all roles) → export bottom sheet
 *   - Track list (TrackRow) with listen and delete actions
 *
 * Modals:
 *   - SearchTrackModal: 2 tabs — Deezer catalog search + paste a link
 *   - Edit info modal: name + description (owner only)
 *   - Export modal: platform picker → usePlaylistExport state machine
 *       idle → authenticating → creating → adding → done | error
 *   - Owner menu: edit info / manage members / delete playlist
 *
 * Roles:
 *   owner  — can add/delete any track, edit info, manage members, delete playlist
 *   editor — can add tracks, delete own tracks only
 *   viewer — read only (listen + export)
 */
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/hooks/useAuth';
import { usePlatformPreference } from '../../../src/hooks/usePlatformPreference';
import { usePlaylist } from '../../../src/hooks/usePlaylist';
import { usePlaylistExport } from '../../../src/hooks/usePlaylistExport';
import type { PlaylistTrack } from '../../../src/services/playlists';
import {
  addTrackToPlaylist,
  deletePlaylist,
  removeTrackFromPlaylist,
  updatePlaylistInfo,
} from '../../../src/services/playlists';
import { SearchTrackModal } from '../../../src/components/SearchTrackModal';
import type { PlatformKey } from '../../../src/services/odesli';
import { enabledPlatforms } from '../../../src/config/platforms';

const DELETE_HIT_SLOP = { top: 8, right: 8, bottom: 8, left: 8 } as const;

const PLATFORM_NAMES: Record<PlatformKey, string> = {
  spotify:      'Spotify',
  appleMusic:   'Apple Music',
  youtubeMusic: 'YouTube Music',
  deezer:       'Deezer',
  tidal:        'Tidal',
};

/** Platforms available for export — driven by enabledPlatforms (src/config/platforms.ts). */
const EXPORTABLE_PLATFORMS = (Object.keys(enabledPlatforms) as PlatformKey[]).filter(
  (p) => enabledPlatforms[p] && p !== 'appleMusic',
);

/** Renders the brand icon for a platform. FA5 brands for Spotify/YTM/Deezer/Apple; Ionicons fallback for Tidal (no FA5 glyph). */
function PlatformIcon({ platform, size }: { platform: PlatformKey; size: number }) {
  const color = PLATFORM_COLORS[platform];
  switch (platform) {
    case 'spotify':      return <FontAwesome5 name="spotify"  size={size} color={color} brand />;
    case 'youtubeMusic': return <FontAwesome5 name="youtube"  size={size} color={color} brand />;
    case 'deezer':       return <FontAwesome5 name="deezer"   size={size} color={color} brand />;
    case 'appleMusic':   return <FontAwesome5 name="apple"    size={size} color={color} brand />;
    case 'tidal':        return <Ionicons     name="musical-notes" size={size} color={color} />;
  }
}

const PLATFORM_COLORS: Record<PlatformKey, string> = {
  spotify:      '#1DB954',
  youtubeMusic: '#FF0000',
  appleMusic:   '#FC3C44',
  deezer:       '#EF5466',
  tidal:        '#00FECC',
};

function TrackRow({
  track,
  userPlatform,
  canDelete,
  canDeleteAny,
  onDelete,
}: {
  track: PlaylistTrack;
  /** The authenticated user's preferred platform — used to pick the listen URL. */
  userPlatform: PlatformKey | null;
  canDelete: boolean;
  canDeleteAny: boolean;
  onDelete: () => void;
}) {
  const userPlatformUrl = userPlatform ? track.platformLinks[userPlatform] : undefined;
  const unavailable = userPlatform !== null && !userPlatformUrl;
  // Fallback: any available link, then the original URL.
  const listenUrl =
    userPlatformUrl ??
    Object.values(track.platformLinks).find(Boolean) ??
    track.originalUrl;

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
      </View>
      <TouchableOpacity
        onPress={() => Linking.openURL(listenUrl)}
        style={styles.listenBtn}
        hitSlop={DELETE_HIT_SLOP}
      >
        <Ionicons
          name="play-circle-outline"
          size={26}
          color={unavailable ? '#554400' : '#1db954'}
        />
      </TouchableOpacity>
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
  const { platform: userPlatform } = usePlatformPreference();
  const { playlist, tracks, loading } = usePlaylist(id ?? '');

  const [menuVisible,       setMenuVisible]       = useState(false);
  const [addModalVisible,   setAddModalVisible]   = useState(false);
  const [editModalVisible,  setEditModalVisible]  = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [editName,          setEditName]          = useState('');
  const [editDescription,   setEditDescription]   = useState('');
  const [saving,            setSaving]            = useState(false);
  const [deleting,          setDeleting]          = useState(false);

  const exportHook = usePlaylistExport(tracks, playlist?.name ?? '', playlist?.description);

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

  const handleAddTrack = useCallback(async (url: string): Promise<void> => {
    if (!user || !id) return;
    await addTrackToPlaylist(
      id,
      user.uid,
      user.displayName ?? '',
      user.photoURL ?? null,
      url,
    );
  }, [user, id]);

  function handleOpenEdit() {
    setMenuVisible(false);
    setEditName(playlist?.name ?? '');
    setEditDescription(playlist?.description ?? '');
    setEditModalVisible(true);
  }

  async function handleSaveInfo() {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await updatePlaylistInfo(id, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });
      setEditModalVisible(false);
    } finally {
      setSaving(false);
    }
  }

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
      <View style={[styles.container, styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
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
                {playlist.description ? (
                  <Text style={styles.playlistDesc}>{playlist.description}</Text>
                ) : null}
                <Text style={styles.playlistStats}>
                  {playlist.trackCount} {playlist.trackCount === 1 ? 'morceau' : 'morceaux'}
                </Text>
                <View style={styles.contributorsList}>
                  {memberList.slice(0, 5).map((m, i) => (
                    <View key={m.uid} style={[styles.contributorAvatar, { zIndex: 5 - i, marginLeft: i === 0 ? 0 : -8 }]}>
                      {m.photoURL
                        ? <Image source={{ uri: m.photoURL }} style={styles.contributorAvatarImg} />
                        : <Text style={styles.contributorInitial}>{m.displayName[0]?.toUpperCase()}</Text>
                      }
                    </View>
                  ))}
                  {memberList.length > 5 && (
                    <View style={[styles.contributorAvatar, styles.contributorMore, { zIndex: 0, marginLeft: -8 }]}>
                      <Text style={styles.contributorMoreText}>+{memberList.length - 5}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Actions */}
            <View style={styles.actionsRow}>
              {canAdd && (
                <TouchableOpacity
                  style={styles.actionBtn}
                  activeOpacity={0.8}
                  onPress={() => setAddModalVisible(true)}
                >
                  <Ionicons name="add-circle-outline" size={18} color="#1db954" />
                  <Text style={styles.actionBtnText}>Ajouter</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnSecondary]}
                activeOpacity={0.8}
                onPress={() => setExportModalVisible(true)}
              >
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
            userPlatform={userPlatform}
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

      {/* Add track modal */}
      <SearchTrackModal
        visible={addModalVisible}
        addTrack={handleAddTrack}
        onClose={() => setAddModalVisible(false)}
      />

      {/* Edit info modal */}
      <Modal
        transparent
        animationType="slide"
        visible={editModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.menuOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity
            style={styles.editDismiss}
            activeOpacity={1}
            onPress={() => setEditModalVisible(false)}
          />
          <View style={menuCardStyle}>
            <View style={styles.editHeader}>
              <Text style={styles.editTitle}>Modifier la playlist</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)} style={styles.editCloseBtn}>
                <Ionicons name="close" size={22} color="#888888" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.editInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Nom de la playlist"
              placeholderTextColor="#555555"
              maxLength={80}
              returnKeyType="next"
            />
            <TextInput
              style={[styles.editInput, styles.editInputMultiline]}
              value={editDescription}
              onChangeText={setEditDescription}
              placeholder="Description (optionnelle)"
              placeholderTextColor="#555555"
              maxLength={200}
              multiline
              returnKeyType="done"
            />
            <TouchableOpacity
              style={[styles.editSaveBtn, (!editName.trim() || saving) && styles.editSaveBtnDisabled]}
              onPress={handleSaveInfo}
              disabled={!editName.trim() || saving}
            >
              {saving
                ? <ActivityIndicator color="#ffffff" />
                : <Text style={styles.editSaveBtnText}>Enregistrer</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Export modal */}
      <Modal
        transparent
        animationType="slide"
        visible={exportModalVisible}
        onRequestClose={() => {
          if (exportHook.status === 'idle' || exportHook.status === 'done' || exportHook.status === 'error') {
            exportHook.reset();
            setExportModalVisible(false);
          }
        }}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => {
            if (exportHook.status === 'idle' || exportHook.status === 'done' || exportHook.status === 'error') {
              exportHook.reset();
              setExportModalVisible(false);
            }
          }}
        >
          <View style={menuCardStyle}>
            <View style={styles.exportHeader}>
              <Text style={styles.editTitle}>Exporter vers…</Text>
              {(exportHook.status === 'idle' || exportHook.status === 'done' || exportHook.status === 'error') && (
                <TouchableOpacity
                  onPress={() => { exportHook.reset(); setExportModalVisible(false); }}
                  style={styles.editCloseBtn}
                >
                  <Ionicons name="close" size={22} color="#888888" />
                </TouchableOpacity>
              )}
            </View>

            {/* Platform picker */}
            {exportHook.status === 'idle' && (
              <View style={styles.exportPlatformList}>
                {EXPORTABLE_PLATFORMS.map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={styles.exportPlatformItem}
                    onPress={() => exportHook.exportTo(p)}
                  >
                    <PlatformIcon platform={p} size={20} />
                    <Text style={styles.exportPlatformName}>{PLATFORM_NAMES[p]}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#555555" />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* In-progress */}
            {(exportHook.status === 'authenticating' || exportHook.status === 'creating') && (
              <View style={styles.exportStatus}>
                <ActivityIndicator color="#1db954" />
                <Text style={styles.exportStatusText}>
                  {exportHook.status === 'authenticating'
                    ? 'Connexion à la plateforme…'
                    : 'Création de la playlist…'}
                </Text>
              </View>
            )}

            {/* Adding tracks */}
            {exportHook.status === 'adding' && (
              <View style={styles.exportStatus}>
                <ActivityIndicator color="#1db954" />
                <Text style={styles.exportStatusText}>
                  {`Ajout des morceaux… ${exportHook.progress.added} / ${exportHook.progress.total}`}
                </Text>
                {exportHook.progress.total > 0 && (
                  <View style={styles.progressBarBg}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${Math.round((exportHook.progress.added / exportHook.progress.total) * 100)}%` as `${number}%` },
                      ]}
                    />
                  </View>
                )}
              </View>
            )}

            {/* Done */}
            {exportHook.status === 'done' && (
              <View style={styles.exportStatus}>
                <Ionicons name="checkmark-circle" size={36} color="#1db954" />
                <Text style={styles.exportDoneText}>
                  {`${exportHook.progress.added} morceau${exportHook.progress.added !== 1 ? 'x' : ''} ajouté${exportHook.progress.added !== 1 ? 's' : ''}`}
                </Text>
                {exportHook.progress.skipped > 0 && (
                  <Text style={styles.exportSkippedText}>
                    {`${exportHook.progress.skipped} indisponible${exportHook.progress.skipped !== 1 ? 's' : ''} sur cette plateforme`}
                  </Text>
                )}
                {exportHook.playlistUrl ? (
                  <TouchableOpacity
                    style={styles.exportOpenBtn}
                    onPress={() => Linking.openURL(exportHook.playlistUrl!)}
                  >
                    <Text style={styles.exportOpenBtnText}>Ouvrir la playlist</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            {/* Error */}
            {exportHook.status === 'error' && (
              <View style={styles.exportStatus}>
                <Ionicons name="alert-circle" size={36} color="#ff5555" />
                <Text style={styles.exportErrorText}>{exportHook.error}</Text>
                <TouchableOpacity
                  style={styles.exportRetryBtn}
                  onPress={() => exportHook.reset()}
                >
                  <Text style={styles.exportRetryBtnText}>Réessayer</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

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
            <TouchableOpacity style={styles.menuItem} onPress={handleOpenEdit}>
              <Ionicons name="pencil-outline" size={20} color="#ffffff" />
              <Text style={styles.menuItemText}>Modifier les infos</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setMenuVisible(false); router.push(`/playlist/${id}/members`); }}
            >
              <Ionicons name="people-outline" size={20} color="#ffffff" />
              <Text style={styles.menuItemText}>Gérer les membres</Text>
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
  contributorsList: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  contributorAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#0d0d0d',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  contributorAvatarImg: { width: 34, height: 34 },
  contributorInitial: { color: '#1db954', fontSize: 13, fontWeight: '700' },
  contributorMore: { backgroundColor: '#2a2a2a' },
  contributorMoreText: { color: '#888888', fontSize: 9, fontWeight: '700' },
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
  listenBtn: { padding: 4, alignSelf: 'center' },
  deleteTrackBtn: { padding: 4, alignSelf: 'center' },
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
    paddingTop: 10,
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
  editDismiss: { flex: 1 },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
    marginBottom: 16,
  },
  editTitle: { flex: 1, color: '#ffffff', fontSize: 17, fontWeight: '700' },
  editCloseBtn: { padding: 4 },
  editInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#ffffff',
    fontSize: 15,
    marginBottom: 10,
  },
  editInputMultiline: { minHeight: 72, textAlignVertical: 'top' },
  editSaveBtn: {
    backgroundColor: '#1db954',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  editSaveBtnDisabled: { opacity: 0.4 },
  editSaveBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  exportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
    marginBottom: 4,
  },
  exportPlatformList: { gap: 2, marginBottom: 8 },
  exportPlatformItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  exportPlatformName: { flex: 1, color: '#ffffff', fontSize: 16 },
  exportStatus: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 24,
    paddingBottom: 8,
  },
  exportStatusText: { color: '#888888', fontSize: 14, textAlign: 'center' },
  progressBarBg: {
    width: '100%',
    height: 4,
    backgroundColor: '#2a2a2a',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: { height: 4, backgroundColor: '#1db954', borderRadius: 2 },
  exportDoneText: { color: '#ffffff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  exportSkippedText: { color: '#555555', fontSize: 13, textAlign: 'center' },
  exportOpenBtn: {
    backgroundColor: '#1db954',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginTop: 4,
  },
  exportOpenBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  exportErrorText: { color: '#ff5555', fontSize: 14, textAlign: 'center' },
  exportRetryBtn: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginTop: 4,
  },
  exportRetryBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
});
