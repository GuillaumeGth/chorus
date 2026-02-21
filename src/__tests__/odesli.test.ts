/**
 * Spec: odesli service
 *
 * Covers fetchLinks: country fallback strategy, metadata parsing, error handling
 * and onProgress callbacks.
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
  it('returns all platform links from the FR response', async () => {
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

  it('uses userCountry=FR on the first request', async () => {
    mockFetch.mockReturnValue(okResponse(makeApiResponse()));
    const trackUrl = 'https://open.spotify.com/track/abc?si=foo';

    await fetchLinks(trackUrl, 'spotify');

    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('userCountry=FR');
    expect(calledUrl).toContain(encodeURIComponent(trackUrl));
  });

  it('makes only one request when target platform is found on first try', async () => {
    mockFetch.mockReturnValue(okResponse(makeApiResponse()));

    await fetchLinks('https://open.spotify.com/track/abc', 'spotify');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('makes only one request when no targetPlatform is given', async () => {
    mockFetch.mockReturnValue(okResponse(makeApiResponse()));

    await fetchLinks('https://open.spotify.com/track/abc');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// US retry
// ---------------------------------------------------------------------------

describe('fetchLinks – US retry', () => {
  it('retries with US when FR result is missing the target platform link', async () => {
    mockFetch
      .mockReturnValueOnce(okResponse(makeApiResponse({ omitLinks: ['tidal'] })))
      .mockReturnValueOnce(okResponse(makeApiResponse()));

    const result = await fetchLinks('https://open.spotify.com/track/abc', 'tidal');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][0]).toContain('userCountry=US');
    expect(result.platformLinks.tidal).toBe('https://tidal.com/track/abc');
  });

  it('returns US result when it contains the target platform link', async () => {
    const usResponse = makeApiResponse();
    mockFetch
      .mockReturnValueOnce(okResponse(makeApiResponse({ omitLinks: ['tidal'] })))
      .mockReturnValueOnce(okResponse(usResponse));

    const result = await fetchLinks('https://open.spotify.com/track/abc', 'tidal');

    expect(result.platformLinks.tidal).toBe('https://tidal.com/track/abc');
  });

  it('returns FR result when US retry also lacks target platform', async () => {
    const noTidal = makeApiResponse({ omitLinks: ['tidal'] });
    mockFetch
      .mockReturnValueOnce(okResponse(noTidal))
      .mockReturnValueOnce(okResponse(noTidal));

    const result = await fetchLinks('https://open.spotify.com/track/abc', 'tidal');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.platformLinks.tidal).toBeUndefined();
    expect(result.title).toBe('Test Song');
  });

  it('returns FR result silently when US retry throws a network error', async () => {
    mockFetch
      .mockReturnValueOnce(okResponse(makeApiResponse({ omitLinks: ['tidal'] })))
      .mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchLinks('https://open.spotify.com/track/abc', 'tidal');

    expect(result.title).toBe('Test Song');
    expect(result.platformLinks.tidal).toBeUndefined();
  });

  it('returns FR result silently when US request returns a non-OK status', async () => {
    mockFetch
      .mockReturnValueOnce(okResponse(makeApiResponse({ omitLinks: ['tidal'] })))
      .mockReturnValueOnce(errResponse(404));

    const result = await fetchLinks('https://open.spotify.com/track/abc', 'tidal');

    expect(result.title).toBe('Test Song');
    expect(result.platformLinks.tidal).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('fetchLinks – error handling', () => {
  it('throws when FR request returns a non-OK status', async () => {
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

    expect(onProgress).toHaveBeenCalledWith({ phase: 'start' });
  });

  it('calls onProgress with { phase: "retry" } when US retry is triggered', async () => {
    mockFetch
      .mockReturnValueOnce(okResponse(makeApiResponse({ omitLinks: ['tidal'] })))
      .mockReturnValueOnce(okResponse(makeApiResponse()));
    const onProgress = jest.fn();

    await fetchLinks('https://open.spotify.com/track/abc', 'tidal', onProgress);

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, { phase: 'start' });
    expect(onProgress).toHaveBeenNthCalledWith(2, {
      phase: 'retry',
      title: 'Test Song',
      artist: 'Test Artist',
    });
  });

  it('does NOT call onProgress with retry when first request succeeds', async () => {
    mockFetch.mockReturnValue(okResponse(makeApiResponse()));
    const onProgress = jest.fn();

    await fetchLinks('https://open.spotify.com/track/abc', 'spotify', onProgress);

    expect(onProgress).toHaveBeenCalledTimes(1);
  });

  it('works when onProgress is not provided', async () => {
    mockFetch.mockReturnValue(okResponse(makeApiResponse()));
    await expect(fetchLinks('https://open.spotify.com/track/abc', 'spotify')).resolves.toBeDefined();
  });
});
