/**
 * Spec: odesli service
 *
 * Covers fetchLinks: single-call US strategy, metadata parsing, error handling
 * and onProgress callback.
 */
import { fetchLinks } from '../services/odesli';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

type ApiResponseOverrides = {
  title?: string;
  artistName?: string;
  thumbnailUrl?: string;
  omitLinks?: string[];
};

function makeApiResponse(overrides: ApiResponseOverrides = {}) {
  const {
    title = 'Test Song',
    artistName = 'Test Artist',
    thumbnailUrl = 'https://example.com/thumb.jpg',
    omitLinks = [],
  } = overrides;

  const links: Record<string, { url: string }> = {
    spotify:      { url: 'https://open.spotify.com/track/abc' },
    youtubeMusic: { url: 'https://music.youtube.com/watch?v=abc' },
    appleMusic:   { url: 'https://music.apple.com/track/abc' },
    deezer:       { url: 'https://www.deezer.com/track/abc' },
    tidal:        { url: 'https://tidal.com/track/abc' },
  };
  for (const key of omitLinks) delete links[key];

  return {
    entitiesByUniqueId: { 'SPOTIFY_SONG::abc': { title, artistName, thumbnailUrl } },
    linksByPlatform: links,
  };
}

function okResponse(data: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: jest.fn().mockResolvedValue(data) });
}

function errResponse(status: number) {
  return Promise.resolve({ ok: false, status });
}

beforeEach(() => {
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// Successful fetch
// ---------------------------------------------------------------------------

describe('fetchLinks – successful fetch', () => {
  it('returns all platform links', async () => {
    mockFetch.mockReturnValue(okResponse(makeApiResponse()));

    const result = await fetchLinks('https://open.spotify.com/track/abc', 'spotify');

    expect(result).toEqual({
      title: 'Test Song',
      artist: 'Test Artist',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      platformLinks: {
        spotify:      'https://open.spotify.com/track/abc',
        youtubeMusic: 'https://music.youtube.com/watch?v=abc',
        appleMusic:   'https://music.apple.com/track/abc',
        deezer:       'https://www.deezer.com/track/abc',
        tidal:        'https://tidal.com/track/abc',
      },
    });
  });

  it('uses userCountry=US', async () => {
    mockFetch.mockReturnValue(okResponse(makeApiResponse()));
    const trackUrl = 'https://open.spotify.com/track/abc?si=foo';

    await fetchLinks(trackUrl, 'spotify');

    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('userCountry=US');
    expect(calledUrl).toContain(encodeURIComponent(trackUrl));
  });

  it('makes exactly one request', async () => {
    mockFetch.mockReturnValue(okResponse(makeApiResponse()));

    await fetchLinks('https://open.spotify.com/track/abc', 'spotify');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('makes exactly one request when no targetPlatform is given', async () => {
    mockFetch.mockReturnValue(okResponse(makeApiResponse()));

    await fetchLinks('https://open.spotify.com/track/abc');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns empty platformLinks when target platform link is absent', async () => {
    mockFetch.mockReturnValue(okResponse(makeApiResponse({ omitLinks: ['tidal'] })));

    const result = await fetchLinks('https://open.spotify.com/track/abc', 'tidal');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.platformLinks.tidal).toBeUndefined();
    expect(result.title).toBe('Test Song');
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('fetchLinks – error handling', () => {
  it('throws when request returns a non-OK status', async () => {
    mockFetch.mockReturnValue(errResponse(500));

    await expect(fetchLinks('https://open.spotify.com/track/abc')).rejects.toThrow(
      'Odesli API error: 500'
    );
  });

  it('uses "Unknown title" when entity title is missing', async () => {
    mockFetch.mockReturnValue(okResponse({ entitiesByUniqueId: { key: {} }, linksByPlatform: {} }));

    const result = await fetchLinks('https://open.spotify.com/track/abc');
    expect(result.title).toBe('Unknown title');
  });

  it('uses "Unknown artist" when entity artistName is missing', async () => {
    mockFetch.mockReturnValue(okResponse({ entitiesByUniqueId: { key: {} }, linksByPlatform: {} }));

    const result = await fetchLinks('https://open.spotify.com/track/abc');
    expect(result.artist).toBe('Unknown artist');
  });

  it('uses empty string for thumbnailUrl when missing', async () => {
    mockFetch.mockReturnValue(okResponse({ entitiesByUniqueId: { key: {} }, linksByPlatform: {} }));

    const result = await fetchLinks('https://open.spotify.com/track/abc');
    expect(result.thumbnailUrl).toBe('');
  });

  it('returns empty platformLinks when entitiesByUniqueId is empty', async () => {
    mockFetch.mockReturnValue(okResponse({ entitiesByUniqueId: {}, linksByPlatform: {} }));

    const result = await fetchLinks('https://open.spotify.com/track/abc');
    expect(result.platformLinks).toEqual({});
  });

  it('returns empty platformLinks when linksByPlatform is absent', async () => {
    mockFetch.mockReturnValue(okResponse({ entitiesByUniqueId: {} }));

    const result = await fetchLinks('https://open.spotify.com/track/abc');
    expect(result.platformLinks).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// onProgress callback
// ---------------------------------------------------------------------------

describe('fetchLinks – onProgress callback', () => {
  it('calls onProgress with { phase: "start" }', async () => {
    mockFetch.mockReturnValue(okResponse(makeApiResponse()));
    const onProgress = jest.fn();

    await fetchLinks('https://open.spotify.com/track/abc', 'spotify', onProgress);

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({ phase: 'start' });
  });

  it('works when onProgress is not provided', async () => {
    mockFetch.mockReturnValue(okResponse(makeApiResponse()));
    await expect(fetchLinks('https://open.spotify.com/track/abc', 'spotify')).resolves.toBeDefined();
  });
});
