/**
 * Spec: usePlaylists
 *
 * Subscribes in real time to all playlists where the authenticated user is
 * listed as a member. Covers loading state, real-time updates, auth changes,
 * and cleanup on unmount.
 */
import { renderHook, act } from '@testing-library/react-native';
import { usePlaylists } from '../hooks/usePlaylists';
import { subscribeToMyPlaylists } from '../services/playlists';
import { useAuth } from '../hooks/useAuth';
import type { Playlist } from '../services/playlists';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../config/firebase', () => ({ db: '__DB__', auth: {} }));

jest.mock('../hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../services/playlists', () => ({
  subscribeToMyPlaylists: jest.fn(),
}));

const mockUseAuth   = useAuth                as jest.Mock;
const mockSubscribe = subscribeToMyPlaylists as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlaylist(id: string): Playlist {
  return {
    id,
    name: `Playlist ${id}`,
    createdBy: 'alice',
    createdAt: '__TS__' as unknown as any,
    updatedAt: '__TS__' as unknown as any,
    members: { alice: 'owner' },
    memberInfo: { alice: { displayName: 'Alice', photoURL: null } },
    memberUids: ['alice'],
    trackCount: 0,
    inviteCode: 'abc123',
    inviteLinkActive: true,
    inviteRole: 'viewer',
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockUseAuth.mockReturnValue({ user: { uid: 'alice' }, loaded: true });
  mockSubscribe.mockReturnValue(() => {});
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('initial state', () => {
  it('starts with loading true and an empty playlists array', () => {
    const { result } = renderHook(() => usePlaylists());
    expect(result.current.loading).toBe(true);
    expect(result.current.playlists).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

describe('subscription', () => {
  it('subscribes with the current user UID', () => {
    renderHook(() => usePlaylists());
    expect(mockSubscribe).toHaveBeenCalledWith('alice', expect.any(Function));
  });

  it('sets playlists and stops loading when the subscription fires', async () => {
    const playlists = [makePlaylist('p1'), makePlaylist('p2')];
    mockSubscribe.mockImplementation((_uid: string, cb: (data: Playlist[]) => void) => {
      cb(playlists);
      return () => {};
    });

    const { result } = renderHook(() => usePlaylists());
    await act(async () => {});

    expect(result.current.playlists).toEqual(playlists);
    expect(result.current.loading).toBe(false);
  });

  it('returns empty array and loading false when user is null', async () => {
    mockUseAuth.mockReturnValue({ user: null, loaded: true });

    const { result } = renderHook(() => usePlaylists());
    await act(async () => {});

    expect(result.current.playlists).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it('re-subscribes when the user UID changes', async () => {
    const { rerender } = renderHook(() => usePlaylists());

    mockUseAuth.mockReturnValue({ user: { uid: 'bob' }, loaded: true });
    rerender({});
    await act(async () => {});

    expect(mockSubscribe).toHaveBeenCalledTimes(2);
    expect(mockSubscribe).toHaveBeenLastCalledWith('bob', expect.any(Function));
  });

  it('reflects real-time updates when the subscription fires multiple times', async () => {
    let fireUpdate: (data: Playlist[]) => void = () => {};
    mockSubscribe.mockImplementation((_uid: string, cb: (data: Playlist[]) => void) => {
      fireUpdate = cb;
      return () => {};
    });

    const { result } = renderHook(() => usePlaylists());

    await act(async () => { fireUpdate([makePlaylist('p1')]); });
    expect(result.current.playlists).toHaveLength(1);

    await act(async () => { fireUpdate([makePlaylist('p1'), makePlaylist('p2')]); });
    expect(result.current.playlists).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

describe('cleanup', () => {
  it('calls the unsubscribe function on unmount', () => {
    const unsub = jest.fn();
    mockSubscribe.mockReturnValue(unsub);

    const { unmount } = renderHook(() => usePlaylists());
    unmount();

    expect(unsub).toHaveBeenCalled();
  });
});
