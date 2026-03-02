/**
 * YouTube Music playlist exporter.
 *
 * Reuses the existing Google Sign-In session (Firebase Auth via
 * @react-native-google-signin/google-signin). At export time, we request
 * the additional YouTube scope via GoogleSignin.addScopes() — the user sees
 * a small Google consent sheet only if they haven't granted it yet.
 *
 * This avoids creating a separate Web Application OAuth client in Google
 * Cloud Console (which rejects custom URI schemes like chorus://).
 *
 * Prerequisites:
 *   - Enable the "YouTube Data API v3" in Google Cloud Console for the project.
 *   - No extra Client ID needed — reuses the existing Android OAuth client.
 *
 * The created playlist is a standard YouTube playlist, which also appears
 * in YouTube Music (they share the same library).
 *
 * Batch limit: YouTube Data API has no batch endpoint — items are inserted
 * individually but in parallel groups of BATCH_SIZE.
 */
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import {
  clearToken,
  loadToken,
  saveToken,
  type PlatformExporter,
} from './base';

const SCOPE_GRANTED_KEY = 'export_youtube_scope_granted';
const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube';

export const youtubeMusicExporter: PlatformExporter = {
  /**
   * Returns true if we've previously obtained the YouTube scope.
   * The actual token validity is checked lazily in createPlaylist/addTracks.
   */
  async isAuthenticated(): Promise<boolean> {
    const granted = await loadToken(SCOPE_GRANTED_KEY);
    return granted === 'true';
  },

  /**
   * Requests the YouTube scope via the existing Google Sign-In.
   * Triggers a Google consent sheet if the scope hasn't been granted yet.
   */
  async authenticate(): Promise<void> {
    await GoogleSignin.addScopes({ scopes: [YOUTUBE_SCOPE] });
    await saveToken(SCOPE_GRANTED_KEY, 'true');
  },

  async createPlaylist(name: string, description?: string): Promise<string> {
    const { accessToken } = await GoogleSignin.getTokens();

    const res = await fetch(
      'https://www.googleapis.com/youtube/v3/playlists?part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          snippet: {
            title: `${name} — Chørus`,
            description: description ?? 'Exportée depuis Chørus',
          },
          status: { privacyStatus: 'private' },
        }),
      },
    );
    if (res.status === 401 || res.status === 403) {
      await clearToken(SCOPE_GRANTED_KEY);
      throw new Error(
        'Accès YouTube refusé. Reconnecte-toi et accepte l\'accès YouTube Music.',
      );
    }
    if (!res.ok) throw new Error('Création de playlist YouTube échouée');

    const data = (await res.json()) as { id: string };
    return data.id;
  },

  async addTracks(
    playlistId: string,
    platformUrls: string[],
    onProgress?: (added: number, total: number) => void,
  ): Promise<void> {
    if (platformUrls.length === 0) return;

    const { accessToken } = await GoogleSignin.getTokens();
    const videoIds = platformUrls.map(urlToYouTubeVideoId).filter(Boolean) as string[];
    let added = 0;

    // YouTube Data API v3 does not support concurrent writes to the same playlist
    // (returns 409 "The operation was aborted"). Insertions must be sequential.
    for (const videoId of videoIds) {
      const res = await fetch(
        'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            snippet: {
              playlistId,
              resourceId: { kind: 'youtube#video', videoId },
            },
          }),
        },
      );
      if (res.ok) added++;
      // Failed insertions (unavailable / region-locked videos) are skipped silently.
      onProgress?.(added, videoIds.length);
    }
  },

  getPlaylistUrl(playlistId: string): string {
    return `https://music.youtube.com/playlist?list=${playlistId}`;
  },
};

/**
 * Extracts the YouTube video ID from a youtube.com or youtu.be URL.
 * Also handles music.youtube.com links.
 */
function urlToYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.slice(1) || null;
    }
    return parsed.searchParams.get('v');
  } catch {
    return null;
  }
}
