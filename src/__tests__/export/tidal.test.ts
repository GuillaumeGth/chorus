/**
 * Tests for the Tidal playlist exporter.
 * All network calls and native modules are mocked.
 */
import { tidalExporter } from '../../services/export/tidal';

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
  getRandomBytesAsync: jest.fn(async () => new Uint8Array(32).fill(4)),
  digestStringAsync: jest.fn(async () => 'dGVzdA=='),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
}));

// ─── Mock export config ───────────────────────────────────────────────────────
jest.mock('../../services/export/config', () => ({
  exportConfig: { tidalClientId: 'tidal-client-id' },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  Object.keys(secureStore).forEach((k) => delete secureStore[k]);
  mockFetch.mockReset();
  mockOpenAuth.mockReset();
});

// ─── isAuthenticated ──────────────────────────────────────────────────────────

describe('tidalExporter.isAuthenticated', () => {
  it('returns false when no token is stored', async () => {
    expect(await tidalExporter.isAuthenticated()).toBe(false);
  });

  it('returns true when a valid token exists', async () => {
    secureStore['export_tidal_token'] = JSON.stringify({
      accessToken: 'td_tok',
      expiresAt: Date.now() + 3600_000,
    });
    expect(await tidalExporter.isAuthenticated()).toBe(true);
  });
});

// ─── authenticate ─────────────────────────────────────────────────────────────

describe('tidalExporter.authenticate', () => {
  it('throws when tidalClientId is not configured', async () => {
    const { exportConfig } = jest.requireMock('../../services/export/config') as {
      exportConfig: { tidalClientId: string };
    };
    const orig = exportConfig.tidalClientId;
    exportConfig.tidalClientId = '';
    await expect(tidalExporter.authenticate()).rejects.toThrow(/EXPO_PUBLIC_TIDAL_CLIENT_ID/);
    exportConfig.tidalClientId = orig;
  });

  it('throws when the user cancels the OAuth flow', async () => {
    mockOpenAuth.mockResolvedValueOnce({ type: 'cancel' });
    await expect(tidalExporter.authenticate()).rejects.toThrow(/annulée/);
  });

  it('throws on CSRF state mismatch', async () => {
    mockOpenAuth.mockResolvedValueOnce({
      type: 'success',
      url: 'chorus://oauth/tidal?code=abc&state=wrongstate',
    });
    await expect(tidalExporter.authenticate()).rejects.toThrow(/CSRF/);
  });

  it('persists the access token on success', async () => {
    let capturedState = '';
    mockOpenAuth.mockImplementation(async (url: string) => {
      capturedState = new URL(url).searchParams.get('state') ?? '';
      return {
        type: 'success',
        url: `chorus://oauth/tidal?code=tidalcode&state=${capturedState}`,
      };
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'td_access',
        refresh_token: 'td_refresh',
        expires_in: 3600,
      }),
    });

    await tidalExporter.authenticate();
    const stored = JSON.parse(secureStore['export_tidal_token'] ?? 'null');
    expect(stored.accessToken).toBe('td_access');
  });
});

// ─── createPlaylist ───────────────────────────────────────────────────────────

describe('tidalExporter.createPlaylist', () => {
  beforeEach(() => {
    secureStore['export_tidal_token'] = JSON.stringify({
      accessToken: 'td_valid',
      expiresAt: Date.now() + 3600_000,
    });
  });

  it('returns the playlist id on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { id: 'tid-playlist-001' } }),
    });

    const id = await tidalExporter.createPlaylist('Playlist name', 'description');
    expect(id).toBe('tid-playlist-001');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.data.attributes.name).toContain('Chørus');
    expect(body.data.attributes.privacy).toBe('PRIVATE');
  });

  it('throws when not authenticated', async () => {
    delete secureStore['export_tidal_token'];
    await expect(tidalExporter.createPlaylist('test')).rejects.toThrow(/Non authentifié/);
  });

  it('clears the token and throws on 401', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    await expect(tidalExporter.createPlaylist('test')).rejects.toThrow(/expirée/);
    expect(secureStore['export_tidal_token']).toBeUndefined();
  });
});

// ─── addTracks ────────────────────────────────────────────────────────────────

describe('tidalExporter.addTracks', () => {
  beforeEach(() => {
    secureStore['export_tidal_token'] = JSON.stringify({
      accessToken: 'td_valid',
      expiresAt: Date.now() + 3600_000,
    });
  });

  it('does nothing for an empty list', async () => {
    await tidalExporter.addTracks('pl1', []);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('extracts TIDAL track IDs from URLs and sends them as JSON:API', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await tidalExporter.addTracks('pl1', [
      'https://listen.tidal.com/track/59727857',
    ]);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.data).toEqual([{ type: 'tracks', id: '59727857' }]);
  });

  it('calls onProgress after each batch', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const urls = Array.from(
      { length: 3 },
      (_, i) => `https://listen.tidal.com/track/${i + 100}`,
    );
    const onProgress = jest.fn();
    await tidalExporter.addTracks('pl1', urls, onProgress);
    expect(onProgress).toHaveBeenCalledWith(3, 3);
  });
});

// ─── getPlaylistUrl ───────────────────────────────────────────────────────────

describe('tidalExporter.getPlaylistUrl', () => {
  it('returns a listen.tidal.com URL', () => {
    expect(tidalExporter.getPlaylistUrl('td-pl-123')).toBe(
      'https://listen.tidal.com/playlist/td-pl-123',
    );
  });
});
