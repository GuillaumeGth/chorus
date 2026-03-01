/**
 * Spec: usePlaylistRole
 *
 * Derives the authenticated user's role in a given playlist from the members
 * map. Returns null when the user is unauthenticated, not a member, or the
 * playlist is not yet loaded.
 */
import { renderHook } from '@testing-library/react-native';
import { usePlaylistRole } from '../hooks/usePlaylistRole';
import { useAuth } from '../hooks/useAuth';
import { usePlaylist } from '../hooks/usePlaylist';
import type { Playlist } from '../services/playlists';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../config/firebase', () => ({ db: '__DB__', auth: {} }));

jest.mock('../hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../hooks/usePlaylist', () => ({
  usePlaylist: jest.fn(),
}));

const mockUseAuth    = useAuth    as jest.Mock;
const mockUsePlaylist = usePlaylist as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlaylist(members: Record<string, string>): Partial<Playlist> {
  return {
    id: 'playlist1',
    name: 'Test',
    members: members as Record<string, 'owner' | 'editor' | 'viewer'>,
    memberUids: Object.keys(members),
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockUseAuth.mockReturnValue({ user: { uid: 'alice' }, loaded: true });
  mockUsePlaylist.mockReturnValue({ playlist: null, tracks: [], loading: false });
});

// ---------------------------------------------------------------------------
// usePlaylistRole
// ---------------------------------------------------------------------------

describe('usePlaylistRole', () => {
  it('returns null when the playlist is not yet loaded', () => {
    mockUsePlaylist.mockReturnValue({ playlist: null, tracks: [], loading: true });
    const { result } = renderHook(() => usePlaylistRole('playlist1'));
    expect(result.current).toBeNull();
  });

  it('returns null when the user is not authenticated', () => {
    mockUseAuth.mockReturnValue({ user: null, loaded: true });
    mockUsePlaylist.mockReturnValue({
      playlist: makePlaylist({ alice: 'owner' }),
      tracks: [], loading: false,
    });
    const { result } = renderHook(() => usePlaylistRole('playlist1'));
    expect(result.current).toBeNull();
  });

  it('returns null when the user is not a member of the playlist', () => {
    mockUsePlaylist.mockReturnValue({
      playlist: makePlaylist({ bob: 'owner' }),
      tracks: [], loading: false,
    });
    const { result } = renderHook(() => usePlaylistRole('playlist1'));
    expect(result.current).toBeNull();
  });

  it("returns 'owner' for the playlist owner", () => {
    mockUsePlaylist.mockReturnValue({
      playlist: makePlaylist({ alice: 'owner' }),
      tracks: [], loading: false,
    });
    const { result } = renderHook(() => usePlaylistRole('playlist1'));
    expect(result.current).toBe('owner');
  });

  it("returns 'editor' for an editor member", () => {
    mockUsePlaylist.mockReturnValue({
      playlist: makePlaylist({ alice: 'editor' }),
      tracks: [], loading: false,
    });
    const { result } = renderHook(() => usePlaylistRole('playlist1'));
    expect(result.current).toBe('editor');
  });

  it("returns 'viewer' for a viewer member", () => {
    mockUsePlaylist.mockReturnValue({
      playlist: makePlaylist({ alice: 'viewer' }),
      tracks: [], loading: false,
    });
    const { result } = renderHook(() => usePlaylistRole('playlist1'));
    expect(result.current).toBe('viewer');
  });

  it('passes the playlistId to usePlaylist', () => {
    renderHook(() => usePlaylistRole('playlist42'));
    expect(mockUsePlaylist).toHaveBeenCalledWith('playlist42');
  });
});
