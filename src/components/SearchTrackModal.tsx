/**
 * SearchTrackModal
 *
 * Bottom-sheet modal for adding a track to a collaborative playlist.
 * Two tabs:
 *   - "Rechercher" — debounced text search via the Deezer API, results resolved
 *     through Odesli inside `addTrack`.
 *   - "Coller un lien" — reads the clipboard and passes the URL directly to
 *     `addTrack`, which resolves it through Odesli.
 *
 * The parent provides `addTrack(url): Promise<void>`. The modal is responsible
 * only for selecting which URL to add; resolution and Firestore writes live in
 * the service layer.
 */
import React, { useCallback, useEffect, useState } from 'react';
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
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { searchMusic } from '../services/musicSearch';
import type { MusicSearchResult } from '../services/musicSearch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchTrackModalProps {
  visible: boolean;
  /** Called with the URL of the selected track. Throws on resolution failure. */
  addTrack: (url: string) => Promise<void>;
  onClose: () => void;
}

type Tab = 'search' | 'paste';

// ---------------------------------------------------------------------------
// Module-level constants (no inline objects in render)
// ---------------------------------------------------------------------------

const SEARCH_DEBOUNCE_MS = 400;
const KEYBOARD_BEHAVIOR = Platform.OS === 'ios' ? 'padding' : 'height' as const;
const RESULT_KEY_EXTRACTOR = (item: MusicSearchResult) => item.url;

// ---------------------------------------------------------------------------
// ResultRow — isolated memo to avoid full-list re-renders on addingUrl change
// ---------------------------------------------------------------------------

interface ResultRowProps {
  result:   MusicSearchResult;
  adding:   boolean;
  onAdd:    (url: string) => void;
}

const ResultRow = React.memo(function ResultRow({ result, adding, onAdd }: ResultRowProps) {
  const handlePress = useCallback(() => onAdd(result.url), [onAdd, result.url]);

  return (
    <View style={styles.resultRow}>
      {result.thumbnailUrl ? (
        <Image source={{ uri: result.thumbnailUrl }} style={styles.resultThumb} />
      ) : (
        <View style={[styles.resultThumb, styles.resultThumbPlaceholder]}>
          <Ionicons name="musical-notes" size={20} color="#333333" />
        </View>
      )}
      <View style={styles.resultInfo}>
        <Text style={styles.resultTitle} numberOfLines={1}>{result.title}</Text>
        <Text style={styles.resultArtist} numberOfLines={1}>{result.artist}</Text>
      </View>
      <TouchableOpacity
        style={styles.addBtn}
        onPress={handlePress}
        disabled={adding}
        testID="add-result-btn"
      >
        {adding
          ? <ActivityIndicator size="small" color="#1db954" />
          : <Ionicons name="add-circle" size={28} color="#1db954" />
        }
      </TouchableOpacity>
    </View>
  );
});

// ---------------------------------------------------------------------------
// SearchTrackModal
// ---------------------------------------------------------------------------

export const SearchTrackModal = React.memo(function SearchTrackModal({
  visible,
  addTrack,
  onClose,
}: SearchTrackModalProps) {
  const [tab,       setTab]       = useState<Tab>('search');
  const [query,     setQuery]     = useState('');
  const [results,   setResults]   = useState<MusicSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const [pastedUrl, setPastedUrl] = useState('');
  const [adding,    setAdding]    = useState(false);

  // Reset state whenever the modal is closed
  useEffect(() => {
    if (!visible) {
      setTab('search');
      setQuery('');
      setResults([]);
      setPastedUrl('');
    }
  }, [visible]);

  // Debounced search — clears results immediately on empty query
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(() => {
      setSearching(true);
      searchMusic(query)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query]);

  const handleAddResult = useCallback(async (url: string): Promise<void> => {
    setAddingUrl(url);
    try {
      await addTrack(url);
      onClose();
    } catch {
      Alert.alert('Erreur', "Impossible d'ajouter ce morceau. Réessaie.");
    } finally {
      setAddingUrl(null);
    }
  }, [addTrack, onClose]);

  const handlePaste = useCallback(async () => {
    const text = await Clipboard.getStringAsync();
    setPastedUrl(text.trim());
  }, []);

  const handleConfirmPaste = useCallback(async () => {
    if (!pastedUrl) return;
    setAdding(true);
    try {
      await addTrack(pastedUrl);
      onClose();
    } catch {
      Alert.alert('Erreur', 'Lien non reconnu. Vérifie qu\'il s\'agit d\'un lien musical valide.');
    } finally {
      setAdding(false);
    }
  }, [pastedUrl, addTrack, onClose]);

  const handleTabSearch = useCallback(() => setTab('search'), []);
  const handleTabPaste  = useCallback(() => setTab('paste'),  []);

  const renderResult = useCallback(
    ({ item }: { item: MusicSearchResult }) => (
      <ResultRow
        result={item}
        adding={addingUrl === item.url}
        onAdd={handleAddResult}
      />
    ),
    [addingUrl, handleAddResult],
  );

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView style={styles.overlay} behavior={KEYBOARD_BEHAVIOR}>
        <TouchableOpacity style={styles.dismiss} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Ajouter un morceau</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#888888" />
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, tab === 'search' && styles.tabActive]}
              onPress={handleTabSearch}
            >
              <Text style={[styles.tabText, tab === 'search' && styles.tabTextActive]}>
                Rechercher
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, tab === 'paste' && styles.tabActive]}
              onPress={handleTabPaste}
            >
              <Text style={[styles.tabText, tab === 'paste' && styles.tabTextActive]}>
                Coller un lien
              </Text>
            </TouchableOpacity>
          </View>

          {/* Search tab */}
          {tab === 'search' && (
            <>
              <TextInput
                style={styles.searchInput}
                placeholder="Artiste, titre…"
                placeholderTextColor="#555555"
                value={query}
                onChangeText={setQuery}
                returnKeyType="search"
                autoCorrect={false}
              />
              {searching && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color="#1db954" />
                </View>
              )}
              {!searching && results.length === 0 && query.trim().length > 0 && (
                <Text style={styles.emptyText}>Aucun résultat</Text>
              )}
              <FlatList
                data={results}
                keyExtractor={RESULT_KEY_EXTRACTOR}
                renderItem={renderResult}
                keyboardShouldPersistTaps="handled"
              />
            </>
          )}

          {/* Paste tab */}
          {tab === 'paste' && (
            <View style={styles.pasteContainer}>
              <TouchableOpacity style={styles.pasteBtn} onPress={handlePaste}>
                <Ionicons name="clipboard-outline" size={20} color="#ffffff" />
                <Text style={styles.pasteBtnText}>Coller depuis le presse-papier</Text>
              </TouchableOpacity>
              {pastedUrl.length > 0 && (
                <>
                  <Text style={styles.pastedUrlText} numberOfLines={2}>{pastedUrl}</Text>
                  <TouchableOpacity
                    style={[styles.confirmBtn, adding && styles.confirmBtnDisabled]}
                    onPress={handleConfirmPaste}
                    disabled={adding}
                  >
                    {adding
                      ? <ActivityIndicator color="#ffffff" />
                      : <Text style={styles.confirmBtnText}>Ajouter à la playlist</Text>
                    }
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  dismiss: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 32,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  headerTitle: {
    flex: 1,
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  closeBtn: { padding: 4 },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#111111',
  },
  tabActive: {
    backgroundColor: '#1db95420',
    borderWidth: 1,
    borderColor: '#1db95440',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#444444',
  },
  tabTextActive: { color: '#1db954' },
  searchInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#ffffff',
    fontSize: 15,
    marginBottom: 8,
  },
  loadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#444444',
    fontSize: 14,
    textAlign: 'center',
    paddingTop: 24,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  resultThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#2a2a2a',
    flexShrink: 0,
  },
  resultThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultInfo: { flex: 1, minWidth: 0 },
  resultTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  resultArtist: {
    color: '#666666',
    fontSize: 12,
    marginTop: 2,
  },
  addBtn: { padding: 4 },
  pasteContainer: {
    paddingTop: 16,
    gap: 14,
  },
  pasteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    paddingVertical: 14,
  },
  pasteBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  pastedUrlText: {
    color: '#666666',
    fontSize: 12,
    textAlign: 'center',
  },
  confirmBtn: {
    backgroundColor: '#1db954',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtnDisabled: { opacity: 0.6 },
  confirmBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
