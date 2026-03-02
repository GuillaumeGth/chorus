/**
 * Deezer playlist exporter — OAuth 2.0 implicit flow.
 *
 * Deezer uses an implicit OAuth flow (no PKCE, no refresh token).
 * The access token is returned directly in the redirect URI fragment.
 * Tokens are valid for ~1 hour; the user will need to re-authenticate after expiry.
 *
 * Setup required:
 *   1. Create an app at https://developers.deezer.com/myapps (free)
 *   2. Copy the App ID to EXPO_PUBLIC_DEEZER_APP_ID in app.json extra or .env
 *   3. Set the Redirect Domain in the Deezer app settings to match the URI below
 *
 * Track IDs are extracted from platformLinks.deezer URLs.
 * Example: https://www.deezer.com/track/3135556 → ID = "3135556"
 */
import * as WebBrowser from 'expo-web-browser';
import { exportConfig } from './config';
import {
  chunk,
  clearToken,
  isTokenValid,
  loadStoredToken,
  saveStoredToken,
  type PlatformExporter,
} from './base';

WebBrowser.maybeCompleteAuthSession();

const REDIRECT_URI = 'chorus://oauth/deezer';
const TOKEN_KEY = 'export_deezer_token';
const PERMISSIONS = 'manage_library';
const BATCH_SIZE = 50;

export const deezerExporter: PlatformExporter = {
  async isAuthenticated(): Promise<boolean> {
    return isTokenValid(TOKEN_KEY);
  },

  async authenticate(): Promise<void> {
    const DEEZER_APP_ID = exportConfig.deezerAppId;
    if (!DEEZER_APP_ID) {
      throw new Error(
        'EXPO_PUBLIC_DEEZER_APP_ID non configuré. ' +
          'Crée une app sur developers.deezer.com et ajoute l\'App ID.',
      );
    }

    const authUrl = new URL('https://connect.deezer.com/oauth/auth.php');
    authUrl.searchParams.set('app_id', DEEZER_APP_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('perms', PERMISSIONS);
    authUrl.searchParams.set('response_type', 'token');

    const result = await WebBrowser.openAuthSessionAsync(authUrl.toString(), REDIRECT_URI);
    if (result.type !== 'success') throw new Error('Authentification Deezer annulée');

    // Access token is in the fragment (#access_token=...&expires=...)
    const fragment = result.url.split('#')[1] ?? '';
    const params = new URLSearchParams(fragment);
    const accessToken = params.get('access_token');
    const expiresIn = parseInt(params.get('expires') ?? '3600', 10);

    if (!accessToken) throw new Error('Token Deezer absent de la réponse');

    await saveStoredToken(TOKEN_KEY, {
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    });
  },

  async createPlaylist(name: string): Promise<string> {
    const token = await loadStoredToken(TOKEN_KEY);
    if (!token) throw new Error('Non authentifié sur Deezer');

    const res = await fetch(
      `https://api.deezer.com/user/me/playlists?access_token=${token.accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ title: `${name} — Chørus` }).toString(),
      },
    );
    if (res.status === 401 || res.status === 403) {
      await clearToken(TOKEN_KEY);
      throw new Error('Session Deezer expirée. Reconnecte-toi.');
    }
    if (!res.ok) throw new Error('Création de playlist Deezer échouée');

    const data = (await res.json()) as { id: number };
    return String(data.id);
  },

  async addTracks(
    playlistId: string,
    platformUrls: string[],
    onProgress?: (added: number, total: number) => void,
  ): Promise<void> {
    if (platformUrls.length === 0) return;

    const token = await loadStoredToken(TOKEN_KEY);
    if (!token) throw new Error('Non authentifié sur Deezer');

    const ids = platformUrls.map(urlToDeezerTrackId).filter(Boolean) as string[];
    const batches = chunk(ids, BATCH_SIZE);
    let added = 0;

    for (const batch of batches) {
      const res = await fetch(
        `https://api.deezer.com/playlist/${playlistId}/tracks?access_token=${token.accessToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ songs: batch.join(',') }).toString(),
        },
      );
      if (!res.ok) throw new Error('Ajout de morceaux Deezer échoué');
      added += batch.length;
      onProgress?.(added, ids.length);
    }
  },

  getPlaylistUrl(playlistId: string): string {
    return `https://www.deezer.com/playlist/${playlistId}`;
  },
};

/** Extracts the Deezer track ID from a deezer.com/track URL. */
function urlToDeezerTrackId(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    // pathname: /track/3135556 → ['track', '3135556']
    if (parts[0] !== 'track' || !parts[1]) return null;
    return parts[1];
  } catch {
    return null;
  }
}
