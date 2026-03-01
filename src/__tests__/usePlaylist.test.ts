/**
 * Spec: usePlaylist
 *
 * Subscribes in real time to a single playlist document and its tracks
 * subcollection. Covers loading state, null document, data updates, and
 * cleanup of both listeners on unmount.
 */
import { renderHook, act } from '@testing-library/react-native';
import { usePlaylist } from '../hooks/usePlaylist';
import { subscribeToPlaylist, subscribeToPlaylistTracks } from '../services/playlists';
import type { Playlist, PlaylistTrack } from '../services/playlists';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../config/firebase', () => ({ db: '__DB__', auth: {} }));

jest.mock('../services/playlists', () => ({
  subscribeToPlaylist:       jest.fn(),
  subscribeToPlaylistTracks: jest.fn(),
}));

const mockSubscribePlaylist = subscribeToPlaylist       as jest.Mock;
const mockSubscribeTracks   = subscribeToPlaylistTracks as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlaylist(): Playlist {
  return {
    id: 'playlist1',
    name: 'My Playlist',
    createdBy: 'alice',
    createdAt: '__TS__' as unknown as any,
    updatedAt: '__TS__' as unknown as any,
    members: { alice: 'owner' },
    memberInfo: { alice: { displayName: 'Alice', photoURL: null } },
    memberUids: ['alice'],
    trackCount: 1,
    inviteCode: 'abc123',
    inviteLinkActive: true,
    inviteRole: 'viewer',
  };
}

function makeTrack(id: string): PlaylistTrack {
  return {
    id,
    addedBy: 'alice',
    addedByName: 'Alice',
    addedByPhoto: null,
    addedAt: '__TS__' as unknown as any,
    title: `Track ${id}`,
    artist: 'Artist',
    thumbnailUrl: '',
    originalUrl: 'https://open.spotify.com/track/abc',
    platformLinks: {},
    position: 0,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockSubscribePlaylist.mockReturnValue(() => {});
  mockSubscribeTracks.mockReturnValue(() => {});
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('initial state', () => {
  it('starts with loading true, null playlist, and empty tracks', () => {
    const { result } = renderHook(() => usePlaylist('playlist1'));
    expect(result.current.loading).toBe(true);
    expect(result.current.playlist).toBeNull();
    expect(result.current.tracks).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

describe('subscriptions', () => {
  it('subscribes to the playlist document with the given ID', () => {
    renderHook(() => usePlaylist('playlist1'));
    expect(mockSubscribePlaylist).toHaveBeenCalledWith('playlist1', expect.any(Function));
  });

  it('subscribes to the tracks subcollection with the same ID', () => {
    renderHook(() => usePlaylist('playlist1'));
    expect(mockSubscribeTracks).toHaveBeenCalledWith('playlist1', expect.any(Function));
  });

  it('sets playlist data and stops loading when the playlist subscription fires', async () => {
    const playlist = makePlaylist();
    mockSubscribePlaylist.mockImplementation((_id: string, cb: (p: Playlist | null) => void) => {
      cb(playlist);
      return () => {};
    });

    const { result } = renderHook(() => usePlaylist('playlist1'));
    await act(async () => {});

    expect(result.current.playlist).toEqual(playlist);
    expect(result.current.loading).toBe(false);
  });

  it('sets null and stops loading when the document does not exist', async () => {
    mockSubscribePlaylist.mockImplementation((_id: string, cb: (p: Playlist | null) => void) => {
      cb(null);
      return () => {};
    });

    const { result } = renderHook(() => usePlaylist('playlist1'));
    await act(async () => {});

    expect(result.current.playlist).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('sets tracks when the tracks subscription fires', async () => {
    const tracks = [makeTrack('t1'), makeTrack('t2')];
    mockSubscribeTracks.mockImplementation((_id: string, cb: (t: PlaylistTrack[]) => void) => {
      cb(tracks);
      return () => {};
    });

    const { result } = renderHook(() => usePlaylist('playlist1'));
    await act(async () => {});

    expect(result.current.tracks).toEqual(tracks);
  });

  it('reflects real-time track updates', async () => {
    let fireTracks: (t: PlaylistTrack[]) => void = () => {};
    mockSubscribeTracks.mockImplementation((_id: string, cb: (t: PlaylistTrack[]) => void) => {
      fireTracks = cb;
      return () => {};
    });

    const { result } = renderHook(() => usePlaylist('playlist1'));

    await act(async () => { fireTracks([makeTrack('t1')]); });
    expect(result.current.tracks).toHaveLength(1);

    await act(async () => { fireTracks([makeTrack('t1'), makeTrack('t2')]); });
    expect(result.current.tracks).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

describe('cleanup', () => {
  it('unsubscribes from both listeners on unmount', () => {
    const unsubPlaylist = jest.fn();
    const unsubTracks   = jest.fn();
    mockSubscribePlaylist.mockReturnValue(unsubPlaylist);
    mockSubscribeTracks.mockReturnValue(unsubTracks);

    const { unmount } = renderHook(() => usePlaylist('playlist1'));
    unmount();

    expect(unsubPlaylist).toHaveBeenCalled();
    expect(unsubTracks).toHaveBeenCalled();
  });
});
