/**
 * Tidal playlist exporter — OAuth 2.0 PKCE (TIDAL Open API, launched 2023).
 *
 * Setup required:
 *   1. Create an app at https://developer.tidal.com (free)
 *   2. Copy the Client ID to EXPO_PUBLIC_TIDAL_CLIENT_ID in app.json extra or .env
 *   3. Add the redirect URI below to your TIDAL app settings
 *
 * API reference: https://developer.tidal.com/apiref
 * Tracks are identified by their TIDAL track IDs, extracted from platformLinks.tidal URLs.
 * Example: https://listen.tidal.com/track/59727857 → ID = "59727857"
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

const REDIRECT_URI = 'chorus://oauth/tidal';
const TOKEN_KEY = 'export_tidal_token';
const SCOPES = 'playlists.read playlists.write';
const BATCH_SIZE = 50;

export const tidalExporter: PlatformExporter = {
  async isAuthenticated(): Promise<boolean> {
    return isTokenValid(TOKEN_KEY);
  },

  async authenticate(): Promise<void> {
    const TIDAL_CLIENT_ID = exportConfig.tidalClientId;
    if (!TIDAL_CLIENT_ID) {
      throw new Error(
        'EXPO_PUBLIC_TIDAL_CLIENT_ID non configuré. ' +
          'Crée une app sur developer.tidal.com et ajoute le Client ID.',
      );
    }

    const verifier = await generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = await generateState();

    const authUrl = new URL('https://login.tidal.com/oauth2/authorize');
    authUrl.searchParams.set('client_id', TIDAL_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('state', state);

    const result = await WebBrowser.openAuthSessionAsync(authUrl.toString(), REDIRECT_URI);
    if (result.type !== 'success') throw new Error('Authentification TIDAL annulée');

    const params = new URL(result.url).searchParams;
    const returnedState = params.get('state');
    if (returnedState !== state) throw new Error('État OAuth invalide (CSRF)');

    const code = params.get('code');
    if (!code) throw new Error('Code d\'autorisation absent de la réponse TIDAL');

    const tokenResponse = await fetch('https://auth.tidal.com/v1/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: TIDAL_CLIENT_ID,
        code_verifier: verifier,
      }).toString(),
    });
    if (!tokenResponse.ok) {
      const err = await tokenResponse.text();
      throw new Error(`Échange de token TIDAL échoué : ${err}`);
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
    if (!token) throw new Error('Non authentifié sur TIDAL');

    const res = await fetch('https://openapi.tidal.com/v2/playlists', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        'Content-Type': 'application/vnd.api+json',
      },
      body: JSON.stringify({
        data: {
          type: 'playlists',
          attributes: {
            name: `${name} — Chørus`,
            description: description ?? 'Exportée depuis Chørus',
            privacy: 'PRIVATE',
          },
        },
      }),
    });
    if (res.status === 401) {
      await clearToken(TOKEN_KEY);
      throw new Error('Session TIDAL expirée. Reconnecte-toi.');
    }
    if (!res.ok) throw new Error('Création de playlist TIDAL échouée');

    const data = (await res.json()) as { data: { id: string } };
    return data.data.id;
  },

  async addTracks(
    playlistId: string,
    platformUrls: string[],
    onProgress?: (added: number, total: number) => void,
  ): Promise<void> {
    if (platformUrls.length === 0) return;

    const token = await loadStoredToken(TOKEN_KEY);
    if (!token) throw new Error('Non authentifié sur TIDAL');

    const ids = platformUrls.map(urlToTidalTrackId).filter(Boolean) as string[];
    const batches = chunk(ids, BATCH_SIZE);
    let added = 0;

    for (const batch of batches) {
      const res = await fetch(
        `https://openapi.tidal.com/v2/playlists/${playlistId}/relationships/items`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token.accessToken}`,
            'Content-Type': 'application/vnd.api+json',
          },
          body: JSON.stringify({
            data: batch.map((id) => ({ type: 'tracks', id })),
          }),
        },
      );
      if (!res.ok) throw new Error('Ajout de morceaux TIDAL échoué');
      added += batch.length;
      onProgress?.(added, ids.length);
    }
  },

  getPlaylistUrl(playlistId: string): string {
    return `https://listen.tidal.com/playlist/${playlistId}`;
  },
};

/** Extracts the TIDAL track ID from a listen.tidal.com/track URL. */
function urlToTidalTrackId(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    // pathname: /track/59727857 → ['track', '59727857']
    if (parts[0] !== 'track' || !parts[1]) return null;
    return parts[1];
  } catch {
    return null;
  }
}
