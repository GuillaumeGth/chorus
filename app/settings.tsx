import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOut } from 'firebase/auth';
import { auth } from '../src/config/firebase';
import type { PlatformKey } from '../src/services/odesli';
import { usePlatformPreference } from '../src/hooks/usePlatformPreference';
import { updateUserPlatform, removePushToken } from '../src/services/firestore';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const PLATFORMS: { key: PlatformKey; label: string; icon: IoniconsName }[] = [
  { key: 'spotify', label: 'Spotify', icon: 'musical-notes-outline' },
  { key: 'appleMusic', label: 'Apple Music', icon: 'musical-note-outline' },
  { key: 'youtubeMusic', label: 'YouTube Music', icon: 'play-circle-outline' },
  { key: 'deezer', label: 'Deezer', icon: 'radio-outline' },
  { key: 'tidal', label: 'Tidal', icon: 'water-outline' },
];

export default function SettingsScreen() {
  const { platform, setPlatform } = usePlatformPreference();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const isFirstSetup = !platform;

  async function handleSelect(key: PlatformKey) {
    await setPlatform(key);
    const uid = auth.currentUser?.uid;
    if (uid) await updateUserPlatform(uid, key);
  }

  function handleConfirm() {
    router.replace('/');
  }

  async function handleSignOut() {
    const uid = auth.currentUser?.uid;
    if (uid) await removePushToken(uid);
    await signOut(auth);
    router.replace('/auth');
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      {/* Header */}
      <View style={styles.header}>
        {!isFirstSetup && (
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={16} color="#1db954" />
            <Text style={styles.backBtnText}>Retour</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.title}>Choisir une plateforme</Text>
        <Text style={styles.subtitle}>Les liens seront convertis vers cette plateforme.</Text>
      </View>

      {/* Platform list */}
      <View style={styles.list}>
        {PLATFORMS.map(({ key, label, icon }) => {
          const selected = platform === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => handleSelect(key)}
              activeOpacity={0.7}
            >
              <Ionicons name={icon} size={22} color={selected ? '#1db954' : '#888888'} style={styles.platformIcon} />
              <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{label}</Text>
              {selected && <Ionicons name="checkmark" size={20} color="#1db954" />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Confirm button */}
      {platform && (
        <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm} activeOpacity={0.8}>
          <Text style={styles.confirmBtnText}>
            {isFirstSetup ? 'Commencer' : 'Enregistrer'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Sign out */}
      {!isFirstSetup && (
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={16} color="#555555" />
          <Text style={styles.signOutText}>Se déconnecter</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
    paddingHorizontal: 24,
  },
  header: {
    marginBottom: 24,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginBottom: 16,
  },
  backBtnText: {
    color: '#1db954',
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#888888',
  },
  list: {
    flex: 1,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  optionSelected: {
    borderColor: '#1db954',
    backgroundColor: '#1a2e1e',
  },
  platformIcon: {
    marginRight: 14,
  },
  optionLabel: {
    flex: 1,
    fontSize: 17,
    fontWeight: '500',
    color: '#cccccc',
  },
  optionLabelSelected: {
    color: '#ffffff',
  },
  confirmBtn: {
    backgroundColor: '#1db954',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  confirmBtnText: {
    color: '#000000',
    fontSize: 17,
    fontWeight: '700',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
  },
  signOutText: {
    color: '#555555',
    fontSize: 14,
  },
});
