/**
 * Spec: searchMusic
 *
 * Calls the Deezer public search API and maps the response to MusicSearchResult[].
 * Returns an empty array for blank queries. Throws on HTTP or API-level errors.
 */
import { searchMusic } from '../services/musicSearch';
import type { MusicSearchResult } from '../services/musicSearch';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeezerTrack(id: number) {
  return {
    id,
    title: `Track ${id}`,
    link: `https://www.deezer.com/track/${id}`,
    artist: { name: `Artist ${id}` },
    album:  { cover_medium: `https://img.example.com/${id}.jpg` },
  };
}

function mockDeezerOk(tracks: ReturnType<typeof makeDeezerTrack>[]) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: tracks }),
  } as Response);
}

function mockDeezerHttpError(status: number) {
  mockFetch.mockResolvedValue({ ok: false, status } as Response);
}

function mockDeezerApiError(code: number, message: string) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({ data: [], error: { code, message, type: 'DataException' } }),
  } as Response);
}

beforeEach(() => jest.resetAllMocks());

// ---------------------------------------------------------------------------
// searchMusic
// ---------------------------------------------------------------------------

describe('searchMusic', () => {
  it('returns an empty array for a blank query without hitting the network', async () => {
    const result = await searchMusic('   ');
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns an empty array for an empty string without hitting the network', async () => {
    const result = await searchMusic('');
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('calls the Deezer API with the URL-encoded query', async () => {
    mockDeezerOk([]);
    await searchMusic('daft punk');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('q=daft%20punk'),
    );
  });

  it('includes a limit parameter in the request URL', async () => {
    mockDeezerOk([]);
    await searchMusic('test');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('limit='),
    );
  });

  it('maps a Deezer response to MusicSearchResult[]', async () => {
    const tracks = [makeDeezerTrack(1), makeDeezerTrack(2)];
    mockDeezerOk(tracks);

    const results: MusicSearchResult[] = await searchMusic('test');

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      url:          'https://www.deezer.com/track/1',
      title:        'Track 1',
      artist:       'Artist 1',
      thumbnailUrl: 'https://img.example.com/1.jpg',
    });
    expect(results[1]).toEqual({
      url:          'https://www.deezer.com/track/2',
      title:        'Track 2',
      artist:       'Artist 2',
      thumbnailUrl: 'https://img.example.com/2.jpg',
    });
  });

  it('returns an empty array when Deezer data array is empty', async () => {
    mockDeezerOk([]);
    const results = await searchMusic('unlikely query xyzzy');
    expect(results).toEqual([]);
  });

  it('throws on HTTP error (e.g. 500)', async () => {
    mockDeezerHttpError(500);
    await expect(searchMusic('test')).rejects.toThrow('Deezer API error: 500');
  });

  it('throws on HTTP 403', async () => {
    mockDeezerHttpError(403);
    await expect(searchMusic('test')).rejects.toThrow('Deezer API error: 403');
  });

  it('throws when Deezer returns an API-level error', async () => {
    mockDeezerApiError(800, 'no data');
    await expect(searchMusic('test')).rejects.toThrow('Deezer error 800: no data');
  });
});
