/**
 * Spec: playlists service
 *
 * All Firebase SDK calls are mocked. Tests verify that the correct Firestore
 * paths are used, role-based authorization is enforced, and return values
 * are processed correctly.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  createPlaylist,
  deletePlaylist,
  generateNewInviteCode,
  inviteMember,
  joinPlaylistByCode,
  removeMember,
  removeTrackFromPlaylist,
  setInviteLinkActive,
  subscribeToMyPlaylists,
  subscribeToPlaylist,
  subscribeToPlaylistTracks,
  updateMemberRole,
  updatePlaylistInfo,
  type Playlist,
  type PlaylistTrack,
} from '../services/playlists';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../config/firebase', () => ({ db: '__DB__', auth: {} }));

jest.mock('firebase/firestore', () => ({
  collection:      jest.fn(),
  deleteDoc:       jest.fn(),
  doc:             jest.fn(),
  getDoc:          jest.fn(),
  getDocs:         jest.fn(),
  increment:       jest.fn(),
  onSnapshot:      jest.fn(),
  orderBy:         jest.fn(),
  query:           jest.fn(),
  serverTimestamp: jest.fn(),
  setDoc:          jest.fn(),
  Timestamp:       class {},
  updateDoc:       jest.fn(),
  where:           jest.fn(),
}));

const mockDoc        = doc          as jest.Mock;
const mockCollection = collection   as jest.Mock;
const mockSetDoc     = setDoc       as jest.Mock;
const mockGetDoc     = getDoc       as jest.Mock;
const mockGetDocs    = getDocs      as jest.Mock;
const mockUpdateDoc  = updateDoc    as jest.Mock;
const mockDeleteDoc  = deleteDoc    as jest.Mock;
const mockOnSnapshot = onSnapshot   as jest.Mock;
const mockIncrement  = increment    as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function docSnap(exists: boolean, data: Record<string, unknown> = {}) {
  return { exists: () => exists, data: () => data };
}

function querySnap(docs: Array<{ id: string; ref?: unknown; data: Record<string, unknown> }>) {
  return {
    empty: docs.length === 0,
    docs: docs.map((d) => ({ id: d.id, ref: d.ref ?? `__REF_${d.id}__`, data: () => d.data })),
  };
}

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.resetAllMocks();
  mockDoc.mockReturnValue('__DOC__');
  mockCollection.mockReturnValue('__COLL__');
  (query          as jest.Mock).mockReturnValue('__QUERY__');
  (serverTimestamp as jest.Mock).mockReturnValue('__TS__');
  (where          as jest.Mock).mockReturnValue('__WHERE__');
  (orderBy        as jest.Mock).mockReturnValue('__ORDER__');
  mockIncrement.mockReturnValue('__INC__');
  mockSetDoc.mockResolvedValue(undefined);
  mockGetDoc.mockResolvedValue(docSnap(false));
  mockGetDocs.mockResolvedValue(querySnap([]));
  mockUpdateDoc.mockResolvedValue(undefined);
  mockDeleteDoc.mockResolvedValue(undefined);
  mockOnSnapshot.mockReturnValue(() => {});
});

// ---------------------------------------------------------------------------
// createPlaylist
// ---------------------------------------------------------------------------

describe('createPlaylist', () => {
  const mockRef = { id: 'playlist123' };

  beforeEach(() => {
    mockDoc.mockReturnValue(mockRef);
  });

  it('returns the new playlist document ID', async () => {
    const id = await createPlaylist('alice', 'Alice', null, 'My Playlist');
    expect(id).toBe('playlist123');
  });

  it('writes to the playlists collection', async () => {
    await createPlaylist('alice', 'Alice', null, 'My Playlist');
    expect(mockCollection).toHaveBeenCalledWith('__DB__', 'playlists');
  });

  it('sets the creator as owner in members and memberUids', async () => {
    await createPlaylist('alice', 'Alice', null, 'My Playlist');
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.members).toEqual({ alice: 'owner' });
    expect(data.memberUids).toEqual(['alice']);
    expect(data.createdBy).toBe('alice');
  });

  it('writes name, timestamps, and trackCount', async () => {
    await createPlaylist('alice', 'Alice', null, 'Road trip');
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.name).toBe('Road trip');
    expect(data.createdAt).toBe('__TS__');
    expect(data.updatedAt).toBe('__TS__');
    expect(data.trackCount).toBe(0);
  });

  it('generates a 6-character alphanumeric invite code', async () => {
    await createPlaylist('alice', 'Alice', null, 'My Playlist');
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.inviteCode).toMatch(/^[a-z0-9]{6}$/);
  });

  it('sets inviteLinkActive to true and defaults inviteRole to viewer', async () => {
    await createPlaylist('alice', 'Alice', null, 'My Playlist');
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.inviteLinkActive).toBe(true);
    expect(data.inviteRole).toBe('viewer');
  });

  it('uses the provided inviteRole', async () => {
    await createPlaylist('alice', 'Alice', null, 'My Playlist', undefined, 'editor');
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.inviteRole).toBe('editor');
  });

  it('omits description when not provided', async () => {
    await createPlaylist('alice', 'Alice', null, 'My Playlist');
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data).not.toHaveProperty('description');
  });

  it('includes description when provided', async () => {
    await createPlaylist('alice', 'Alice', null, 'My Playlist', 'Great tracks');
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.description).toBe('Great tracks');
  });

  it('stores memberInfo with displayName and photoURL', async () => {
    await createPlaylist('alice', 'Alice', 'alice.jpg', 'My Playlist');
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.memberInfo).toEqual({ alice: { displayName: 'Alice', photoURL: 'alice.jpg' } });
  });

  it('generates unique codes across multiple calls', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      mockDoc.mockReturnValue({ id: `pl${i}` });
      await createPlaylist('alice', 'Alice', null, 'Playlist');
      const [, data] = mockSetDoc.mock.calls[i];
      codes.add(data.inviteCode as string);
    }
    // 36^6 ≈ 2.1B combinations — 20 calls should yield high diversity
    expect(codes.size).toBeGreaterThan(15);
  });
});

// ---------------------------------------------------------------------------
// deletePlaylist
// ---------------------------------------------------------------------------

describe('deletePlaylist', () => {
  it('calls deleteDoc on the correct playlist path', async () => {
    await deletePlaylist('playlist1');
    expect(mockDoc).toHaveBeenCalledWith('__DB__', 'playlists', 'playlist1');
    expect(mockDeleteDoc).toHaveBeenCalledWith('__DOC__');
  });
});

// ---------------------------------------------------------------------------
// updatePlaylistInfo
// ---------------------------------------------------------------------------

describe('updatePlaylistInfo', () => {
  it('updates name and description with a fresh timestamp', async () => {
    await updatePlaylistInfo('playlist1', { name: 'New Name', description: 'New desc' });
    expect(mockDoc).toHaveBeenCalledWith('__DB__', 'playlists', 'playlist1');
    expect(mockUpdateDoc).toHaveBeenCalledWith('__DOC__', {
      name: 'New Name',
      description: 'New desc',
      updatedAt: '__TS__',
    });
  });

  it('can update only the name without touching description', async () => {
    await updatePlaylistInfo('playlist1', { name: 'Only Name' });
    const [, data] = mockUpdateDoc.mock.calls[0];
    expect(data.name).toBe('Only Name');
    expect(data).not.toHaveProperty('description');
  });
});

// ---------------------------------------------------------------------------
// subscribeToMyPlaylists
// ---------------------------------------------------------------------------

describe('subscribeToMyPlaylists', () => {
  it('passes mapped playlists to the callback', () => {
    const playlistData = {
      name: 'My Playlist', createdBy: 'alice',
      memberUids: ['alice'], members: { alice: 'owner' },
      memberInfo: { alice: { displayName: 'Alice', photoURL: null } },
      trackCount: 0, inviteCode: 'abc123', inviteLinkActive: true, inviteRole: 'viewer',
      createdAt: '__TS__', updatedAt: '__TS__',
    };
    mockOnSnapshot.mockImplementation((_q: unknown, cb: (snap: unknown) => void) => {
      cb({ docs: [{ id: 'playlist1', data: () => playlistData }] });
      return () => {};
    });

    const callback = jest.fn();
    subscribeToMyPlaylists('alice', callback);
    expect(callback).toHaveBeenCalledWith([{ id: 'playlist1', ...playlistData }]);
  });

  it('queries memberUids array-contains and orders by updatedAt desc', () => {
    subscribeToMyPlaylists('alice', jest.fn());
    expect(mockCollection).toHaveBeenCalledWith('__DB__', 'playlists');
    expect(where).toHaveBeenCalledWith('memberUids', 'array-contains', 'alice');
    expect(orderBy).toHaveBeenCalledWith('updatedAt', 'desc');
  });

  it('returns the unsubscribe function', () => {
    const unsub = jest.fn();
    mockOnSnapshot.mockReturnValue(unsub);
    expect(subscribeToMyPlaylists('alice', jest.fn())).toBe(unsub);
  });
});

// ---------------------------------------------------------------------------
// subscribeToPlaylist
// ---------------------------------------------------------------------------

describe('subscribeToPlaylist', () => {
  it('passes playlist data to the callback when document exists', () => {
    const data = { name: 'Test', createdBy: 'alice', memberUids: ['alice'] };
    mockOnSnapshot.mockImplementation((_ref: unknown, cb: (snap: unknown) => void) => {
      cb({ exists: () => true, id: 'playlist1', data: () => data });
      return () => {};
    });

    const callback = jest.fn();
    subscribeToPlaylist('playlist1', callback);
    expect(callback).toHaveBeenCalledWith({ id: 'playlist1', ...data });
  });

  it('passes null to the callback when the document does not exist', () => {
    mockOnSnapshot.mockImplementation((_ref: unknown, cb: (snap: unknown) => void) => {
      cb({ exists: () => false, id: 'playlist1', data: () => ({}) });
      return () => {};
    });

    const callback = jest.fn();
    subscribeToPlaylist('playlist1', callback);
    expect(callback).toHaveBeenCalledWith(null);
  });

  it('subscribes to the correct document path', () => {
    subscribeToPlaylist('playlist1', jest.fn());
    expect(mockDoc).toHaveBeenCalledWith('__DB__', 'playlists', 'playlist1');
  });

  it('returns the unsubscribe function', () => {
    const unsub = jest.fn();
    mockOnSnapshot.mockReturnValue(unsub);
    expect(subscribeToPlaylist('playlist1', jest.fn())).toBe(unsub);
  });
});

// ---------------------------------------------------------------------------
// subscribeToPlaylistTracks
// ---------------------------------------------------------------------------

describe('subscribeToPlaylistTracks', () => {
  it('passes mapped tracks to the callback', () => {
    const trackData = {
      addedBy: 'alice', addedByName: 'Alice', addedByPhoto: null,
      title: 'Track', artist: 'Artist', thumbnailUrl: '',
      originalUrl: 'https://open.spotify.com/track/abc',
      platformLinks: { spotify: 'https://open.spotify.com/track/abc' },
      position: 0, addedAt: '__TS__',
    };
    mockOnSnapshot.mockImplementation((_q: unknown, cb: (snap: unknown) => void) => {
      cb({ docs: [{ id: 'track1', data: () => trackData }] });
      return () => {};
    });

    const callback = jest.fn();
    subscribeToPlaylistTracks('playlist1', callback);
    expect(callback).toHaveBeenCalledWith([{ id: 'track1', ...trackData }]);
  });

  it('queries the tracks subcollection ordered by position asc', () => {
    subscribeToPlaylistTracks('playlist1', jest.fn());
    expect(mockCollection).toHaveBeenCalledWith('__DB__', 'playlists', 'playlist1', 'tracks');
    expect(orderBy).toHaveBeenCalledWith('position', 'asc');
  });

  it('returns the unsubscribe function', () => {
    const unsub = jest.fn();
    mockOnSnapshot.mockReturnValue(unsub);
    expect(subscribeToPlaylistTracks('playlist1', jest.fn())).toBe(unsub);
  });
});

// ---------------------------------------------------------------------------
// updateMemberRole
// ---------------------------------------------------------------------------

describe('updateMemberRole', () => {
  it('updates the member role via dot-notation field path', async () => {
    await updateMemberRole('playlist1', 'bob', 'editor');
    expect(mockDoc).toHaveBeenCalledWith('__DB__', 'playlists', 'playlist1');
    expect(mockUpdateDoc).toHaveBeenCalledWith('__DOC__', {
      'members.bob': 'editor',
      updatedAt: '__TS__',
    });
  });

  it('supports all role values', async () => {
    for (const role of ['owner', 'editor', 'viewer'] as const) {
      jest.resetAllMocks();
      mockDoc.mockReturnValue('__DOC__');
      (serverTimestamp as jest.Mock).mockReturnValue('__TS__');
      mockUpdateDoc.mockResolvedValue(undefined);

      await updateMemberRole('playlist1', 'bob', role);
      const [, data] = mockUpdateDoc.mock.calls[0];
      expect(data['members.bob']).toBe(role);
    }
  });
});

// ---------------------------------------------------------------------------
// removeMember
// ---------------------------------------------------------------------------

describe('removeMember', () => {
  const basePlaylist: Partial<Playlist> = {
    memberUids: ['alice', 'bob'],
    members: { alice: 'owner', bob: 'editor' } as Record<string, 'owner' | 'editor' | 'viewer'>,
    memberInfo: {
      alice: { displayName: 'Alice', photoURL: null },
      bob: { displayName: 'Bob', photoURL: null },
    },
  };

  it('removes member from members, memberInfo, and memberUids', async () => {
    mockGetDoc.mockResolvedValue(docSnap(true, basePlaylist as Record<string, unknown>));
    await removeMember('playlist1', 'bob');

    expect(mockUpdateDoc).toHaveBeenCalledWith('__DOC__', {
      members: { alice: 'owner' },
      memberInfo: { alice: { displayName: 'Alice', photoURL: null } },
      memberUids: ['alice'],
      updatedAt: '__TS__',
    });
  });

  it('does nothing when the playlist does not exist', async () => {
    mockGetDoc.mockResolvedValue(docSnap(false));
    await removeMember('playlist1', 'bob');
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('reads the correct playlist document', async () => {
    mockGetDoc.mockResolvedValue(docSnap(false));
    await removeMember('playlist1', 'bob');
    expect(mockDoc).toHaveBeenCalledWith('__DB__', 'playlists', 'playlist1');
  });
});

// ---------------------------------------------------------------------------
// inviteMember
// ---------------------------------------------------------------------------

describe('inviteMember', () => {
  const basePlaylist: Partial<Playlist> = {
    memberUids: ['alice'],
    members: { alice: 'owner' } as Record<string, 'owner' | 'editor' | 'viewer'>,
    memberInfo: { alice: { displayName: 'Alice', photoURL: null } },
  };

  it('adds the new member with the given role', async () => {
    mockGetDoc.mockResolvedValue(docSnap(true, basePlaylist as Record<string, unknown>));
    await inviteMember('playlist1', 'bob', 'editor', 'Bob', 'bob.jpg');

    expect(mockUpdateDoc).toHaveBeenCalledWith('__DOC__', {
      'members.bob': 'editor',
      'memberInfo.bob': { displayName: 'Bob', photoURL: 'bob.jpg' },
      memberUids: ['alice', 'bob'],
      updatedAt: '__TS__',
    });
  });

  it('does nothing when the user is already a member', async () => {
    mockGetDoc.mockResolvedValue(docSnap(true, {
      ...basePlaylist,
      memberUids: ['alice', 'bob'],
    } as Record<string, unknown>));
    await inviteMember('playlist1', 'bob', 'editor', 'Bob', null);
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('does nothing when the playlist does not exist', async () => {
    mockGetDoc.mockResolvedValue(docSnap(false));
    await inviteMember('playlist1', 'bob', 'viewer', 'Bob', null);
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// joinPlaylistByCode
// ---------------------------------------------------------------------------

describe('joinPlaylistByCode', () => {
  const basePlaylist: Partial<Playlist> = {
    inviteRole: 'viewer',
    memberUids: ['alice'],
    members: { alice: 'owner' } as Record<string, 'owner' | 'editor' | 'viewer'>,
    memberInfo: { alice: { displayName: 'Alice', photoURL: null } },
  };

  it('throws when the invite code is not found', async () => {
    mockGetDocs.mockResolvedValue(querySnap([]));
    await expect(joinPlaylistByCode('invalid', 'bob', 'Bob', null))
      .rejects.toThrow('Code invalide ou lien désactivé');
  });

  it('returns the playlistId without writing when user is already a member', async () => {
    mockGetDocs.mockResolvedValue(
      querySnap([{ id: 'playlist1', data: { ...basePlaylist, memberUids: ['alice', 'bob'] } as Record<string, unknown> }])
    );
    const id = await joinPlaylistByCode('abc123', 'bob', 'Bob', null);
    expect(id).toBe('playlist1');
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('adds the user with the playlist inviteRole', async () => {
    const ref = '__PLAYLIST_REF__';
    mockGetDocs.mockResolvedValue(
      querySnap([{ id: 'playlist1', ref, data: basePlaylist as Record<string, unknown> }])
    );
    await joinPlaylistByCode('abc123', 'bob', 'Bob', 'bob.jpg');

    expect(mockUpdateDoc).toHaveBeenCalledWith(ref, {
      'members.bob': 'viewer',
      'memberInfo.bob': { displayName: 'Bob', photoURL: 'bob.jpg' },
      memberUids: ['alice', 'bob'],
      updatedAt: '__TS__',
    });
  });

  it('queries by inviteCode and inviteLinkActive === true', async () => {
    mockGetDocs.mockResolvedValue(querySnap([]));
    try { await joinPlaylistByCode('abc123', 'bob', 'Bob', null); } catch {}
    expect(where).toHaveBeenCalledWith('inviteCode', '==', 'abc123');
    expect(where).toHaveBeenCalledWith('inviteLinkActive', '==', true);
  });
});

// ---------------------------------------------------------------------------
// generateNewInviteCode
// ---------------------------------------------------------------------------

describe('generateNewInviteCode', () => {
  it('generates a 6-char alphanumeric code and persists it', async () => {
    const code = await generateNewInviteCode('playlist1');
    expect(code).toMatch(/^[a-z0-9]{6}$/);
    expect(mockUpdateDoc).toHaveBeenCalledWith('__DOC__', {
      inviteCode: code,
      updatedAt: '__TS__',
    });
  });

  it('updates the correct playlist document', async () => {
    await generateNewInviteCode('playlist1');
    expect(mockDoc).toHaveBeenCalledWith('__DB__', 'playlists', 'playlist1');
  });
});

// ---------------------------------------------------------------------------
// setInviteLinkActive
// ---------------------------------------------------------------------------

describe('setInviteLinkActive', () => {
  it('deactivates the invite link', async () => {
    await setInviteLinkActive('playlist1', false);
    expect(mockUpdateDoc).toHaveBeenCalledWith('__DOC__', {
      inviteLinkActive: false,
      updatedAt: '__TS__',
    });
  });

  it('reactivates the invite link', async () => {
    await setInviteLinkActive('playlist1', true);
    const [, data] = mockUpdateDoc.mock.calls[0];
    expect(data.inviteLinkActive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// removeTrackFromPlaylist
// ---------------------------------------------------------------------------

describe('removeTrackFromPlaylist', () => {
  const track: Partial<PlaylistTrack> = {
    addedBy: 'bob',
    title: 'Test Track',
    position: 0,
  };

  it('owner can delete any track', async () => {
    mockGetDoc.mockResolvedValue(docSnap(true, track as Record<string, unknown>));
    await removeTrackFromPlaylist('playlist1', 'track1', 'alice', 'owner');

    expect(mockDeleteDoc).toHaveBeenCalled();
    expect(mockUpdateDoc).toHaveBeenCalledWith(expect.anything(), {
      trackCount: '__INC__',
      updatedAt: '__TS__',
    });
    expect(mockIncrement).toHaveBeenCalledWith(-1);
  });

  it('editor can delete their own track', async () => {
    // track.addedBy === 'bob', requester is 'bob'
    mockGetDoc.mockResolvedValue(docSnap(true, track as Record<string, unknown>));
    await removeTrackFromPlaylist('playlist1', 'track1', 'bob', 'editor');
    expect(mockDeleteDoc).toHaveBeenCalled();
  });

  it("editor cannot delete another user's track", async () => {
    // track.addedBy === 'bob', requester is 'charlie'
    mockGetDoc.mockResolvedValue(docSnap(true, track as Record<string, unknown>));
    await removeTrackFromPlaylist('playlist1', 'track1', 'charlie', 'editor');
    expect(mockDeleteDoc).not.toHaveBeenCalled();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('viewer cannot delete any track', async () => {
    mockGetDoc.mockResolvedValue(docSnap(true, track as Record<string, unknown>));
    await removeTrackFromPlaylist('playlist1', 'track1', 'alice', 'viewer');
    expect(mockDeleteDoc).not.toHaveBeenCalled();
  });

  it('does nothing when the track does not exist', async () => {
    mockGetDoc.mockResolvedValue(docSnap(false));
    await removeTrackFromPlaylist('playlist1', 'track1', 'alice', 'owner');
    expect(mockDeleteDoc).not.toHaveBeenCalled();
  });

  it('queries the correct track document path', async () => {
    mockGetDoc.mockResolvedValue(docSnap(false));
    await removeTrackFromPlaylist('playlist1', 'track1', 'alice', 'owner');
    expect(mockDoc).toHaveBeenCalledWith('__DB__', 'playlists', 'playlist1', 'tracks', 'track1');
  });

  it('decrements trackCount on the playlist document', async () => {
    mockGetDoc.mockResolvedValue(docSnap(true, track as Record<string, unknown>));
    await removeTrackFromPlaylist('playlist1', 'track1', 'alice', 'owner');
    expect(mockDoc).toHaveBeenCalledWith('__DB__', 'playlists', 'playlist1');
  });
});
