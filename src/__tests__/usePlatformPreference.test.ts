/**
 * Spec: usePlatformPreference
 *
 * Covers loading the saved platform from AsyncStorage on mount,
 * persisting a new selection, and the loaded flag lifecycle.
 */
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePlatformPreference } from '../hooks/usePlatformPreference';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  mockGetItem.mockResolvedValue(null);
  mockSetItem.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('initial state', () => {
  it('starts with platform null and loaded false before the effect runs', () => {
    const { result } = renderHook(() => usePlatformPreference());
    expect(result.current.platform).toBeNull();
    expect(result.current.loaded).toBe(false);
  });

  it('sets loaded to true and keeps platform null when nothing is stored', async () => {
    mockGetItem.mockResolvedValue(null);

    const { result } = renderHook(() => usePlatformPreference());
    await act(async () => {});

    expect(result.current.platform).toBeNull();
    expect(result.current.loaded).toBe(true);
  });

  it('loads the stored platform and sets loaded to true', async () => {
    mockGetItem.mockResolvedValue('spotify');

    const { result } = renderHook(() => usePlatformPreference());
    await act(async () => {});

    expect(result.current.platform).toBe('spotify');
    expect(result.current.loaded).toBe(true);
  });

  it('reads from the correct AsyncStorage key', async () => {
    const { result: _ } = renderHook(() => usePlatformPreference());
    await act(async () => {});

    expect(mockGetItem).toHaveBeenCalledWith('@chorus/platform');
  });
});

// ---------------------------------------------------------------------------
// setPlatform
// ---------------------------------------------------------------------------

describe('setPlatform', () => {
  it('updates in-memory state immediately', async () => {
    const { result } = renderHook(() => usePlatformPreference());
    await act(async () => {});

    await act(async () => { await result.current.setPlatform('youtubeMusic'); });

    expect(result.current.platform).toBe('youtubeMusic');
  });

  it('persists the selection to AsyncStorage', async () => {
    const { result } = renderHook(() => usePlatformPreference());
    await act(async () => {});

    await act(async () => { await result.current.setPlatform('deezer'); });

    expect(mockSetItem).toHaveBeenCalledWith('@chorus/platform', 'deezer');
  });

  it('can switch platforms multiple times', async () => {
    const { result } = renderHook(() => usePlatformPreference());
    await act(async () => {});

    await act(async () => { await result.current.setPlatform('spotify'); });
    expect(result.current.platform).toBe('spotify');

    await act(async () => { await result.current.setPlatform('tidal'); });
    expect(result.current.platform).toBe('tidal');
  });

  it('persists each platform change with the latest value', async () => {
    const { result } = renderHook(() => usePlatformPreference());
    await act(async () => {});

    await act(async () => { await result.current.setPlatform('appleMusic'); });
    await act(async () => { await result.current.setPlatform('spotify'); });

    const lastCall = mockSetItem.mock.calls[mockSetItem.mock.calls.length - 1];
    expect(lastCall).toEqual(['@chorus/platform', 'spotify']);
  });
});
