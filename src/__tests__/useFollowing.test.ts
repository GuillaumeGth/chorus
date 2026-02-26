/**
 * Spec: useFollowing
 *
 * Covers fetching the following list and refreshing each contact's platform
 * from their live Firestore profile (so platform changes are always fresh).
 */
import { renderHook, act } from '@testing-library/react-native';
import { useFollowing } from '../hooks/useFollowing';
import { getFollowing, getUserProfile } from '../services/firestore';
import type { FollowEntry, UserProfile } from '../services/firestore';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../config/firebase', () => ({
  auth: { currentUser: { uid: 'alice' } },
}));

jest.mock('../services/firestore', () => ({
  getFollowing: jest.fn(),
  getUserProfile: jest.fn(),
}));

const mockGetFollowing  = getFollowing   as jest.Mock;
const mockGetUserProfile = getUserProfile as jest.Mock;

function makeEntry(uid: string, platform: UserProfile['platform'] = 'spotify'): FollowEntry {
  return { uid, displayName: uid, photoURL: null, platform, followedAt: '__TS__' as any };
}

function makeProfile(uid: string, platform: UserProfile['platform']): UserProfile {
  return { uid, displayName: uid, displayNameLower: uid, email: `${uid}@a.com`, photoURL: null, platform };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockGetFollowing.mockResolvedValue([]);
  mockGetUserProfile.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('initial state', () => {
  it('starts loading with an empty contacts list', () => {
    const { result } = renderHook(() => useFollowing());
    expect(result.current.loading).toBe(true);
    expect(result.current.contacts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Fetch & platform refresh
// ---------------------------------------------------------------------------

describe('refresh', () => {
  it('returns an empty list when not following anyone', async () => {
    mockGetFollowing.mockResolvedValue([]);

    const { result } = renderHook(() => useFollowing());
    await act(async () => {});

    expect(result.current.contacts).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('returns contacts with platform refreshed from live profile', async () => {
    mockGetFollowing.mockResolvedValue([makeEntry('bob', 'spotify')]);
    mockGetUserProfile.mockResolvedValue(makeProfile('bob', 'youtubeMusic'));

    const { result } = renderHook(() => useFollowing());
    await act(async () => {});

    expect(result.current.contacts).toHaveLength(1);
    expect(result.current.contacts[0].platform).toBe('youtubeMusic');
  });

  it('uses null platform when getUserProfile returns null (user deleted)', async () => {
    mockGetFollowing.mockResolvedValue([makeEntry('bob', 'spotify')]);
    mockGetUserProfile.mockResolvedValue(null);

    const { result } = renderHook(() => useFollowing());
    await act(async () => {});

    expect(result.current.contacts[0].platform).toBeNull();
  });

  it('refreshes platform for every contact in parallel', async () => {
    mockGetFollowing.mockResolvedValue([makeEntry('bob'), makeEntry('charlie')]);
    mockGetUserProfile
      .mockResolvedValueOnce(makeProfile('bob', 'tidal'))
      .mockResolvedValueOnce(makeProfile('charlie', 'deezer'));

    const { result } = renderHook(() => useFollowing());
    await act(async () => {});

    expect(result.current.contacts[0].platform).toBe('tidal');
    expect(result.current.contacts[1].platform).toBe('deezer');
    expect(mockGetUserProfile).toHaveBeenCalledTimes(2);
  });

  it('preserves all other follow entry fields (displayName, photoURL…)', async () => {
    const entry: FollowEntry = {
      uid: 'bob', displayName: 'Bob Lennon', photoURL: 'https://photo.jpg',
      platform: 'spotify', followedAt: '__TS__' as any,
    };
    mockGetFollowing.mockResolvedValue([entry]);
    mockGetUserProfile.mockResolvedValue(makeProfile('bob', 'appleMusic'));

    const { result } = renderHook(() => useFollowing());
    await act(async () => {});

    const contact = result.current.contacts[0];
    expect(contact.displayName).toBe('Bob Lennon');
    expect(contact.photoURL).toBe('https://photo.jpg');
    expect(contact.uid).toBe('bob');
    expect(contact.platform).toBe('appleMusic');
  });

  it('sets loading to false after fetch completes', async () => {
    const { result } = renderHook(() => useFollowing());
    await act(async () => {});

    expect(result.current.loading).toBe(false);
  });

  it('handles an empty following list without crashing', async () => {
    mockGetFollowing.mockResolvedValue([]);
    mockGetUserProfile.mockResolvedValue(null);

    const { result } = renderHook(() => useFollowing());
    await act(async () => {});

    expect(result.current.contacts).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Manual refresh
// ---------------------------------------------------------------------------

describe('manual refresh', () => {
  it('re-fetches contacts when refresh() is called', async () => {
    mockGetFollowing.mockResolvedValue([]);

    const { result } = renderHook(() => useFollowing());
    await act(async () => {});
    expect(mockGetFollowing).toHaveBeenCalledTimes(1);

    mockGetFollowing.mockResolvedValue([makeEntry('bob')]);
    mockGetUserProfile.mockResolvedValue(makeProfile('bob', 'spotify'));

    await act(async () => { await result.current.refresh(); });

    expect(mockGetFollowing).toHaveBeenCalledTimes(2);
    expect(result.current.contacts).toHaveLength(1);
  });
});
