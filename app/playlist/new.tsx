/**
 * NewPlaylistScreen — /playlist/new
 *
 * Form to create a new collaborative playlist.
 *
 * Fields:
 *   - name (required, max 80 chars)
 *   - description (optional, max 200 chars)
 *   - inviteRole: default role granted to users who join via invite link
 *       'viewer' — read/listen only
 *       'editor' — can add tracks
 *
 * On submit:
 *   createPlaylist() generates a unique 6-char inviteCode and sets the creator
 *   as 'owner'. On success, navigates to the new playlist detail screen.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/hooks/useAuth';
import { createPlaylist } from '../../src/services/playlists';

export default function NewPlaylistScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('viewer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim() || !user) return;
    setLoading(true);
    setError(null);
    try {
      const playlistId = await createPlaylist(
        user.uid,
        user.displayName ?? user.email ?? 'Moi',
        user.photoURL ?? null,
        name.trim(),
        description.trim() || undefined,
        inviteRole,
      );
      router.replace(`/playlist/${playlistId}`);
    } catch {
      setError('Impossible de créer la playlist. Réessaie.');
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 16 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.title}>Nouvelle playlist</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Nom *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex : Road trip 2025"
          placeholderTextColor="#444444"
          value={name}
          onChangeText={setName}
          maxLength={80}
          autoFocus
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          placeholder="Optionnel"
          placeholderTextColor="#444444"
          value={description}
          onChangeText={setDescription}
          maxLength={200}
          multiline
          numberOfLines={3}
        />

        <Text style={styles.label}>Rôle des nouveaux membres via lien</Text>
        <View style={styles.roleRow}>
          <TouchableOpacity
            style={[styles.roleBtn, inviteRole === 'viewer' && styles.roleBtnActive]}
            onPress={() => setInviteRole('viewer')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="eye-outline"
              size={18}
              color={inviteRole === 'viewer' ? '#000000' : '#888888'}
            />
            <Text style={[styles.roleBtnText, inviteRole === 'viewer' && styles.roleBtnTextActive]}>
              Lecteur
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.roleBtn, inviteRole === 'editor' && styles.roleBtnActive]}
            onPress={() => setInviteRole('editor')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="pencil-outline"
              size={18}
              color={inviteRole === 'editor' ? '#000000' : '#888888'}
            />
            <Text style={[styles.roleBtnText, inviteRole === 'editor' && styles.roleBtnTextActive]}>
              Éditeur
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.roleHint}>
          {inviteRole === 'viewer'
            ? 'Les membres via lien pourront voir et écouter, mais pas ajouter de morceaux.'
            : 'Les membres via lien pourront ajouter des morceaux à la playlist.'}
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.createBtn, (!name.trim() || loading) && styles.createBtnDisabled]}
          onPress={handleCreate}
          activeOpacity={0.8}
          disabled={!name.trim() || loading}
        >
          {loading ? (
            <ActivityIndicator color="#000000" />
          ) : (
            <Text style={styles.createBtnText}>Créer la playlist</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  backBtn: { padding: 4, marginRight: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#ffffff' },
  form: { paddingHorizontal: 20, gap: 8 },
  label: { color: '#888888', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    color: '#ffffff',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inputMultiline: { height: 88, textAlignVertical: 'top', paddingTop: 14 },
  roleRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  roleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingVertical: 14,
  },
  roleBtnActive: { backgroundColor: '#1db954', borderColor: '#1db954' },
  roleBtnText: { color: '#888888', fontSize: 14, fontWeight: '600' },
  roleBtnTextActive: { color: '#000000' },
  roleHint: { color: '#444444', fontSize: 12, lineHeight: 17, marginTop: 2 },
  error: { color: '#ff5555', fontSize: 13, marginTop: 4 },
  createBtn: {
    backgroundColor: '#1db954',
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { color: '#000000', fontSize: 16, fontWeight: '700' },
});
