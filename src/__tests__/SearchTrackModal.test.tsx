/**
 * Spec: SearchTrackModal
 *
 * Bottom-sheet modal with two tabs:
 *   - "Rechercher" — debounced Deezer search, results tappable to add.
 *   - "Coller un lien" — reads clipboard, shows URL, confirms add.
 *
 * The `addTrack` prop is a function provided by the parent; the modal never
 * directly calls Odesli or Firestore.
 */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SearchTrackModal } from '../components/SearchTrackModal';
import { searchMusic } from '../services/musicSearch';
import * as Clipboard from 'expo-clipboard';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../config/firebase', () => ({ db: '__DB__', auth: {} }));


jest.mock('../services/musicSearch', () => ({
  searchMusic: jest.fn(),
}));

jest.mock('expo-clipboard', () => ({
  getStringAsync: jest.fn(),
}));

const mockSearchMusic    = searchMusic                    as jest.Mock;
const mockGetClipboard   = Clipboard.getStringAsync       as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(id: number) {
  return {
    url:          `https://www.deezer.com/track/${id}`,
    title:        `Track ${id}`,
    artist:       `Artist ${id}`,
    thumbnailUrl: `https://img.example.com/${id}.jpg`,
  };
}

const DEFAULT_PROPS = {
  visible:  true,
  addTrack: jest.fn().mockResolvedValue(undefined),
  onClose:  jest.fn(),
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetAllMocks();
  DEFAULT_PROPS.addTrack = jest.fn().mockResolvedValue(undefined);
  DEFAULT_PROPS.onClose  = jest.fn();
  mockSearchMusic.mockResolvedValue([]);
  mockGetClipboard.mockResolvedValue('');
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('rendering', () => {
  it('renders the search tab by default', () => {
    const { getByPlaceholderText } = render(<SearchTrackModal {...DEFAULT_PROPS} />);
    expect(getByPlaceholderText('Artiste, titre…')).toBeTruthy();
  });

  it('does not render when visible is false', () => {
    const { queryByPlaceholderText } = render(
      <SearchTrackModal {...DEFAULT_PROPS} visible={false} />,
    );
    expect(queryByPlaceholderText('Artiste, titre…')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tab navigation
// ---------------------------------------------------------------------------

describe('tab navigation', () => {
  it('switches to the paste tab when tapped', () => {
    const { getByText, queryByPlaceholderText } = render(<SearchTrackModal {...DEFAULT_PROPS} />);
    fireEvent.press(getByText('Coller un lien'));
    expect(queryByPlaceholderText('Artiste, titre…')).toBeNull();
    expect(getByText('Coller depuis le presse-papier')).toBeTruthy();
  });

  it('switches back to the search tab from paste tab', () => {
    const { getByText, getByPlaceholderText } = render(<SearchTrackModal {...DEFAULT_PROPS} />);
    fireEvent.press(getByText('Coller un lien'));
    fireEvent.press(getByText('Rechercher'));
    expect(getByPlaceholderText('Artiste, titre…')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Search tab — debounce
// ---------------------------------------------------------------------------

describe('search tab — debounce', () => {
  it('does not call searchMusic before 400ms', async () => {
    const { getByPlaceholderText } = render(<SearchTrackModal {...DEFAULT_PROPS} />);
    fireEvent.changeText(getByPlaceholderText('Artiste, titre…'), 'daft punk');
    await act(async () => { jest.advanceTimersByTime(399); });
    expect(mockSearchMusic).not.toHaveBeenCalled();
  });

  it('calls searchMusic with the query after 400ms', async () => {
    const { getByPlaceholderText } = render(<SearchTrackModal {...DEFAULT_PROPS} />);
    fireEvent.changeText(getByPlaceholderText('Artiste, titre…'), 'daft punk');
    await act(async () => { jest.advanceTimersByTime(400); });
    expect(mockSearchMusic).toHaveBeenCalledWith('daft punk');
  });

  it('does not call searchMusic for a blank query', async () => {
    const { getByPlaceholderText } = render(<SearchTrackModal {...DEFAULT_PROPS} />);
    fireEvent.changeText(getByPlaceholderText('Artiste, titre…'), '   ');
    await act(async () => { jest.advanceTimersByTime(400); });
    expect(mockSearchMusic).not.toHaveBeenCalled();
  });

  it('cancels the previous timeout when the query changes quickly', async () => {
    const { getByPlaceholderText } = render(<SearchTrackModal {...DEFAULT_PROPS} />);
    fireEvent.changeText(getByPlaceholderText('Artiste, titre…'), 'daf');
    await act(async () => { jest.advanceTimersByTime(200); });
    fireEvent.changeText(getByPlaceholderText('Artiste, titre…'), 'daft punk');
    await act(async () => { jest.advanceTimersByTime(400); });
    // Only one call, with the final query
    expect(mockSearchMusic).toHaveBeenCalledTimes(1);
    expect(mockSearchMusic).toHaveBeenCalledWith('daft punk');
  });
});

// ---------------------------------------------------------------------------
// Search tab — results
// ---------------------------------------------------------------------------

describe('search tab — results', () => {
  it('renders search results after the debounce resolves', async () => {
    mockSearchMusic.mockResolvedValue([makeResult(1), makeResult(2)]);
    const { getByPlaceholderText, getByText } = render(<SearchTrackModal {...DEFAULT_PROPS} />);
    fireEvent.changeText(getByPlaceholderText('Artiste, titre…'), 'daft punk');
    await act(async () => { jest.advanceTimersByTime(400); });
    await waitFor(() => expect(getByText('Track 1')).toBeTruthy());
    expect(getByText('Track 2')).toBeTruthy();
  });

  it('calls addTrack with the result URL when "+" is pressed', async () => {
    mockSearchMusic.mockResolvedValue([makeResult(1)]);
    const addTrack = jest.fn().mockResolvedValue(undefined);
    const { getByPlaceholderText, getByTestId } = render(
      <SearchTrackModal {...DEFAULT_PROPS} addTrack={addTrack} />,
    );
    fireEvent.changeText(getByPlaceholderText('Artiste, titre…'), 'daft');
    await act(async () => { jest.advanceTimersByTime(400); });
    await waitFor(() => getByTestId('add-result-btn'));
    await act(async () => { fireEvent.press(getByTestId('add-result-btn')); });
    expect(addTrack).toHaveBeenCalledWith('https://www.deezer.com/track/1');
  });

  it('calls onClose after a successful add', async () => {
    mockSearchMusic.mockResolvedValue([makeResult(1)]);
    const onClose = jest.fn();
    const { getByPlaceholderText, getByTestId } = render(
      <SearchTrackModal {...DEFAULT_PROPS} onClose={onClose} />,
    );
    fireEvent.changeText(getByPlaceholderText('Artiste, titre…'), 'daft');
    await act(async () => { jest.advanceTimersByTime(400); });
    await waitFor(() => getByTestId('add-result-btn'));
    await act(async () => { fireEvent.press(getByTestId('add-result-btn')); });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows "Aucun résultat" when search returns an empty array', async () => {
    mockSearchMusic.mockResolvedValue([]);
    const { getByPlaceholderText, getByText } = render(<SearchTrackModal {...DEFAULT_PROPS} />);
    fireEvent.changeText(getByPlaceholderText('Artiste, titre…'), 'xyzzy');
    await act(async () => { jest.advanceTimersByTime(400); });
    await waitFor(() => expect(getByText('Aucun résultat')).toBeTruthy());
  });
});

// ---------------------------------------------------------------------------
// Paste tab
// ---------------------------------------------------------------------------

describe('paste tab', () => {
  it('reads the clipboard when the paste button is pressed', async () => {
    mockGetClipboard.mockResolvedValue('https://www.deezer.com/track/42');
    const { getByText } = render(<SearchTrackModal {...DEFAULT_PROPS} />);
    fireEvent.press(getByText('Coller un lien'));
    await act(async () => { fireEvent.press(getByText('Coller depuis le presse-papier')); });
    expect(mockGetClipboard).toHaveBeenCalled();
  });

  it('displays the pasted URL after reading clipboard', async () => {
    mockGetClipboard.mockResolvedValue('https://www.deezer.com/track/42');
    const { getByText } = render(<SearchTrackModal {...DEFAULT_PROPS} />);
    fireEvent.press(getByText('Coller un lien'));
    await act(async () => { fireEvent.press(getByText('Coller depuis le presse-papier')); });
    await waitFor(() =>
      expect(getByText('https://www.deezer.com/track/42')).toBeTruthy(),
    );
  });

  it('calls addTrack with the pasted URL on confirm', async () => {
    mockGetClipboard.mockResolvedValue('https://open.spotify.com/track/abc');
    const addTrack = jest.fn().mockResolvedValue(undefined);
    const { getByText } = render(<SearchTrackModal {...DEFAULT_PROPS} addTrack={addTrack} />);
    fireEvent.press(getByText('Coller un lien'));
    await act(async () => { fireEvent.press(getByText('Coller depuis le presse-papier')); });
    await waitFor(() => getByText('Ajouter à la playlist'));
    await act(async () => { fireEvent.press(getByText('Ajouter à la playlist')); });
    expect(addTrack).toHaveBeenCalledWith('https://open.spotify.com/track/abc');
  });

  it('calls onClose after a successful paste-confirm', async () => {
    mockGetClipboard.mockResolvedValue('https://open.spotify.com/track/abc');
    const onClose = jest.fn();
    const { getByText } = render(<SearchTrackModal {...DEFAULT_PROPS} onClose={onClose} />);
    fireEvent.press(getByText('Coller un lien'));
    await act(async () => { fireEvent.press(getByText('Coller depuis le presse-papier')); });
    await waitFor(() => getByText('Ajouter à la playlist'));
    await act(async () => { fireEvent.press(getByText('Ajouter à la playlist')); });
    expect(onClose).toHaveBeenCalled();
  });
});
