// Intercepts URLs before expo-router processes them.
// When the app is opened via an Android intent filter (click on a music link),
// the full URL is redirected to the index screen as a query param.

const MUSIC_HOSTS = [
  'open.spotify.com',
  'spotify.link',
  'music.apple.com',
  'music.youtube.com',
  'www.deezer.com',
  'deezer.com',
  'tidal.com',
  'listen.tidal.com',
];

function isMusicUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return MUSIC_HOSTS.includes(hostname);
  } catch {
    return false;
  }
}

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (isMusicUrl(path)) {
    return `/?incomingUrl=${encodeURIComponent(path)}`;
  }
  return path;
}
