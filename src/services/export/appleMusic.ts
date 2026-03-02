/**
 * Apple Music playlist exporter — MusicKit JS / User Token.
 *
 * ⚠️  DEFERRED — Phase 4b
 *
 * Apple Music export requires:
 *   - Apple Developer Program membership
 *   - com.apple.developer.musickit entitlement (iOS only)
 *   - A Developer Token (JWT signed with your MusicKit private key, valid ≤ 6 months)
 *   - A User Token obtained by calling MusicKit.getInstance().authorize()
 *
 * This is iOS-only and not supported on Android.
 * Implement once the MusicKit entitlement has been provisioned.
 *
 * Batch limit: 25 tracks per request.
 */
import type { PlatformExporter } from './base';

export const appleMusicExporter: PlatformExporter = {
  async isAuthenticated(): Promise<boolean> {
    return false;
  },

  async authenticate(): Promise<void> {
    throw new Error('Apple Music export non encore disponible.');
  },

  async createPlaylist(): Promise<string> {
    throw new Error('Apple Music export non encore disponible.');
  },

  async addTracks(): Promise<void> {
    throw new Error('Apple Music export non encore disponible.');
  },

  getPlaylistUrl(): string {
    return '';
  },
};
