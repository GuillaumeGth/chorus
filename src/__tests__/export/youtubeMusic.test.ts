/**
 * Tests for the YouTube Music playlist exporter.
 * Mocks GoogleSignin and fetch — no network or native calls.
 */
import { youtubeMusicExporter } from '../../services/export/youtubeMusic';

// ─── Mock expo-secure-store ───────────────────────────────────────────────────
const secureStore: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (key: string, value: string) => { secureStore[key] = value; }),
  getItemAsync: jest.fn(async (key: string) => secureStore[key] ?? null),
  deleteItemAsync: jest.fn(async (key: string) => { delete secureStore[key]; }),
}));

// ─── Mock @react-native-google-signin/google-signin ──────────────────────────
const mockAddScopes = jest.fn();
const mockGetTokens = jest.fn();
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    addScopes: (...args: unknown[]) => mockAddScopes(...args),
    getTokens: (...args: unknown[]) => mockGetTokens(...args),
  },
}));

// ─── Mock expo-web-browser (transitively imported) ───────────────────────────
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }));
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async () => new Uint8Array(32).fill(2)),
  digestStringAsync: jest.fn(async () => 'dGVzdA=='),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  Object.keys(secureStore).forEach((k) => delete secureStore[k]);
  mockFetch.mockReset();
  mockAddScopes.mockReset();
  mockGetTokens.mockReset();
  mockGetTokens.mockResolvedValue({ accessToken: 'yt_access_token', idToken: 'id' });
});

// ─── isAuthenticated ──────────────────────────────────────────────────────────

describe('youtubeMusicExporter.isAuthenticated', () => {
  it('returns false when scope has not been granted', async () => {
    expect(await youtubeMusicExporter.isAuthenticated()).toBe(false);
  });

  it('returns true after scope is marked as granted', async () => {
    secureStore['export_youtube_scope_granted'] = 'true';
    expect(await youtubeMusicExporter.isAuthenticated()).toBe(true);
  });
});

// ─── authenticate ─────────────────────────────────────────────────────────────

describe('youtubeMusicExporter.authenticate', () => {
  it('calls GoogleSignin.addScopes with the YouTube scope', async () => {
    mockAddScopes.mockResolvedValueOnce({});
    await youtubeMusicExporter.authenticate();
    expect(mockAddScopes).toHaveBeenCalledWith({
      scopes: ['https://www.googleapis.com/auth/youtube'],
    });
  });

  it('persists scope granted flag after successful addScopes', async () => {
    mockAddScopes.mockResolvedValueOnce({});
    await youtubeMusicExporter.authenticate();
    expect(secureStore['export_youtube_scope_granted']).toBe('true');
  });

  it('propagates errors from GoogleSignin.addScopes', async () => {
    mockAddScopes.mockRejectedValueOnce(new Error('User denied'));
    await expect(youtubeMusicExporter.authenticate()).rejects.toThrow('User denied');
  });
});

// ─── createPlaylist ───────────────────────────────────────────────────────────

describe('youtubeMusicExporter.createPlaylist', () => {
  it('returns the playlist id on success', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'PLabc123' }) });

    const id = await youtubeMusicExporter.createPlaylist('Summer vibes', 'description');
    expect(id).toBe('PLabc123');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.snippet.title).toContain('Chørus');
    expect(body.status.privacyStatus).toBe('private');
  });

  it('passes the access token from GoogleSignin.getTokens', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'pl1' }) });
    await youtubeMusicExporter.createPlaylist('test');
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer yt_access_token');
  });

  it('clears the scope flag and throws on 401', async () => {
    secureStore['export_youtube_scope_granted'] = 'true';
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(youtubeMusicExporter.createPlaylist('test')).rejects.toThrow(/refusé/);
    expect(secureStore['export_youtube_scope_granted']).toBeUndefined();
  });

  it('clears the scope flag and throws on 403', async () => {
    secureStore['export_youtube_scope_granted'] = 'true';
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(youtubeMusicExporter.createPlaylist('test')).rejects.toThrow(/refusé/);
    expect(secureStore['export_youtube_scope_granted']).toBeUndefined();
  });
});

// ─── addTracks ────────────────────────────────────────────────────────────────

describe('youtubeMusicExporter.addTracks', () => {
  it('does nothing for an empty list', async () => {
    await youtubeMusicExporter.addTracks('pl1', []);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('extracts video IDs from youtube.com URLs', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await youtubeMusicExporter.addTracks('pl1', [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.snippet.resourceId.videoId).toBe('dQw4w9WgXcQ');
  });

  it('calls onProgress after each batch', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const urls = ['https://www.youtube.com/watch?v=abc1', 'https://youtu.be/abc2'];
    const onProgress = jest.fn();
    await youtubeMusicExporter.addTracks('pl1', urls, onProgress);
    expect(onProgress).toHaveBeenCalled();
  });

  it('skips videos that fail to insert silently', async () => {
    // One success, one failure — no throw
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(
      youtubeMusicExporter.addTracks('pl1', [
        'https://www.youtube.com/watch?v=ok1',
        'https://www.youtube.com/watch?v=fail2',
      ]),
    ).resolves.toBeUndefined();
  });
});

// ─── getPlaylistUrl ───────────────────────────────────────────────────────────

describe('youtubeMusicExporter.getPlaylistUrl', () => {
  it('returns a music.youtube.com URL', () => {
    expect(youtubeMusicExporter.getPlaylistUrl('PLxyz')).toBe(
      'https://music.youtube.com/playlist?list=PLxyz',
    );
  });
});
