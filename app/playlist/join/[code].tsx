/**
 * Join Playlist screen — chorus://playlist/join/:code
 *
 * Called when the user taps an invite link. Joins the playlist then redirects
 * to the playlist screen. Shows an error card if the code is invalid or the
 * link has been disabled.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { joinPlaylistByCode } from '../../../src/services/playlists';
import { useAuth } from '../../../src/hooks/useAuth';

type JoinStatus = 'loading' | 'success' | 'error';

// ---------------------------------------------------------------------------
// Error messages
// ---------------------------------------------------------------------------

const ERROR_INVALID = 'Code invalide ou lien désactivé.';
const ERROR_GENERIC = 'Une erreur est survenue. Réessaie.';

export default function JoinPlaylistScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { user, loaded } = useAuth();
  const router = useRouter();

  const [status, setStatus]     = useState<JoinStatus>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const joinedRef               = useRef(false);

  useEffect(() => {
    if (!loaded || !user || !code || joinedRef.current) return;
    joinedRef.current = true;

    joinPlaylistByCode(
      code,
      user.uid,
      user.displayName ?? user.email ?? '',
      user.photoURL ?? null,
    )
      .then((playlistId) => {
        // Replace so the user can't go "back" to the join screen
        router.replace(`/playlist/${playlistId}`);
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error && err.message.includes('invalide')
            ? ERROR_INVALID
            : ERROR_GENERIC;
        setErrorMsg(msg);
        setStatus('error');
      });
  }, [loaded, user, code]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (status === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1db954" />
        <Text style={styles.loadingText}>Chargement de la playlist…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.errorCard}>
        <Ionicons name="alert-circle-outline" size={48} color="#ff4444" style={styles.errorIcon} />
        <Text style={styles.errorTitle}>Impossible de rejoindre</Text>
        <Text style={styles.errorMsg}>{errorMsg}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/')}>
          <Text style={styles.backBtnText}>Retour à l'accueil</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    color: '#888888',
    fontSize: 15,
    marginTop: 16,
  },
  errorCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  errorIcon: {
    marginBottom: 4,
  },
  errorTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  errorMsg: {
    color: '#888888',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  backBtn: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  backBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
