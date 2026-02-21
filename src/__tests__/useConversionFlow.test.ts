/**
 * Spec: useConversionFlow – share intent state machine
 *
 * Invariant: when pendingUrl is set and status === 'idle', showContactPicker
 * MUST be true. This prevents the "sometimes can't reach contact picker" bug
 * caused by:
 *   1. A stale fetchLinks callback overriding the idle state after a new share
 *      intent arrives.
 *   2. convertingRef staying true after the previous conversion, blocking
 *      startConversion for the new pick.
 */
import { renderHook, act } from '@testing-library/react-native';
import { useConversionFlow } from '../hooks/useConversionFlow';
import type { FetchFn } from '../hooks/useConversionFlow';
import type { OdesliResult } from '../services/odesli';

const MOCK_RESULT: OdesliResult = {
  title: 'Test Song',
  artist: 'Test Artist',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  platformLinks: {
    spotify: 'https://open.spotify.com/track/test',
    youtubeMusic: 'https://music.youtube.com/watch?v=test',
  },
};

const SPOTIFY_URL = 'https://open.spotify.com/track/abc';
const SPOTIFY_URL_2 = 'https://open.spotify.com/track/xyz';

function makeHook(fetchFn: FetchFn = jest.fn().mockResolvedValue(MOCK_RESULT)) {
  return renderHook(() => useConversionFlow({ platform: 'spotify', fetchFn }));
}

// ---------------------------------------------------------------------------
// Basic lifecycle
// ---------------------------------------------------------------------------

describe('initial state', () => {
  it('starts idle with no pending URL and picker hidden', () => {
    const { result } = makeHook();
    expect(result.current.status).toBe('idle');
    expect(result.current.pendingUrl).toBeNull();
    expect(result.current.showContactPicker).toBe(false);
    expect(result.current.result).toBeNull();
  });
});

describe('onShareIntent', () => {
  it('sets pendingUrl, keeps status idle, shows contact picker', () => {
    const { result } = makeHook();

    act(() => { result.current.onShareIntent(SPOTIFY_URL); });

    expect(result.current.pendingUrl).toBe(SPOTIFY_URL);
    expect(result.current.status).toBe('idle');
    expect(result.current.showContactPicker).toBe(true);
  });

  it('replaces a previous pendingUrl', () => {
    const { result } = makeHook();

    act(() => { result.current.onShareIntent(SPOTIFY_URL); });
    act(() => { result.current.onShareIntent(SPOTIFY_URL_2); });

    expect(result.current.pendingUrl).toBe(SPOTIFY_URL_2);
    expect(result.current.showContactPicker).toBe(true);
  });

  it('clears a previous result', async () => {
    const fetchFn = jest.fn().mockResolvedValue(MOCK_RESULT);
    const { result } = makeHook(fetchFn);

    act(() => { result.current.onShareIntent(SPOTIFY_URL); });
    await act(async () => { result.current.startConversion(SPOTIFY_URL); });
    expect(result.current.status).toBe('success');

    act(() => { result.current.onShareIntent(SPOTIFY_URL_2); });
    expect(result.current.result).toBeNull();
    expect(result.current.status).toBe('idle');
  });
});

describe('startConversion', () => {
  it('transitions to loading state', () => {
    const fetchFn: FetchFn = jest.fn(() => new Promise(() => {})); // never resolves
    const { result } = makeHook(fetchFn);

    act(() => { result.current.onShareIntent(SPOTIFY_URL); });
    act(() => { result.current.startConversion(SPOTIFY_URL); });

    expect(result.current.status).toBe('loading');
    expect(result.current.showContactPicker).toBe(false);
  });

  it('transitions to success when fetch resolves', async () => {
    const fetchFn = jest.fn().mockResolvedValue(MOCK_RESULT);
    const { result } = makeHook(fetchFn);

    act(() => { result.current.onShareIntent(SPOTIFY_URL); });
    await act(async () => { result.current.startConversion(SPOTIFY_URL); });

    expect(result.current.status).toBe('success');
    expect(result.current.result).toEqual(MOCK_RESULT);
  });

  it('transitions to error when fetch rejects', async () => {
    const fetchFn: FetchFn = jest.fn().mockRejectedValue(new Error('Network error'));
    const { result } = makeHook(fetchFn);

    act(() => { result.current.onShareIntent(SPOTIFY_URL); });
    await act(async () => { result.current.startConversion(SPOTIFY_URL); });

    expect(result.current.status).toBe('error');
    expect(result.current.errorMsg).toBe('Network error');
  });

  it('is a no-op when a conversion is already in flight', () => {
    const fetchFn: FetchFn = jest.fn(() => new Promise(() => {}));
    const { result } = makeHook(fetchFn);

    act(() => { result.current.onShareIntent(SPOTIFY_URL); });
    act(() => { result.current.startConversion(SPOTIFY_URL); });
    act(() => { result.current.startConversion(SPOTIFY_URL); }); // double call

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Bug regression: new share intent while conversion is in progress
// ---------------------------------------------------------------------------

describe('BUG regression: new share intent while conversion in progress', () => {
  it('shows contact picker immediately when intent arrives mid-conversion', async () => {
    let resolveFirst!: (r: OdesliResult) => void;
    const fetchFn: FetchFn = jest.fn(
      () => new Promise<OdesliResult>((resolve) => { resolveFirst = resolve; }),
    );
    const { result } = makeHook(fetchFn);

    // 1. Start a conversion (clipboard or previous intent)
    act(() => { result.current.onShareIntent(SPOTIFY_URL); });
    act(() => { result.current.startConversion(SPOTIFY_URL); });
    expect(result.current.status).toBe('loading');

    // 2. New share intent arrives while first fetch is still pending
    act(() => { result.current.onShareIntent(SPOTIFY_URL_2); });

    // 3. Contact picker MUST be visible immediately
    expect(result.current.status).toBe('idle');
    expect(result.current.showContactPicker).toBe(true);
    expect(result.current.pendingUrl).toBe(SPOTIFY_URL_2);

    // 4. First fetch eventually resolves – must NOT override the idle state
    await act(async () => { resolveFirst(MOCK_RESULT); });
    expect(result.current.status).toBe('idle');
    expect(result.current.showContactPicker).toBe(true);
    expect(result.current.result).toBeNull(); // stale result discarded
  });
});

// ---------------------------------------------------------------------------
// Bug regression: stale fetch result must be discarded
// ---------------------------------------------------------------------------

describe('BUG regression: stale fetch result discarded after new intent', () => {
  it('does not set result/status from a fetch started before the new intent', async () => {
    let resolveStale!: (r: OdesliResult) => void;
    const fetchFn: FetchFn = jest
      .fn()
      .mockImplementationOnce(
        () => new Promise<OdesliResult>((resolve) => { resolveStale = resolve; }),
      )
      .mockResolvedValue(MOCK_RESULT);

    const { result } = makeHook(fetchFn);

    // 1. Conversion A starts
    act(() => { result.current.onShareIntent(SPOTIFY_URL); });
    act(() => { result.current.startConversion(SPOTIFY_URL, 'youtubeMusic'); });
    expect(result.current.status).toBe('loading');

    // 2. New intent B arrives
    act(() => { result.current.onShareIntent(SPOTIFY_URL_2); });
    expect(result.current.status).toBe('idle');

    // 3. Stale fetch A resolves
    await act(async () => { resolveStale(MOCK_RESULT); });

    // 4. State must remain idle (picker still visible)
    expect(result.current.status).toBe('idle');
    expect(result.current.result).toBeNull();
    expect(result.current.showContactPicker).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Bug regression: convertingRef reset so new conversion can start
// ---------------------------------------------------------------------------

describe('BUG regression: convertingRef cleared on new share intent', () => {
  it('allows startConversion after a new intent even if previous was in-flight', async () => {
    let resolveFirst!: (r: OdesliResult) => void;
    const fetchFn: FetchFn = jest
      .fn()
      .mockImplementationOnce(
        () => new Promise<OdesliResult>((resolve) => { resolveFirst = resolve; }),
      )
      .mockResolvedValue(MOCK_RESULT);

    const { result } = makeHook(fetchFn);

    // 1. First conversion in-flight (convertingRef = true)
    act(() => { result.current.onShareIntent(SPOTIFY_URL); });
    act(() => { result.current.startConversion(SPOTIFY_URL); });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // 2. New intent resets convertingRef
    act(() => { result.current.onShareIntent(SPOTIFY_URL_2); });

    // 3. User picks a contact → startConversion must not be blocked
    await act(async () => {
      result.current.startConversion(SPOTIFY_URL_2, 'youtubeMusic');
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('success');
  });
});

// ---------------------------------------------------------------------------
// reset
// ---------------------------------------------------------------------------

describe('reset', () => {
  it('clears all state and hides the picker', async () => {
    const fetchFn = jest.fn().mockResolvedValue(MOCK_RESULT);
    const { result } = makeHook(fetchFn);

    act(() => { result.current.onShareIntent(SPOTIFY_URL); });
    await act(async () => { result.current.startConversion(SPOTIFY_URL); });
    expect(result.current.status).toBe('success');

    act(() => { result.current.reset(); });

    expect(result.current.status).toBe('idle');
    expect(result.current.pendingUrl).toBeNull();
    expect(result.current.result).toBeNull();
    expect(result.current.showContactPicker).toBe(false);
  });

  it('invalidates an in-flight fetch so it cannot restore status', async () => {
    let resolveLate!: (r: OdesliResult) => void;
    const fetchFn: FetchFn = jest.fn(
      () => new Promise<OdesliResult>((resolve) => { resolveLate = resolve; }),
    );
    const { result } = makeHook(fetchFn);

    act(() => { result.current.onShareIntent(SPOTIFY_URL); });
    act(() => { result.current.startConversion(SPOTIFY_URL); });
    expect(result.current.status).toBe('loading');

    act(() => { result.current.reset(); });
    expect(result.current.status).toBe('idle');

    // In-flight fetch resolves after reset
    await act(async () => { resolveLate(MOCK_RESULT); });

    // Must remain idle, not jump to 'success'
    expect(result.current.status).toBe('idle');
    expect(result.current.result).toBeNull();
  });

  it('allows a fresh share intent after reset', async () => {
    const fetchFn = jest.fn().mockResolvedValue(MOCK_RESULT);
    const { result } = makeHook(fetchFn);

    // Full cycle 1
    act(() => { result.current.onShareIntent(SPOTIFY_URL); });
    await act(async () => { result.current.startConversion(SPOTIFY_URL); });
    expect(result.current.status).toBe('success');
    act(() => { result.current.reset(); });
    expect(result.current.pendingUrl).toBeNull();

    // Full cycle 2
    act(() => { result.current.onShareIntent(SPOTIFY_URL_2); });
    expect(result.current.showContactPicker).toBe(true);
    expect(result.current.pendingUrl).toBe(SPOTIFY_URL_2);
  });
});
