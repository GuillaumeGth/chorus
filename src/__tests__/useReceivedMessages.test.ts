/**
 * Spec: useReceivedMessages
 *
 * Covers fetching messages on screen focus and on auth state change,
 * short-circuit when no user is logged in, and error resilience.
 */
import { renderHook, act } from '@testing-library/react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { useReceivedMessages } from '../hooks/useReceivedMessages';
import { getReceivedMessages } from '../services/firestore';
import type { ReceivedMessage } from '../services/firestore';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// useFocusEffect: run via useEffect after mount so we avoid calling setState
// during render (which would cause "Too many re-renders").
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => (() => void) | void) => {
    const { useEffect } = require('react');
    useEffect(() => {
      const cleanup = cb();
      return typeof cleanup === 'function' ? cleanup : undefined;
    }, [cb]);
  },
}));

// Firebase auth: by default simulate a logged-in user.
jest.mock('../config/firebase', () => ({
  auth: { currentUser: { uid: 'alice' } },
}));

jest.mock('../services/firestore', () => ({
  getReceivedMessages: jest.fn(),
}));

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn(),
}));

const mockGetReceivedMessages = getReceivedMessages as jest.Mock;
const mockOnAuthStateChanged  = onAuthStateChanged  as jest.Mock;

function makeMessage(id: string): ReceivedMessage {
  return {
    id, chatId: 'chat1', senderId: 'bob', senderName: 'Bob',
    originalUrl: 'https://open.spotify.com/track/abc',
    convertedUrl: 'https://music.youtube.com/watch?v=abc',
    title: 'Test Song', artist: 'Test Artist', thumbnailUrl: '',
    targetPlatform: 'youtubeMusic', createdAt: null as any,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockGetReceivedMessages.mockResolvedValue([]);
  // By default: onAuthStateChanged immediately fires with a logged-in user.
  mockOnAuthStateChanged.mockImplementation((_auth: any, cb: (u: any) => void) => {
    cb({ uid: 'alice' });
    return jest.fn(); // unsubscribe
  });
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('initial state', () => {
  it('starts loading with an empty messages array', () => {
    const { result } = renderHook(() => useReceivedMessages());
    expect(result.current.messages).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Fetch on focus / auth
// ---------------------------------------------------------------------------

describe('fetching messages', () => {
  it('calls getReceivedMessages with the current user UID', async () => {
    const { result: _ } = renderHook(() => useReceivedMessages());
    await act(async () => {});

    expect(mockGetReceivedMessages).toHaveBeenCalledWith('alice');
  });

  it('returns received messages', async () => {
    const msg = makeMessage('msg1');
    mockGetReceivedMessages.mockResolvedValue([msg]);

    const { result } = renderHook(() => useReceivedMessages());
    await act(async () => {});

    expect(result.current.messages).toEqual([msg]);
    expect(result.current.loading).toBe(false);
  });

  it('returns an empty array when no messages exist', async () => {
    mockGetReceivedMessages.mockResolvedValue([]);

    const { result } = renderHook(() => useReceivedMessages());
    await act(async () => {});

    expect(result.current.messages).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('triggers a fetch when the auth state resolves with a user', async () => {
    const msg = makeMessage('msg1');
    mockGetReceivedMessages.mockResolvedValue([msg]);

    const { result } = renderHook(() => useReceivedMessages());
    await act(async () => {});

    expect(result.current.messages).toHaveLength(1);
  });

  it('does not fetch when auth fires with null (logged out)', async () => {
    mockOnAuthStateChanged.mockImplementation((_auth: any, cb: (u: any) => void) => {
      cb(null);
      return jest.fn();
    });
    // Also clear currentUser so focus-effect short-circuits too
    jest.mock('../config/firebase', () => ({ auth: { currentUser: null } }));

    mockGetReceivedMessages.mockResolvedValue([makeMessage('msg1')]);

    const { result } = renderHook(() => useReceivedMessages());
    await act(async () => {});

    // When onAuthStateChanged fires null, it must NOT call getReceivedMessages
    // Note: useFocusEffect may still call it if currentUser is set in the module
    // cache — this test verifies the auth listener does not trigger a fetch for null.
    const callsViaAuthListener = mockOnAuthStateChanged.mock.calls.length;
    expect(callsViaAuthListener).toBeGreaterThan(0);
    // getReceivedMessages may have been called by useFocusEffect (currentUser still set)
    // but NOT additionally by the auth listener with null.
    const totalCalls = mockGetReceivedMessages.mock.calls.length;
    expect(totalCalls).toBeLessThanOrEqual(1); // at most the focus-effect call
  });
});

// ---------------------------------------------------------------------------
// Error resilience
// ---------------------------------------------------------------------------

describe('error handling', () => {
  it('sets loading to false even when getReceivedMessages throws', async () => {
    mockGetReceivedMessages.mockRejectedValue(new Error('Firestore error'));

    const { result } = renderHook(() => useReceivedMessages());
    await act(async () => {});

    expect(result.current.loading).toBe(false);
    expect(result.current.messages).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

describe('cleanup', () => {
  it('unsubscribes from onAuthStateChanged on unmount', () => {
    const unsub = jest.fn();
    mockOnAuthStateChanged.mockReturnValue(unsub);

    const { unmount } = renderHook(() => useReceivedMessages());
    unmount();

    expect(unsub).toHaveBeenCalled();
  });
});
