/**
 * Spec: invitation service functions
 *
 * Covers: sendInvitation, respondToInvitation, subscribeToMyInvitations
 */
import {
  cancelInvitation,
  respondToInvitation,
  sendInvitation,
  subscribeToMyInvitations,
} from '../services/playlists';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../config/firebase', () => ({ db: '__DB__' }));

jest.mock('firebase/firestore', () => ({
  collection:      jest.fn(() => '__COL__'),
  doc:             jest.fn(() => ({ id: 'newInvId' })),
  getDoc:          jest.fn(),
  getDocs:         jest.fn(),
  setDoc:          jest.fn().mockResolvedValue(undefined),
  updateDoc:       jest.fn().mockResolvedValue(undefined),
  deleteDoc:       jest.fn().mockResolvedValue(undefined),
  onSnapshot:      jest.fn(() => jest.fn()),
  query:           jest.fn(() => '__QUERY__'),
  where:           jest.fn(() => '__WHERE__'),
  orderBy:         jest.fn(() => '__ORDERBY__'),
  serverTimestamp: jest.fn(() => '__SERVER_TS__'),
  increment:       jest.fn((n: number) => ({ __increment: n })),
  deleteField:     jest.fn(() => '__DELETE_FIELD__'),
}));

const mockGetDoc    = getDoc    as jest.Mock;
const mockGetDocs   = getDocs   as jest.Mock;
const mockSetDoc    = setDoc    as jest.Mock;
const mockUpdateDoc = updateDoc as jest.Mock;
const mockDeleteDoc = deleteDoc as jest.Mock;
const mockOnSnapshot = onSnapshot as jest.Mock;
const mockDoc       = doc       as jest.Mock;
const mockQuery     = query     as jest.Mock;
const mockWhere     = where     as jest.Mock;
const mockCollection = collection as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLAYLIST_ID   = 'pl1';
const PLAYLIST_NAME = 'Road Trip Bangers';
const INVITED_BY    = 'alice';
const INVITED_BY_NAME = 'Alice';
const INVITED_BY_PHOTO = 'https://example.com/alice.jpg';
const INVITED_UID   = 'bob';
const ROLE          = 'editor' as const;

const BASE_INVITATION = {
  id:             'inv1',
  playlistId:     PLAYLIST_ID,
  playlistName:   PLAYLIST_NAME,
  invitedBy:      INVITED_BY,
  invitedByName:  INVITED_BY_NAME,
  invitedByPhoto: INVITED_BY_PHOTO,
  invitedUid:     INVITED_UID,
  role:           ROLE,
  status:         'pending',
  createdAt:      '__SERVER_TS__',
};

const PLAYLIST_DATA = {
  memberUids:  ['alice'],
  memberInfo:  { alice: { displayName: 'Alice', photoURL: null } },
  members:     { alice: 'owner' },
  inviteRole:  'viewer',
};

function makeDocs(data: unknown[]) {
  return { empty: data.length === 0, docs: data.map((d) => ({ id: 'id', data: () => d })) };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockDoc.mockReturnValue({ id: 'newInvId' });
  mockCollection.mockReturnValue('__COL__');
  mockSetDoc.mockResolvedValue(undefined);
  mockUpdateDoc.mockResolvedValue(undefined);
  mockDeleteDoc.mockResolvedValue(undefined);
  mockQuery.mockReturnValue('__QUERY__');
  mockWhere.mockReturnValue('__WHERE__');
});

// ---------------------------------------------------------------------------
// sendInvitation
// ---------------------------------------------------------------------------

describe('sendInvitation', () => {
  it('creates an invitation document when target is not already a member', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => PLAYLIST_DATA });

    await sendInvitation(
      PLAYLIST_ID, PLAYLIST_NAME, INVITED_BY, INVITED_BY_NAME,
      INVITED_BY_PHOTO, INVITED_UID, ROLE,
    );

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [, docData] = mockSetDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(docData.playlistId).toBe(PLAYLIST_ID);
    expect(docData.invitedUid).toBe(INVITED_UID);
    expect(docData.invitedBy).toBe(INVITED_BY);
    expect(docData.role).toBe(ROLE);
    expect(docData.status).toBe('pending');
  });

  it('is a no-op if the user is already a member', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ ...PLAYLIST_DATA, memberUids: ['alice', INVITED_UID] }),
    });

    await sendInvitation(
      PLAYLIST_ID, PLAYLIST_NAME, INVITED_BY, INVITED_BY_NAME,
      INVITED_BY_PHOTO, INVITED_UID, ROLE,
    );

    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('always creates a new document (no duplicate pre-check — UI handles it)', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => PLAYLIST_DATA });

    await sendInvitation(
      PLAYLIST_ID, PLAYLIST_NAME, INVITED_BY, INVITED_BY_NAME,
      INVITED_BY_PHOTO, INVITED_UID, ROLE,
    );

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// respondToInvitation
// ---------------------------------------------------------------------------

describe('respondToInvitation — accept', () => {
  it('updates the invitation status to accepted', async () => {
    await respondToInvitation('inv1', true);

    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    const [, invUpdate] = mockUpdateDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(invUpdate.status).toBe('accepted');
  });

  it('does not touch the playlist — that is handled by onInvitationAccepted Function', async () => {
    await respondToInvitation('inv1', true);

    const calls = mockUpdateDoc.mock.calls as [unknown, Record<string, unknown>][];
    const hasPlaylistUpdate = calls.some(([, data]) => 'memberUids' in data);
    expect(hasPlaylistUpdate).toBe(false);
    expect(mockGetDoc).not.toHaveBeenCalled();
  });
});

describe('respondToInvitation — decline', () => {
  it('updates the invitation status to declined', async () => {
    await respondToInvitation('inv1', false);

    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    const [, invUpdate] = mockUpdateDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(invUpdate.status).toBe('declined');
  });

  it('does not touch the playlist when declined', async () => {
    await respondToInvitation('inv1', false);

    const calls = mockUpdateDoc.mock.calls as [unknown, Record<string, unknown>][];
    expect(calls.some(([, d]) => 'memberUids' in d)).toBe(false);
    expect(mockGetDoc).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// subscribeToMyInvitations
// ---------------------------------------------------------------------------

describe('subscribeToMyInvitations', () => {
  it('subscribes with invitedUid and status=pending filters', () => {
    const callback = jest.fn();
    subscribeToMyInvitations('bob', callback);

    expect(mockWhere).toHaveBeenCalledWith('invitedUid', '==', 'bob');
    expect(mockWhere).toHaveBeenCalledWith('status', '==', 'pending');
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
  });

  it('returns the unsubscribe function', () => {
    const unsub = jest.fn();
    mockOnSnapshot.mockReturnValue(unsub);
    const result = subscribeToMyInvitations('bob', jest.fn());
    expect(result).toBe(unsub);
  });

  it('delivers only pending invitations via callback', () => {
    const callback = jest.fn();
    mockOnSnapshot.mockImplementation((_q, cb: (snap: unknown) => void) => {
      cb({
        docs: [
          { id: 'inv1', data: () => ({ ...BASE_INVITATION, status: 'pending' }) },
        ],
      });
      return jest.fn();
    });

    subscribeToMyInvitations('bob', callback);

    expect(callback).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'inv1', status: 'pending' }),
    ]);
  });
});

// ---------------------------------------------------------------------------
// cancelInvitation
// ---------------------------------------------------------------------------

describe('cancelInvitation', () => {
  it('calls deleteDoc with the invitation ref', async () => {
    await cancelInvitation('inv1');
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
  });
});
