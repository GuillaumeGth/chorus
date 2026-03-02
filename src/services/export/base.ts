/**
 * Base interface and shared utilities for OAuth playlist exporters.
 *
 * Each platform exporter implements PlatformExporter.
 * Tokens are stored in expo-secure-store (never AsyncStorage — sensitive data).
 *
 * PKCE utilities:
 *   - generateCodeVerifier()  → random 32-byte base64url string
 *   - generateCodeChallenge() → SHA-256 of the verifier, base64url-encoded
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

// ─── PlatformExporter interface ───────────────────────────────────────────────

export interface PlatformExporter {
  /** Returns true if a valid (non-expired) token is stored. */
  isAuthenticated(): Promise<boolean>;
  /** Launches the OAuth2 PKCE flow and persists the token. */
  authenticate(): Promise<void>;
  /**
   * Creates a new playlist on the platform.
   * @returns The platform-internal playlist ID (opaque string).
   */
  createPlaylist(name: string, description?: string): Promise<string>;
  /**
   * Adds tracks to the playlist, respecting platform batch limits.
   * Calls onProgress after each batch.
   * @param platformUrls  Direct links for the target platform (pre-filtered).
   */
  addTracks(
    playlistId: string,
    platformUrls: string[],
    onProgress?: (added: number, total: number) => void,
  ): Promise<void>;
  /** Returns the public URL to open the playlist in the platform app. */
  getPlaylistUrl(playlistId: string): string;
}

// ─── SecureStore helpers ───────────────────────────────────────────────────────

export async function saveToken(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

export async function loadToken(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key);
}

export async function clearToken(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key);
}

// ─── Stored token shape ───────────────────────────────────────────────────────

export interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  /** Unix ms timestamp after which the token should be considered expired. */
  expiresAt: number;
}

export async function saveStoredToken(key: string, token: StoredToken): Promise<void> {
  await saveToken(key, JSON.stringify(token));
}

export async function loadStoredToken(key: string): Promise<StoredToken | null> {
  const raw = await loadToken(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredToken;
  } catch {
    return null;
  }
}

/** Returns true if a stored token exists and is not expired (with a 60-second buffer). */
export async function isTokenValid(key: string): Promise<boolean> {
  const token = await loadStoredToken(key);
  if (!token) return false;
  return token.expiresAt > Date.now() + 60_000;
}

// ─── PKCE utilities ───────────────────────────────────────────────────────────

function base64urlEncode(bytes: Uint8Array): string {
  // btoa requires a binary string — map each byte to a char.
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Generates a 32-byte random code verifier (RFC 7636). */
export async function generateCodeVerifier(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return base64urlEncode(bytes);
}

/**
 * Generates the SHA-256 code challenge from a code verifier.
 * expo-crypto's digestStringAsync returns a hex string by default;
 * we use BASE64 encoding and then convert to base64url.
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const base64 = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Generates a random 16-byte state parameter for CSRF protection. */
export async function generateState(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return base64urlEncode(bytes);
}

// ─── Batch helper ─────────────────────────────────────────────────────────────

/** Splits an array into chunks of at most `size` items. */
export function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}
