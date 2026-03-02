/**
 * Spec: addTrackToPlaylist
 *
 * Resolves a raw music URL via Odesli, writes the track document to the
 * playlist's tracks subcollection, then updates the parent playlist document
 * (trackCount, lastTrack, updatedAt).
 */
import { addTrackToPlaylist } from '../services/playlists';
import { fetchLinks } from '../services/odesli';
import {
  collection,
  doc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../config/firebase', () => ({ db: '__DB__' }));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => '__COL__'),
  doc:         jest.fn(() => ({ id: 'newTrackId' })),
  setDoc:      jest.fn().mockResolvedValue(undefined),
  updateDoc:   jest.fn().mockResolvedValue(undefined),
  increment:   jest.fn((n: number) => ({ __increment: n })),
  serverTimestamp: jest.fn(() => '__SERVER_TS__'),
}));

jest.mock('../services/odesli', () => ({
  fetchLinks: jest.fn(),
}));

const mockFetchLinks  = fetchLinks  as jest.Mock;
const mockSetDoc      = setDoc      as jest.Mock;
const mockUpdateDoc   = updateDoc   as jest.Mock;
const mockCollection  = collection  as jest.Mock;
const mockDoc         = doc         as jest.Mock;
const mockIncrement   = increment   as jest.Mock;
const mockServerTs    = serverTimestamp as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ODESLI_RESULT = {
  title: 'Harder, Better, Faster, Stronger',
  artist: 'Daft Punk',
  thumbnailUrl: 'https://img.example.com/thumb.jpg',
  platformLinks: {
    spotify:      'https://open.spotify.com/track/abc',
    youtubeMusic: 'https://music.youtube.com/watch?v=abc',
    deezer:       'https://www.deezer.com/track/123',
  },
};

const PLAYLIST_ID  = 'playlist1';
const UID          = 'alice';
const DISPLAY_NAME = 'Alice';
const PHOTO_URL    = 'https://example.com/alice.jpg';
const SOURCE_URL   = 'https://www.deezer.com/track/123';

beforeEach(() => {
  jest.resetAllMocks();
  mockFetchLinks.mockResolvedValue(ODESLI_RESULT);
  mockDoc.mockReturnValue({ id: 'newTrackId' });
  mockCollection.mockReturnValue('__COL__');
  mockSetDoc.mockResolvedValue(undefined);
  mockUpdateDoc.mockResolvedValue(undefined);
  mockIncrement.mockImplementation((n: number) => ({ __increment: n }));
  mockServerTs.mockReturnValue('__SERVER_TS__');
});

// ---------------------------------------------------------------------------
// addTrackToPlaylist
// ---------------------------------------------------------------------------

describe('addTrackToPlaylist', () => {
  it('calls fetchLinks with the provided URL', async () => {
    await addTrackToPlaylist(PLAYLIST_ID, UID, DISPLAY_NAME, PHOTO_URL, SOURCE_URL);
    expect(mockFetchLinks).toHaveBeenCalledWith(SOURCE_URL);
  });

  it('creates a track document in the tracks subcollection', async () => {
    await addTrackToPlaylist(PLAYLIST_ID, UID, DISPLAY_NAME, PHOTO_URL, SOURCE_URL);
    expect(mockCollection).toHaveBeenCalledWith('__DB__', 'playlists', PLAYLIST_ID, 'tracks');
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
  });

  it('writes correct track metadata', async () => {
    await addTrackToPlaylist(PLAYLIST_ID, UID, DISPLAY_NAME, PHOTO_URL, SOURCE_URL);
    const [, trackData] = mockSetDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(trackData.title).toBe(ODESLI_RESULT.title);
    expect(trackData.artist).toBe(ODESLI_RESULT.artist);
    expect(trackData.thumbnailUrl).toBe(ODESLI_RESULT.thumbnailUrl);
    expect(trackData.originalUrl).toBe(SOURCE_URL);
    expect(trackData.platformLinks).toEqual(ODESLI_RESULT.platformLinks);
    expect(trackData.addedBy).toBe(UID);
    expect(trackData.addedByName).toBe(DISPLAY_NAME);
    expect(trackData.addedByPhoto).toBe(PHOTO_URL);
    expect(trackData.addedAt).toBe('__SERVER_TS__');
  });

  it('sets position to a number in the current-epoch range', async () => {
    const before = Date.now();
    await addTrackToPlaylist(PLAYLIST_ID, UID, DISPLAY_NAME, PHOTO_URL, SOURCE_URL);
    const after = Date.now();
    const [, trackData] = mockSetDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(typeof trackData.position).toBe('number');
    expect(trackData.position as number).toBeGreaterThanOrEqual(before);
    expect(trackData.position as number).toBeLessThanOrEqual(after);
  });

  it('updates the parent playlist document', async () => {
    await addTrackToPlaylist(PLAYLIST_ID, UID, DISPLAY_NAME, PHOTO_URL, SOURCE_URL);
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    const [, updateData] = mockUpdateDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(updateData.trackCount).toEqual({ __increment: 1 });
    expect(updateData.updatedAt).toBe('__SERVER_TS__');
  });

  it('sets lastTrack on the parent playlist', async () => {
    await addTrackToPlaylist(PLAYLIST_ID, UID, DISPLAY_NAME, PHOTO_URL, SOURCE_URL);
    const [, updateData] = mockUpdateDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    const lastTrack = updateData.lastTrack as Record<string, unknown>;
    expect(lastTrack.title).toBe(ODESLI_RESULT.title);
    expect(lastTrack.artist).toBe(ODESLI_RESULT.artist);
    expect(lastTrack.thumbnailUrl).toBe(ODESLI_RESULT.thumbnailUrl);
    expect(lastTrack.addedByName).toBe(DISPLAY_NAME);
    expect(lastTrack.addedAt).toBe('__SERVER_TS__');
  });

  it('accepts a null photoURL', async () => {
    await addTrackToPlaylist(PLAYLIST_ID, UID, DISPLAY_NAME, null, SOURCE_URL);
    const [, trackData] = mockSetDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(trackData.addedByPhoto).toBeNull();
  });

  it('rejects when fetchLinks throws', async () => {
    mockFetchLinks.mockRejectedValue(new Error('Odesli API error: 400'));
    await expect(
      addTrackToPlaylist(PLAYLIST_ID, UID, DISPLAY_NAME, PHOTO_URL, SOURCE_URL),
    ).rejects.toThrow('Odesli API error: 400');
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('uses increment(1) for trackCount — atomic update', async () => {
    await addTrackToPlaylist(PLAYLIST_ID, UID, DISPLAY_NAME, PHOTO_URL, SOURCE_URL);
    expect(mockIncrement).toHaveBeenCalledWith(1);
  });
});
