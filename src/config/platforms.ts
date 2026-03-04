/**
 * enabledPlatforms — single source of truth for platform availability.
 *
 * Set a platform to `false` to hide it everywhere in the app
 * (platform picker in Settings + export modal in playlist detail).
 * Flip it back to `true` to re-enable it.
 */
import type { PlatformKey } from '../services/odesli';

export const enabledPlatforms: Record<PlatformKey, boolean> = {
  spotify:      true,
  appleMusic:   true,
  youtubeMusic: true,
  deezer:       true,
  tidal:        false, // réactiver quand l'export Tidal est prêt
};
