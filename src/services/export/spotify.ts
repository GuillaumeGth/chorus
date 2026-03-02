/**
 * Spotify playlist exporter — OAuth 2.0 PKCE.
 *
 * Setup required:
 *   1. Create an app at https://developer.spotify.com/dashboard (free)
 *   2. Copy the Client ID into EXPO_PUBLIC_SPOTIFY_CLIENT_ID (app.json extra or .env)
 *   3. Add the redirect URI below to "Redirect URIs" in your Spotify app settings
 *
 * Scopes: playlist-modify-public playlist-modify-private
 * Batch limit: 100 URIs per request (Spotify Web API constraint)
 */
import * as WebBrowser from 'expo-web-browser';
import { exportConfig } from './config';
import {
  chunk,
  clearToken,
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
  isTokenValid,
  loadStoredToken,
  saveStoredToken,
  type PlatformExporter,
} from './base';

WebBrowser.maybeCompleteAuthSession();

const REDIRECT_URI = 'chorus://oauth/spotify';
const TOKEN_KEY = 'export_spotify_token';
const SCOPES = 'playlist-modify-public playlist-modify-private';
const BATCH_SIZE = 100;

export const spotifyExporter: PlatformExporter = {
  async isAuthenticated(): Promise<boolean> {
    return isTokenValid(TOKEN_KEY);
  },

  async authenticate(): Promise<void> {
    const SPOTIFY_CLIENT_ID = exportConfig.spotifyClientId;
    if (!SPOTIFY_CLIENT_ID) {
      throw new Error(
        'EXPO_PUBLIC_SPOTIFY_CLIENT_ID non configuré. ' +
          'Crée une app sur developer.spotify.com et ajoute le Client ID.',
      );
    }

    const verifier = await generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = await generateState();

    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.set('client_id', SPOTIFY_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('state', state);

    const result = await WebBrowser.openAuthSessionAsync(authUrl.toString(), REDIRECT_URI);
    if (result.type !== 'success') throw new Error('Authentification Spotify annulée');

    const params = new URL(result.url).searchParams;
    const returnedState = params.get('state');
    if (returnedState !== state) throw new Error('État OAuth invalide (CSRF)');

    const code = params.get('code');
    if (!code) throw new Error('Code d\'autorisation absent de la réponse Spotify');

    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: SPOTIFY_CLIENT_ID,
        code_verifier: verifier,
      }).toString(),
    });
    if (!tokenResponse.ok) {
      const err = await tokenResponse.text();
      throw new Error(`Échange de token Spotify échoué : ${err}`);
    }
    const data = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    await saveStoredToken(TOKEN_KEY, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    });
  },

  async createPlaylist(name: string, description?: string): Promise<string> {
    const token = await loadStoredToken(TOKEN_KEY);
    if (!token) throw new Error('Non authentifié sur Spotify');

    // Get the current user's Spotify ID first.
    const meRes = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });
    if (!meRes.ok) {
      await clearToken(TOKEN_KEY);
      throw new Error('Impossible de récupérer le profil Spotify. Reconnecte-toi.');
    }
    const me = (await meRes.json()) as { id: string };

    const createRes = await fetch(`https://api.spotify.com/v1/users/${me.id}/playlists`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `${name} — Chørus`,
        description: description ?? 'Exportée depuis Chørus',
        public: false,
      }),
    });
    if (!createRes.ok) throw new Error('Création de playlist Spotify échouée');

    const playlist = (await createRes.json()) as { id: string };
    return playlist.id;
  },

  async addTracks(
    playlistId: string,
    platformUrls: string[],
    onProgress?: (added: number, total: number) => void,
  ): Promise<void> {
    if (platformUrls.length === 0) return;

    const token = await loadStoredToken(TOKEN_KEY);
    if (!token) throw new Error('Non authentifié sur Spotify');

    // Spotify expects track URIs like "spotify:track:4iV5W9uYEdYUVa79Axb7Rh"
    // The platformLinks.spotify URLs look like "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh"
    const uris = platformUrls.map(urlToSpotifyUri).filter(Boolean) as string[];
    const batches = chunk(uris, BATCH_SIZE);
    let added = 0;

    for (const batch of batches) {
      const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris: batch }),
      });
      if (!res.ok) throw new Error('Ajout de morceaux Spotify échoué');
      added += batch.length;
      onProgress?.(added, uris.length);
    }
  },

  getPlaylistUrl(playlistId: string): string {
    return `https://open.spotify.com/playlist/${playlistId}`;
  },
};

/** Converts an open.spotify.com track URL to a Spotify URI. */
function urlToSpotifyUri(url: string): string | null {
  try {
    const pathname = new URL(url).pathname; // /track/4iV5W9uYEdYUVa79Axb7Rh
    const parts = pathname.split('/').filter(Boolean); // ['track', '4iV5W9...']
    if (parts.length < 2) return null;
    return `spotify:${parts[0]}:${parts[1]}`;
  } catch {
    return null;
  }
}
