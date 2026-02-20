const API_BASE = 'https://api.song.link/v1-alpha.1/links';

export type PlatformKey = 'spotify' | 'appleMusic' | 'youtubeMusic' | 'deezer' | 'tidal';

export interface OdesliResult {
  title: string;
  artist: string;
  thumbnailUrl: string;
  platformLinks: Partial<Record<PlatformKey, string>>;
}

const PLATFORM_TO_PROVIDER: Record<PlatformKey, string> = {
  spotify: 'spotify',
  appleMusic: 'appleMusic',
  youtubeMusic: 'youtubeMusic',
  deezer: 'deezer',
  tidal: 'tidal',
};

export async function fetchLinks(url: string): Promise<OdesliResult> {
  const response = await fetch(`${API_BASE}?url=${encodeURIComponent(url)}`);
  if (!response.ok) {
    throw new Error(`Odesli API error: ${response.status}`);
  }
  const data = await response.json();

  const entitiesKey = Object.keys(data.entitiesByUniqueId ?? {})[0];
  const entity = entitiesKey ? data.entitiesByUniqueId[entitiesKey] : null;

  const title: string = entity?.title ?? 'Unknown title';
  const artist: string = entity?.artistName ?? 'Unknown artist';
  const thumbnailUrl: string = entity?.thumbnailUrl ?? '';

  const platformLinks: Partial<Record<PlatformKey, string>> = {};
  for (const [key, provider] of Object.entries(PLATFORM_TO_PROVIDER) as [PlatformKey, string][]) {
    const link = data.linksByPlatform?.[provider]?.url;
    if (link) {
      platformLinks[key] = link;
    }
  }

  return { title, artist, thumbnailUrl, platformLinks };
}
