/**
 * Spec: firestore service
 *
 * All Firebase SDK calls are mocked. Tests verify that the correct Firestore
 * paths are used, the right data is written, and return values are processed
 * correctly.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  limit,
} from 'firebase/firestore';
import {
  getChatId,
  createOrUpdateUser,
  updateUserPlatform,
  savePushToken,
  getUserProfile,
  searchUsers,
  getOrCreateChat,
  sendMusicMessage,
  subscribeToChats,
  followUser,
  unfollowUser,
  isFollowing,
  getFollowing,
  getReceivedMessages,
  subscribeToMessages,
  type UserProfile,
  type ChatMessage,
  type FollowEntry,
} from '../services/firestore';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../config/firebase', () => ({ db: '__DB__', auth: {} }));

jest.mock('firebase/firestore', () => ({
  addDoc:          jest.fn(),
  collection:      jest.fn(),
  deleteDoc:       jest.fn(),
  doc:             jest.fn(),
  getDoc:          jest.fn(),
  getDocs:         jest.fn(),
  limit:           jest.fn(),
  onSnapshot:      jest.fn(),
  orderBy:         jest.fn(),
  query:           jest.fn(),
  serverTimestamp: jest.fn(),
  setDoc:          jest.fn(),
  updateDoc:       jest.fn(),
  where:           jest.fn(),
}));

const mockDoc        = doc          as jest.Mock;
const mockCollection = collection   as jest.Mock;
const mockSetDoc     = setDoc       as jest.Mock;
const mockGetDoc     = getDoc       as jest.Mock;
const mockGetDocs    = getDocs      as jest.Mock;
const mockAddDoc     = addDoc       as jest.Mock;
const mockUpdateDoc  = updateDoc    as jest.Mock;
const mockDeleteDoc  = deleteDoc    as jest.Mock;
const mockOnSnapshot = onSnapshot   as jest.Mock;

// ---------------------------------------------------------------------------
// Snapshot helpers
// ---------------------------------------------------------------------------

function docSnap(exists: boolean, data: Record<string, any> = {}) {
  return { exists: () => exists, data: () => data };
}

function querySnap(docs: Array<{ id: string; data: Record<string, any> }>) {
  return { docs: docs.map((d) => ({ id: d.id, data: () => d.data })) };
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
  (limit          as jest.Mock).mockReturnValue('__LIMIT__');
  mockSetDoc.mockResolvedValue(undefined);
  mockGetDoc.mockResolvedValue(docSnap(false));
  mockGetDocs.mockResolvedValue(querySnap([]));
  mockAddDoc.mockResolvedValue({ id: '__NEW_ID__' });
  mockUpdateDoc.mockResolvedValue(undefined);
  mockDeleteDoc.mockResolvedValue(undefined);
  mockOnSnapshot.mockReturnValue(() => {});
});

// ---------------------------------------------------------------------------
// getChatId
// ---------------------------------------------------------------------------

describe('getChatId', () => {
  it('sorts and joins the two UIDs with an underscore', () => {
    expect(getChatId('alice', 'bob')).toBe('alice_bob');
    expect(getChatId('bob', 'alice')).toBe('alice_bob');
  });

  it('is commutative', () => {
    expect(getChatId('uid2', 'uid1')).toBe(getChatId('uid1', 'uid2'));
  });
});

// ---------------------------------------------------------------------------
// createOrUpdateUser
// ---------------------------------------------------------------------------

describe('createOrUpdateUser', () => {
  const base = {
    uid: 'u1',
    displayName: 'Alice',
    displayNameLower: 'alice',
    email: 'alice@example.com',
    photoURL: null as null,
  };

  it('calls setDoc on the correct users path with merge:true', async () => {
    await createOrUpdateUser(base);

    expect(mockDoc).toHaveBeenCalledWith('__DB__', 'users', 'u1');
    expect(mockSetDoc).toHaveBeenCalledWith(
      '__DOC__',
      { uid: 'u1', displayName: 'Alice', displayNameLower: 'alice', email: 'alice@example.com', photoURL: null },
      { merge: true }
    );
  });

  it('includes platform in data when provided', async () => {
    await createOrUpdateUser({ ...base, platform: 'spotify' });
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.platform).toBe('spotify');
  });

  it('omits platform field when platform is undefined (not passed)', async () => {
    await createOrUpdateUser(base); // no platform key
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data).not.toHaveProperty('platform');
  });

  it('includes platform: null when explicitly set to null', async () => {
    await createOrUpdateUser({ ...base, platform: null });
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.platform).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateUserPlatform
// ---------------------------------------------------------------------------

describe('updateUserPlatform', () => {
  it('calls setDoc with { platform } and merge:true', async () => {
    await updateUserPlatform('u1', 'youtubeMusic');

    expect(mockDoc).toHaveBeenCalledWith('__DB__', 'users', 'u1');
    expect(mockSetDoc).toHaveBeenCalledWith('__DOC__', { platform: 'youtubeMusic' }, { merge: true });
  });
});

// ---------------------------------------------------------------------------
// savePushToken
// ---------------------------------------------------------------------------

describe('savePushToken', () => {
  it('calls setDoc with { expoPushToken } and merge:true', async () => {
    await savePushToken('u1', 'ExponentPushToken[xxx]');

    expect(mockDoc).toHaveBeenCalledWith('__DB__', 'users', 'u1');
    expect(mockSetDoc).toHaveBeenCalledWith(
      '__DOC__',
      { expoPushToken: 'ExponentPushToken[xxx]' },
      { merge: true }
    );
  });
});

// ---------------------------------------------------------------------------
// getUserProfile
// ---------------------------------------------------------------------------

describe('getUserProfile', () => {
  it('returns null when the document does not exist', async () => {
    mockGetDoc.mockResolvedValue(docSnap(false));

    expect(await getUserProfile('u1')).toBeNull();
  });

  it('returns the user data when the document exists', async () => {
    const user: UserProfile = {
      uid: 'u1', displayName: 'Alice', displayNameLower: 'alice',
      email: 'alice@example.com', photoURL: null, platform: 'spotify',
    };
    mockGetDoc.mockResolvedValue(docSnap(true, user));

    expect(await getUserProfile('u1')).toEqual(user);
  });

  it('queries the correct path', async () => {
    mockGetDoc.mockResolvedValue(docSnap(false));
    await getUserProfile('u1');

    expect(mockDoc).toHaveBeenCalledWith('__DB__', 'users', 'u1');
    expect(mockGetDoc).toHaveBeenCalledWith('__DOC__');
  });
});

// ---------------------------------------------------------------------------
// searchUsers
// ---------------------------------------------------------------------------

describe('searchUsers', () => {
  it('returns an empty array for an empty query', async () => {
    expect(await searchUsers('', 'me')).toEqual([]);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('returns an empty array for a whitespace-only query', async () => {
    expect(await searchUsers('   ', 'me')).toEqual([]);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('returns matching users', async () => {
    const alice: UserProfile = {
      uid: 'alice', displayName: 'Alice', displayNameLower: 'alice',
      email: 'alice@example.com', photoURL: null, platform: 'spotify',
    };
    mockGetDocs
      .mockResolvedValueOnce(querySnap([{ id: 'alice', data: alice }]))
      .mockResolvedValueOnce(querySnap([]));

    expect(await searchUsers('alice', 'me')).toEqual([alice]);
  });

  it('excludes the current user from results', async () => {
    const me: UserProfile = {
      uid: 'me', displayName: 'Me', displayNameLower: 'me',
      email: 'me@example.com', photoURL: null, platform: null,
    };
    mockGetDocs
      .mockResolvedValueOnce(querySnap([{ id: 'me', data: me }]))
      .mockResolvedValueOnce(querySnap([]));

    expect(await searchUsers('me', 'me')).toEqual([]);
  });

  it('deduplicates users appearing in both name and email results', async () => {
    const alice: UserProfile = {
      uid: 'alice', displayName: 'Alice', displayNameLower: 'alice',
      email: 'alice@example.com', photoURL: null, platform: null,
    };
    mockGetDocs
      .mockResolvedValueOnce(querySnap([{ id: 'alice', data: alice }]))
      .mockResolvedValueOnce(querySnap([{ id: 'alice', data: alice }]));

    const results = await searchUsers('alice', 'me');
    expect(results).toHaveLength(1);
    expect(results[0].uid).toBe('alice');
  });

  it('combines results from name and email searches', async () => {
    const alice: UserProfile = {
      uid: 'alice', displayName: 'Alice', displayNameLower: 'alice',
      email: 'alice@example.com', photoURL: null, platform: null,
    };
    const bob: UserProfile = {
      uid: 'bob', displayName: 'Bob', displayNameLower: 'bob',
      email: 'bob@a.com', photoURL: null, platform: null,
    };
    mockGetDocs
      .mockResolvedValueOnce(querySnap([{ id: 'alice', data: alice }]))
      .mockResolvedValueOnce(querySnap([{ id: 'bob', data: bob }]));

    const results = await searchUsers('a', 'me');
    expect(results).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// getOrCreateChat
// ---------------------------------------------------------------------------

describe('getOrCreateChat', () => {
  it('returns the deterministic chatId (sorted UIDs)', async () => {
    mockGetDoc.mockResolvedValue(docSnap(true));

    const id = await getOrCreateChat('bob', 'Bob', null, 'alice', 'Alice', null);
    expect(id).toBe('alice_bob');
  });

  it('does NOT call setDoc when the chat already exists', async () => {
    mockGetDoc.mockResolvedValue(docSnap(true));

    await getOrCreateChat('alice', 'Alice', null, 'bob', 'Bob', null);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('creates the chat document when it does not exist', async () => {
    mockGetDoc.mockResolvedValue(docSnap(false));

    await getOrCreateChat('alice', 'Alice', 'alice.jpg', 'bob', 'Bob', 'bob.jpg');

    expect(mockSetDoc).toHaveBeenCalledWith('__DOC__', {
      participants: ['alice', 'bob'],
      participantInfo: {
        alice: { displayName: 'Alice', photoURL: 'alice.jpg' },
        bob:   { displayName: 'Bob',   photoURL: 'bob.jpg'   },
      },
      lastMessage: null,
      updatedAt: '__TS__',
    });
  });

  it('uses the correct chats path', async () => {
    mockGetDoc.mockResolvedValue(docSnap(false));

    await getOrCreateChat('alice', 'Alice', null, 'bob', 'Bob', null);

    expect(mockDoc).toHaveBeenCalledWith('__DB__', 'chats', 'alice_bob');
  });
});

// ---------------------------------------------------------------------------
// sendMusicMessage
// ---------------------------------------------------------------------------

describe('sendMusicMessage', () => {
  const message: Omit<ChatMessage, 'id' | 'createdAt'> = {
    senderId: 'alice',
    senderName: 'Alice',
    originalUrl: 'https://open.spotify.com/track/abc',
    convertedUrl: 'https://music.youtube.com/watch?v=abc',
    title: 'Test Song',
    artist: 'Test Artist',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    targetPlatform: 'youtubeMusic',
  };

  it('adds the message to the messages subcollection', async () => {
    await sendMusicMessage('chat1', message);

    expect(mockCollection).toHaveBeenCalledWith('__DB__', 'chats', 'chat1', 'messages');
    expect(mockAddDoc).toHaveBeenCalledWith('__COLL__', { ...message, createdAt: '__TS__' });
  });

  it('updates the chat document with lastMessage and updatedAt', async () => {
    await sendMusicMessage('chat1', message);

    expect(mockDoc).toHaveBeenCalledWith('__DB__', 'chats', 'chat1');
    expect(mockUpdateDoc).toHaveBeenCalledWith('__DOC__', {
      lastMessage: {
        title: 'Test Song',
        artist: 'Test Artist',
        senderId: 'alice',
        createdAt: '__TS__',
      },
      updatedAt: '__TS__',
    });
  });
});

// ---------------------------------------------------------------------------
// subscribeToChats
// ---------------------------------------------------------------------------

describe('subscribeToChats', () => {
  it('passes mapped chats to the callback', () => {
    const chatData = {
      participants: ['alice', 'bob'],
      participantInfo: { alice: { displayName: 'Alice', photoURL: null }, bob: { displayName: 'Bob', photoURL: null } },
      lastMessage: null,
      updatedAt: '__TS__',
    };
    mockOnSnapshot.mockImplementation((_q: any, cb: any) => {
      cb({ docs: [{ id: 'chat1', data: () => chatData }] });
      return () => {};
    });

    const callback = jest.fn();
    subscribeToChats('alice', callback);

    expect(callback).toHaveBeenCalledWith([{ id: 'chat1', ...chatData }]);
  });

  it('returns the unsubscribe function from onSnapshot', () => {
    const unsub = jest.fn();
    mockOnSnapshot.mockReturnValue(unsub);

    expect(subscribeToChats('alice', jest.fn())).toBe(unsub);
  });
});

// ---------------------------------------------------------------------------
// followUser
// ---------------------------------------------------------------------------

describe('followUser', () => {
  it('calls setDoc on the following subcollection with correct data', async () => {
    const user: UserProfile = {
      uid: 'bob', displayName: 'Bob', displayNameLower: 'bob',
      email: 'bob@example.com', photoURL: 'bob.jpg', platform: 'spotify',
    };
    await followUser('alice', user);

    expect(mockDoc).toHaveBeenCalledWith('__DB__', 'users', 'alice', 'following', 'bob');
    expect(mockSetDoc).toHaveBeenCalledWith('__DOC__', {
      uid: 'bob',
      displayName: 'Bob',
      photoURL: 'bob.jpg',
      platform: 'spotify',
      followedAt: '__TS__',
    });
  });
});

// ---------------------------------------------------------------------------
// unfollowUser
// ---------------------------------------------------------------------------

describe('unfollowUser', () => {
  it('calls deleteDoc on the correct following path', async () => {
    await unfollowUser('alice', 'bob');

    expect(mockDoc).toHaveBeenCalledWith('__DB__', 'users', 'alice', 'following', 'bob');
    expect(mockDeleteDoc).toHaveBeenCalledWith('__DOC__');
  });
});

// ---------------------------------------------------------------------------
// isFollowing
// ---------------------------------------------------------------------------

describe('isFollowing', () => {
  it('returns true when the follow document exists', async () => {
    mockGetDoc.mockResolvedValue(docSnap(true));
    expect(await isFollowing('alice', 'bob')).toBe(true);
  });

  it('returns false when the follow document does not exist', async () => {
    mockGetDoc.mockResolvedValue(docSnap(false));
    expect(await isFollowing('alice', 'bob')).toBe(false);
  });

  it('queries the correct following subcollection path', async () => {
    mockGetDoc.mockResolvedValue(docSnap(false));
    await isFollowing('alice', 'bob');

    expect(mockDoc).toHaveBeenCalledWith('__DB__', 'users', 'alice', 'following', 'bob');
    expect(mockGetDoc).toHaveBeenCalledWith('__DOC__');
  });
});

// ---------------------------------------------------------------------------
// getFollowing
// ---------------------------------------------------------------------------

describe('getFollowing', () => {
  it('returns an empty array when there are no follows', async () => {
    mockGetDocs.mockResolvedValue(querySnap([]));
    expect(await getFollowing('alice')).toEqual([]);
  });

  it('returns the follow entries', async () => {
    const entry: FollowEntry = {
      uid: 'bob', displayName: 'Bob', photoURL: null, platform: 'spotify', followedAt: '__TS__',
    };
    mockGetDocs.mockResolvedValue(querySnap([{ id: 'bob', data: entry }]));

    expect(await getFollowing('alice')).toEqual([entry]);
  });

  it('queries the following subcollection', async () => {
    mockGetDocs.mockResolvedValue(querySnap([]));
    await getFollowing('alice');

    expect(mockCollection).toHaveBeenCalledWith('__DB__', 'users', 'alice', 'following');
  });
});

// ---------------------------------------------------------------------------
// getReceivedMessages
// ---------------------------------------------------------------------------

describe('getReceivedMessages', () => {
  it('returns an empty array when there are no chats', async () => {
    mockGetDocs.mockResolvedValue(querySnap([]));
    expect(await getReceivedMessages('alice')).toEqual([]);
  });

  it('filters out messages sent by self', async () => {
    const ownMsg = {
      senderId: 'alice', senderName: 'Alice',
      originalUrl: '', convertedUrl: '', title: 'Own', artist: '', thumbnailUrl: '',
      targetPlatform: 'spotify', createdAt: { toMillis: () => 1000 },
    };
    mockGetDocs
      .mockResolvedValueOnce(querySnap([{ id: 'chat1', data: {} }]))
      .mockResolvedValueOnce({ docs: [{ id: 'msg1', data: () => ownMsg }] });

    expect(await getReceivedMessages('alice')).toEqual([]);
  });

  it('includes messages received from others', async () => {
    const receivedMsg = {
      senderId: 'bob', senderName: 'Bob',
      originalUrl: 'https://open.spotify.com/track/abc',
      convertedUrl: 'https://music.youtube.com/watch?v=abc',
      title: 'Test Song', artist: 'Test Artist', thumbnailUrl: '',
      targetPlatform: 'youtubeMusic', createdAt: { toMillis: () => 1000 },
    };
    mockGetDocs
      .mockResolvedValueOnce(querySnap([{ id: 'chat1', data: {} }]))
      .mockResolvedValueOnce({ docs: [{ id: 'msg1', data: () => receivedMsg }] });

    const results = await getReceivedMessages('alice');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: 'msg1', chatId: 'chat1', senderId: 'bob' });
  });

  it('sorts messages by createdAt descending (newest first)', async () => {
    const older = { senderId: 'bob', senderName: 'Bob', originalUrl: '', convertedUrl: '', title: 'Old', artist: '', thumbnailUrl: '', targetPlatform: 'spotify', createdAt: { toMillis: () => 1000 } };
    const newer = { senderId: 'bob', senderName: 'Bob', originalUrl: '', convertedUrl: '', title: 'New', artist: '', thumbnailUrl: '', targetPlatform: 'spotify', createdAt: { toMillis: () => 2000 } };

    mockGetDocs
      .mockResolvedValueOnce(querySnap([{ id: 'chat1', data: {} }]))
      .mockResolvedValueOnce({ docs: [{ id: 'msg1', data: () => older }, { id: 'msg2', data: () => newer }] });

    const results = await getReceivedMessages('alice');
    expect(results[0].id).toBe('msg2'); // newer first
    expect(results[1].id).toBe('msg1');
  });

  it('aggregates messages across multiple chats', async () => {
    const msg = { senderId: 'bob', senderName: 'Bob', originalUrl: '', convertedUrl: '', title: 'T', artist: '', thumbnailUrl: '', targetPlatform: 'spotify', createdAt: { toMillis: () => 1000 } };

    mockGetDocs
      .mockResolvedValueOnce(querySnap([{ id: 'chat1', data: {} }, { id: 'chat2', data: {} }]))
      .mockResolvedValueOnce({ docs: [{ id: 'msg1', data: () => msg }] })
      .mockResolvedValueOnce({ docs: [{ id: 'msg2', data: () => msg }] });

    const results = await getReceivedMessages('alice');
    expect(results).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// subscribeToMessages
// ---------------------------------------------------------------------------

describe('subscribeToMessages', () => {
  it('passes mapped messages to the callback', () => {
    const msgData = {
      senderId: 'bob', senderName: 'Bob',
      originalUrl: 'https://open.spotify.com/track/abc',
      convertedUrl: 'https://music.youtube.com/watch?v=abc',
      title: 'Test Song', artist: 'Test Artist', thumbnailUrl: '',
      targetPlatform: 'youtubeMusic', createdAt: '__TS__',
    };
    mockOnSnapshot.mockImplementation((_q: any, _opts: any, cb: any) => {
      cb({ docs: [{ id: 'msg1', data: () => msgData }] });
      return () => {};
    });

    const callback = jest.fn();
    subscribeToMessages('chat1', callback);

    expect(callback).toHaveBeenCalledWith([{ id: 'msg1', ...msgData }]);
  });

  it('calls onError when onSnapshot fires an error', () => {
    const error = new Error('Permission denied');
    mockOnSnapshot.mockImplementation((_q: any, _opts: any, _cb: any, errCb: any) => {
      errCb(error);
      return () => {};
    });

    const callback = jest.fn();
    const onError = jest.fn();
    subscribeToMessages('chat1', callback, onError);

    expect(onError).toHaveBeenCalledWith(error);
    expect(callback).not.toHaveBeenCalled();
  });

  it('works when onError is not provided', () => {
    const error = new Error('Permission denied');
    mockOnSnapshot.mockImplementation((_q: any, _opts: any, _cb: any, errCb: any) => {
      errCb(error);
      return () => {};
    });

    expect(() => subscribeToMessages('chat1', jest.fn())).not.toThrow();
  });

  it('returns the unsubscribe function from onSnapshot', () => {
    const unsub = jest.fn();
    mockOnSnapshot.mockReturnValue(unsub);

    expect(subscribeToMessages('chat1', jest.fn())).toBe(unsub);
  });
});
