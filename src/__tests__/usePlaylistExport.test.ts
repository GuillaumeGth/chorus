/**
 * Tests for the usePlaylistExport hook.
 * Mocks the export service factory so exporter behaviour is fully controlled.
 */
import { act, renderHook } from '@testing-library/react-native';
import { usePlaylistExport } from '../hooks/usePlaylistExport';
import type { PlaylistTrack } from '../services/playlists';
import type { PlatformExporter } from '../services/export';

// ─── Mock the export factory ─────────────────────────────────────────────────
const mockExporter: jest.Mocked<PlatformExporter> = {
  isAuthenticated: jest.fn(),
  authenticate: jest.fn(),
  createPlaylist: jest.fn(),
  addTracks: jest.fn(),
  getPlaylistUrl: jest.fn(),
};

jest.mock('../services/export', () => ({
  getExporter: jest.fn(() => mockExporter),
}));

// ─── Mock expo-secure-store (imported transitively) ──────────────────────────
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(),
}));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }));
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async () => new Uint8Array(32)),
  digestStringAsync: jest.fn(async () => 'dGVzdA=='),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
}));

// ─── Sample data ──────────────────────────────────────────────────────────────
function makeTrack(id: string, platform?: 'spotify' | 'deezer'): PlaylistTrack {
  return {
    id,
    addedBy: 'uid1',
    addedByName: 'Alice',
    addedByPhoto: null,
    addedAt: { seconds: 0, nanoseconds: 0 } as any,
    title: `Track ${id}`,
    artist: 'Artist',
    thumbnailUrl: '',
    originalUrl: 'https://example.com',
    platformLinks: platform
      ? { [platform]: `https://open.spotify.com/track/${id}` }
      : {},
    position: 1,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockExporter.isAuthenticated.mockResolvedValue(true);
  mockExporter.createPlaylist.mockResolvedValue('pl-remote-id');
  // Simulate addTracks calling onProgress with the full count (all succeeded).
  mockExporter.addTracks.mockImplementation(
    async (_id, urls, onProgress) => { onProgress?.(urls.length, urls.length); },
  );
  mockExporter.getPlaylistUrl.mockReturnValue('https://open.spotify.com/playlist/pl-remote-id');
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe('usePlaylistExport — initial state', () => {
  it('starts in idle status', () => {
    const { result } = renderHook(() =>
      usePlaylistExport([], 'My Playlist'),
    );
    expect(result.current.status).toBe('idle');
    expect(result.current.playlistUrl).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

// ─── Successful export ────────────────────────────────────────────────────────

describe('usePlaylistExport — successful export', () => {
  it('transitions through authenticating → creating → adding → done', async () => {
    const tracks = [
      makeTrack('t1', 'spotify'),
      makeTrack('t2', 'spotify'),
    ];
    const { result } = renderHook(() =>
      usePlaylistExport(tracks, 'Road Trip', 'description'),
    );

    await act(async () => {
      await result.current.exportTo('spotify');
    });

    expect(result.current.status).toBe('done');
    expect(result.current.playlistUrl).toBe('https://open.spotify.com/playlist/pl-remote-id');
    expect(result.current.progress.added).toBe(2);
    expect(result.current.progress.skipped).toBe(0);
  });

  it('counts tracks with no platform link as skipped', async () => {
    const tracks = [
      makeTrack('t1', 'spotify'),   // has spotify link
      makeTrack('t2'),               // no links at all → skipped
    ];
    const { result } = renderHook(() =>
      usePlaylistExport(tracks, 'Playlist'),
    );

    await act(async () => {
      await result.current.exportTo('spotify');
    });

    expect(result.current.progress.skipped).toBe(1);
    expect(result.current.progress.added).toBe(1);
  });

  it('calls authenticate when isAuthenticated returns false', async () => {
    mockExporter.isAuthenticated.mockResolvedValue(false);
    const { result } = renderHook(() =>
      usePlaylistExport([makeTrack('t1', 'spotify')], 'Pl'),
    );

    await act(async () => {
      await result.current.exportTo('spotify');
    });

    expect(mockExporter.authenticate).toHaveBeenCalledTimes(1);
  });

  it('does NOT call authenticate when already authenticated', async () => {
    const { result } = renderHook(() =>
      usePlaylistExport([makeTrack('t1', 'spotify')], 'Pl'),
    );

    await act(async () => {
      await result.current.exportTo('spotify');
    });

    expect(mockExporter.authenticate).not.toHaveBeenCalled();
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('usePlaylistExport — error handling', () => {
  it('sets status to error when authenticate throws', async () => {
    mockExporter.isAuthenticated.mockResolvedValue(false);
    mockExporter.authenticate.mockRejectedValue(new Error('Auth cancelled'));

    const { result } = renderHook(() =>
      usePlaylistExport([makeTrack('t1', 'spotify')], 'Pl'),
    );

    await act(async () => {
      await result.current.exportTo('spotify');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Auth cancelled');
  });

  it('sets status to error when createPlaylist throws', async () => {
    mockExporter.createPlaylist.mockRejectedValue(new Error('Quota exceeded'));

    const { result } = renderHook(() =>
      usePlaylistExport([makeTrack('t1', 'spotify')], 'Pl'),
    );

    await act(async () => {
      await result.current.exportTo('spotify');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Quota exceeded');
  });

  it('sets a fallback error message for non-Error throws', async () => {
    mockExporter.createPlaylist.mockRejectedValue('oops');

    const { result } = renderHook(() =>
      usePlaylistExport([makeTrack('t1', 'spotify')], 'Pl'),
    );

    await act(async () => {
      await result.current.exportTo('spotify');
    });

    expect(result.current.error).toBe('Export échoué');
  });
});

// ─── reset ────────────────────────────────────────────────────────────────────

describe('usePlaylistExport — reset', () => {
  it('resets to idle after a completed export', async () => {
    const { result } = renderHook(() =>
      usePlaylistExport([makeTrack('t1', 'spotify')], 'Pl'),
    );

    await act(async () => {
      await result.current.exportTo('spotify');
    });
    expect(result.current.status).toBe('done');

    act(() => { result.current.reset(); });
    expect(result.current.status).toBe('idle');
    expect(result.current.playlistUrl).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('resets to idle after a failed export', async () => {
    mockExporter.createPlaylist.mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() =>
      usePlaylistExport([makeTrack('t1', 'spotify')], 'Pl'),
    );

    await act(async () => {
      await result.current.exportTo('spotify');
    });
    expect(result.current.status).toBe('error');

    act(() => { result.current.reset(); });
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });
});
