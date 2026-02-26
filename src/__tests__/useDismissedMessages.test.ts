/**
 * Spec: useDismissedMessages
 *
 * Covers restoring dismissed IDs from AsyncStorage on mount,
 * dismissing messages, undismissing (undo), and persistence.
 */
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDismissedMessages } from '../hooks/useDismissedMessages';

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
  it('starts with an empty dismissed set', () => {
    const { result } = renderHook(() => useDismissedMessages());
    expect(result.current.dismissed.size).toBe(0);
  });

  it('restores persisted dismissed IDs from AsyncStorage', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify(['msg1', 'msg2']));

    const { result } = renderHook(() => useDismissedMessages());
    await act(async () => {});

    expect(result.current.dismissed.has('msg1')).toBe(true);
    expect(result.current.dismissed.has('msg2')).toBe(true);
  });

  it('starts empty when AsyncStorage returns null', async () => {
    mockGetItem.mockResolvedValue(null);

    const { result } = renderHook(() => useDismissedMessages());
    await act(async () => {});

    expect(result.current.dismissed.size).toBe(0);
  });

  it('reads from the correct AsyncStorage key', async () => {
    const { result: _ } = renderHook(() => useDismissedMessages());
    await act(async () => {});

    expect(mockGetItem).toHaveBeenCalledWith('@chorus/dismissedMessages_v2');
  });
});

// ---------------------------------------------------------------------------
// dismiss
// ---------------------------------------------------------------------------

describe('dismiss', () => {
  it('adds the message ID to the dismissed set', async () => {
    const { result } = renderHook(() => useDismissedMessages());
    await act(async () => {});

    act(() => { result.current.dismiss('msg1'); });

    expect(result.current.dismissed.has('msg1')).toBe(true);
  });

  it('persists the updated set to AsyncStorage', async () => {
    const { result } = renderHook(() => useDismissedMessages());
    await act(async () => {});

    act(() => { result.current.dismiss('msg1'); });
    await act(async () => {});

    expect(mockSetItem).toHaveBeenCalledWith(
      '@chorus/dismissedMessages_v2',
      JSON.stringify(['msg1'])
    );
  });

  it('accumulates multiple dismissed IDs', async () => {
    const { result } = renderHook(() => useDismissedMessages());
    await act(async () => {});

    act(() => { result.current.dismiss('msg1'); });
    act(() => { result.current.dismiss('msg2'); });
    act(() => { result.current.dismiss('msg3'); });

    expect(result.current.dismissed.size).toBe(3);
    expect(result.current.dismissed.has('msg2')).toBe(true);
  });

  it('is idempotent for the same ID', async () => {
    const { result } = renderHook(() => useDismissedMessages());
    await act(async () => {});

    act(() => { result.current.dismiss('msg1'); });
    act(() => { result.current.dismiss('msg1'); });

    expect(result.current.dismissed.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// undismiss
// ---------------------------------------------------------------------------

describe('undismiss', () => {
  it('removes the message ID from the dismissed set', async () => {
    const { result } = renderHook(() => useDismissedMessages());
    await act(async () => {});

    act(() => { result.current.dismiss('msg1'); });
    expect(result.current.dismissed.has('msg1')).toBe(true);

    act(() => { result.current.undismiss('msg1'); });
    expect(result.current.dismissed.has('msg1')).toBe(false);
  });

  it('is a no-op for a non-dismissed ID', async () => {
    const { result } = renderHook(() => useDismissedMessages());
    await act(async () => {});

    expect(() => {
      act(() => { result.current.undismiss('non-existent'); });
    }).not.toThrow();

    expect(result.current.dismissed.size).toBe(0);
  });

  it('persists the removal to AsyncStorage', async () => {
    const { result } = renderHook(() => useDismissedMessages());
    await act(async () => {});

    act(() => { result.current.dismiss('msg1'); });
    await act(async () => {});

    act(() => { result.current.undismiss('msg1'); });
    await act(async () => {});

    const lastCall = mockSetItem.mock.calls[mockSetItem.mock.calls.length - 1];
    expect(JSON.parse(lastCall[1])).toEqual([]);
  });

  it('only removes the target ID, leaving others intact', async () => {
    const { result } = renderHook(() => useDismissedMessages());
    await act(async () => {});

    act(() => { result.current.dismiss('msg1'); });
    act(() => { result.current.dismiss('msg2'); });
    act(() => { result.current.undismiss('msg1'); });

    expect(result.current.dismissed.has('msg1')).toBe(false);
    expect(result.current.dismissed.has('msg2')).toBe(true);
  });
});
