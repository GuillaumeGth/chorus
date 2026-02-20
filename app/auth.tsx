import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth } from '../src/config/firebase';
import { createOrUpdateUser } from '../src/services/firestore';

// Web client ID (Firebase Console → Auth → Google → Web SDK configuration)
export const GOOGLE_WEB_CLIENT_ID = '380791680025-pj478637ichhh4eeokl41ju1sufg76a1.apps.googleusercontent.com';

GoogleSignin.configure({
  webClientId: GOOGLE_WEB_CLIENT_ID,
});

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleGoogleSignIn() {
    try {
      setLoading(true);
      setError('');
      await GoogleSignin.hasPlayServices();
      // Vider la session Google native pour forcer le choix du compte
      await GoogleSignin.signOut().catch(() => {});
      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult.data?.idToken;
      if (!idToken) throw new Error('No ID token returned');
      const credential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(auth, credential);
      const { uid, displayName, email, photoURL } = result.user;
      await createOrUpdateUser({
        uid,
        displayName: displayName ?? email ?? 'Utilisateur',
        displayNameLower: (displayName ?? email ?? '').toLowerCase(),
        email: email ?? '',
        photoURL: photoURL ?? null,
      });
      router.replace('/');
    } catch (e: any) {
      const code = e.code ?? e.statusCode ?? 'unknown';
      setError(`[${code}] ${e.message ?? 'Erreur de connexion'}`);
      setLoading(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.hero}>
        <Text style={styles.title}>Chorüs</Text>
        <Text style={styles.subtitle}>
          Partage de la musique avec tes amis,{'\n'}chacun l'écoute sur sa plateforme.
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1db954" />
      ) : (
        <TouchableOpacity
          style={styles.googleBtn}
          onPress={handleGoogleSignIn}
          activeOpacity={0.8}
        >
          <Text style={styles.googleBtnText}>Continuer avec Google</Text>
        </TouchableOpacity>
      )}

      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
    paddingHorizontal: 32,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 42,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -1,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 24,
  },
  googleBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
  },
  googleBtnText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: '#ff5555',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
  },
});
