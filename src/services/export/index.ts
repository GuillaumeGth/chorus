/**
 * Export service factory.
 * Returns the PlatformExporter implementation for the given platform key.
 */
import type { PlatformKey } from '../odesli';
import { appleMusicExporter } from './appleMusic';
import type { PlatformExporter } from './base';
import { deezerExporter } from './deezer';
import { spotifyExporter } from './spotify';
import { tidalExporter } from './tidal';
import { youtubeMusicExporter } from './youtubeMusic';

export type { PlatformExporter } from './base';

const EXPORTERS: Record<PlatformKey, PlatformExporter> = {
  spotify: spotifyExporter,
  youtubeMusic: youtubeMusicExporter,
  deezer: deezerExporter,
  tidal: tidalExporter,
  appleMusic: appleMusicExporter,
};

export function getExporter(platform: PlatformKey): PlatformExporter {
  return EXPORTERS[platform];
}
