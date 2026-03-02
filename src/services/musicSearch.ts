/**
 * Platform-agnostic music search via the Deezer public API.
 *
 * No API key required. Results include a Deezer track URL that Odesli can
 * resolve to links for every supported streaming platform.
 *
 * Endpoint: GET https://api.deezer.com/search?q=<query>&limit=<n>
 */

const DEEZER_API = 'https://api.deezer.com/search';
const DEFAULT_LIMIT = 20;

// ---------------------------------------------------------------------------
// Deezer response types (readonly — external API data)
// ---------------------------------------------------------------------------

interface DeezerArtist {
  readonly name: string;
}

interface DeezerAlbum {
  /** 250×250 JPEG thumbnail. */
  readonly cover_medium: string;
}

interface DeezerTrack {
  readonly id: number;
  readonly title: string;
  /** Canonical Deezer track URL — compatible with Odesli. */
  readonly link: string;
  readonly artist: DeezerArtist;
  readonly album: DeezerAlbum;
}

interface DeezerSearchResponse {
  readonly data: DeezerTrack[];
  readonly error?: {
    readonly message: string;
    readonly type: string;
    readonly code: number;
  };
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MusicSearchResult {
  /** Deezer track URL — pass to `addTrackToPlaylist` for Odesli resolution. */
  url: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Searches for tracks using the Deezer public API.
 * Returns an empty array for blank queries rather than making a network call.
 *
 * @throws {Error} On HTTP errors or if Deezer returns an API-level error.
 */
export async function searchMusic(query: string): Promise<MusicSearchResult[]> {
  if (!query.trim()) return [];

  const url = `${DEEZER_API}?q=${encodeURIComponent(query)}&limit=${DEFAULT_LIMIT}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Deezer API error: ${response.status}`);
  }

  const data = (await response.json()) as DeezerSearchResponse;

  if (data.error) {
    throw new Error(`Deezer error ${data.error.code}: ${data.error.message}`);
  }

  return data.data.map((track) => ({
    url: track.link,
    title: track.title,
    artist: track.artist.name,
    thumbnailUrl: track.album.cover_medium,
  }));
}
