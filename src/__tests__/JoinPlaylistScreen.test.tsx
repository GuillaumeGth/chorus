/**
 * Spec: JoinPlaylistScreen
 *
 * Screen mounted at /playlist/join/:code.
 * - Shows a loading spinner while joining.
 * - On success, calls router.replace('/playlist/:id').
 * - On failure (invalid code, link disabled), shows an error card.
 * - Accepts the user from useAuth; does nothing until auth is loaded.
 */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import JoinPlaylistScreen from '../../app/playlist/join/[code]';
import { joinPlaylistByCode } from '../services/playlists';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../config/firebase', () => ({ db: '__DB__', auth: {} }));

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useRouter:           jest.fn(),
}));

jest.mock('../services/playlists', () => ({
  joinPlaylistByCode: jest.fn(),
}));

jest.mock('../hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Typed refs to mocks
// ---------------------------------------------------------------------------

const mockJoin                = joinPlaylistByCode         as jest.Mock;
const mockUseLocalSearchParams = useLocalSearchParams      as jest.Mock;
const mockUseRouter            = useRouter                 as jest.Mock;
const mockUseAuth              = useAuth                   as jest.Mock;
const mockReplace              = jest.fn();

const FAKE_USER = {
  uid:         'user1',
  displayName: 'Alice',
  email:       'alice@example.com',
  photoURL:    null,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.resetAllMocks();
  mockUseLocalSearchParams.mockReturnValue({ code: 'abc123' });
  mockUseRouter.mockReturnValue({ replace: mockReplace });
  mockUseAuth.mockReturnValue({ user: FAKE_USER, loaded: true });
  mockJoin.mockResolvedValue('playlist1');
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JoinPlaylistScreen', () => {
  it('shows a loading indicator while the join is in progress', async () => {
    mockJoin.mockReturnValue(new Promise(() => {}));
    const { getByText } = render(<JoinPlaylistScreen />);
    expect(getByText('Chargement de la playlist…')).toBeTruthy();
  });

  it('calls joinPlaylistByCode with code, uid, displayName, photoURL', async () => {
    render(<JoinPlaylistScreen />);
    await waitFor(() => expect(mockJoin).toHaveBeenCalledWith('abc123', 'user1', 'Alice', null));
  });

  it('calls router.replace with the playlist path on success', async () => {
    render(<JoinPlaylistScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/playlist/playlist1'));
  });

  it('does not call join before auth is loaded', async () => {
    mockUseAuth.mockReturnValue({ user: null, loaded: false });
    render(<JoinPlaylistScreen />);
    await act(async () => {});
    expect(mockJoin).not.toHaveBeenCalled();
  });

  it('does not call join when user is null (not logged in)', async () => {
    mockUseAuth.mockReturnValue({ user: null, loaded: true });
    render(<JoinPlaylistScreen />);
    await act(async () => {});
    expect(mockJoin).not.toHaveBeenCalled();
  });

  it('only calls join once even if the component re-renders', async () => {
    const { rerender } = render(<JoinPlaylistScreen />);
    await act(async () => {});
    rerender(<JoinPlaylistScreen />);
    await act(async () => {});
    expect(mockJoin).toHaveBeenCalledTimes(1);
  });

  it('shows the error title and card on invalid code failure', async () => {
    mockJoin.mockRejectedValue(new Error('Code invalide ou lien désactivé'));
    const { findByText } = render(<JoinPlaylistScreen />);
    await findByText('Impossible de rejoindre');
    await findByText('Code invalide ou lien désactivé.');
  });

  it('shows a generic error on unexpected failure', async () => {
    mockJoin.mockRejectedValue(new Error('Network error'));
    const { findByText } = render(<JoinPlaylistScreen />);
    await findByText('Une erreur est survenue. Réessaie.');
  });

  it('shows the back-to-home button on error', async () => {
    mockJoin.mockRejectedValue(new Error('Code invalide ou lien désactivé'));
    const { findByText } = render(<JoinPlaylistScreen />);
    await findByText("Retour à l'accueil");
  });

  it('navigates home when back button is pressed on error', async () => {
    mockJoin.mockRejectedValue(new Error('Code invalide'));
    const { findByText } = render(<JoinPlaylistScreen />);
    const btn = await findByText("Retour à l'accueil");
    await act(async () => { fireEvent.press(btn); });
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
