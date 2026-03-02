/**
 * Tests for the Deezer playlist exporter.
 * All network calls and native modules are mocked.
 */
import { deezerExporter } from '../../services/export/deezer';

// ─── Mock expo-secure-store ───────────────────────────────────────────────────
const secureStore: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (key: string, value: string) => { secureStore[key] = value; }),
  getItemAsync: jest.fn(async (key: string) => secureStore[key] ?? null),
  deleteItemAsync: jest.fn(async (key: string) => { delete secureStore[key]; }),
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));
import * as WebBrowser from 'expo-web-browser';
const mockOpenAuth = WebBrowser.openAuthSessionAsync as jest.Mock;

jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async () => new Uint8Array(32).fill(3)),
  digestStringAsync: jest.fn(async () => 'dGVzdA=='),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
}));

// ─── Mock export config ───────────────────────────────────────────────────────
jest.mock('../../services/export/config', () => ({
  exportConfig: { deezerAppId: 'dz-app-id' },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  Object.keys(secureStore).forEach((k) => delete secureStore[k]);
  mockFetch.mockReset();
  mockOpenAuth.mockReset();
});

// ─── isAuthenticated ──────────────────────────────────────────────────────────

describe('deezerExporter.isAuthenticated', () => {
  it('returns false when no token is stored', async () => {
    expect(await deezerExporter.isAuthenticated()).toBe(false);
  });

  it('returns true when a valid token exists', async () => {
    secureStore['export_deezer_token'] = JSON.stringify({
      accessToken: 'dz_tok',
      expiresAt: Date.now() + 3600_000,
    });
    expect(await deezerExporter.isAuthenticated()).toBe(true);
  });
});

// ─── authenticate ─────────────────────────────────────────────────────────────

describe('deezerExporter.authenticate', () => {
  it('throws when deezerAppId is not configured', async () => {
    const { exportConfig } = jest.requireMock('../../services/export/config') as {
      exportConfig: { deezerAppId: string };
    };
    const orig = exportConfig.deezerAppId;
    exportConfig.deezerAppId = '';
    await expect(deezerExporter.authenticate()).rejects.toThrow(/EXPO_PUBLIC_DEEZER_APP_ID/);
    exportConfig.deezerAppId = orig;
  });

  it('throws when the user cancels the OAuth flow', async () => {
    mockOpenAuth.mockResolvedValueOnce({ type: 'cancel' });
    await expect(deezerExporter.authenticate()).rejects.toThrow(/annulée/);
  });

  it('extracts the access_token from the URL fragment', async () => {
    mockOpenAuth.mockResolvedValueOnce({
      type: 'success',
      url: 'chorus://oauth/deezer#access_token=dz_access&expires=3600',
    });

    await deezerExporter.authenticate();
    const stored = JSON.parse(secureStore['export_deezer_token'] ?? 'null');
    expect(stored.accessToken).toBe('dz_access');
  });

  it('throws when access_token is absent from the fragment', async () => {
    mockOpenAuth.mockResolvedValueOnce({
      type: 'success',
      url: 'chorus://oauth/deezer#error=access_denied',
    });
    await expect(deezerExporter.authenticate()).rejects.toThrow(/Token Deezer absent/);
  });
});

// ─── createPlaylist ───────────────────────────────────────────────────────────

describe('deezerExporter.createPlaylist', () => {
  beforeEach(() => {
    secureStore['export_deezer_token'] = JSON.stringify({
      accessToken: 'dz_valid',
      expiresAt: Date.now() + 3600_000,
    });
  });

  it('returns the playlist id as a string', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 9876543 }) });

    const id = await deezerExporter.createPlaylist('Summer vibes');
    expect(id).toBe('9876543');
  });

  it('throws when not authenticated', async () => {
    delete secureStore['export_deezer_token'];
    await expect(deezerExporter.createPlaylist('test')).rejects.toThrow(/Non authentifié/);
  });

  it('clears the token and throws on 401', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    await expect(deezerExporter.createPlaylist('test')).rejects.toThrow(/expirée/);
    expect(secureStore['export_deezer_token']).toBeUndefined();
  });
});

// ─── addTracks ────────────────────────────────────────────────────────────────

describe('deezerExporter.addTracks', () => {
  beforeEach(() => {
    secureStore['export_deezer_token'] = JSON.stringify({
      accessToken: 'dz_valid',
      expiresAt: Date.now() + 3600_000,
    });
  });

  it('does nothing for an empty list', async () => {
    await deezerExporter.addTracks('pl1', []);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('extracts Deezer track IDs from URLs', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => true });

    await deezerExporter.addTracks('pl1', ['https://www.deezer.com/track/3135556']);
    const body = new URLSearchParams(mockFetch.mock.calls[0][1].body as string);
    expect(body.get('songs')).toBe('3135556');
  });

  it('joins multiple IDs with comma in a single request', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => true });

    await deezerExporter.addTracks('pl1', [
      'https://www.deezer.com/track/111',
      'https://www.deezer.com/track/222',
      'https://www.deezer.com/track/333',
    ]);
    const body = new URLSearchParams(mockFetch.mock.calls[0][1].body as string);
    expect(body.get('songs')).toBe('111,222,333');
  });

  it('calls onProgress after each batch', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => true });
    const urls = Array.from(
      { length: 3 },
      (_, i) => `https://www.deezer.com/track/${i + 1}`,
    );
    const onProgress = jest.fn();
    await deezerExporter.addTracks('pl1', urls, onProgress);
    expect(onProgress).toHaveBeenCalledWith(3, 3);
  });
});

// ─── getPlaylistUrl ───────────────────────────────────────────────────────────

describe('deezerExporter.getPlaylistUrl', () => {
  it('returns a deezer.com playlist URL', () => {
    expect(deezerExporter.getPlaylistUrl('9876543')).toBe(
      'https://www.deezer.com/playlist/9876543',
    );
  });
});
