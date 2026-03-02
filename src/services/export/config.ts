/**
 * Export service configuration — wraps EXPO_PUBLIC_* env vars so that
 * Jest tests can mock this module instead of fighting Babel's compile-time
 * process.env inlining (which babel-preset-expo applies to EXPO_PUBLIC_* vars).
 *
 * In tests: jest.mock('../../services/export/config', () => ({ exportConfig: { ... } }))
 */
export const exportConfig = {
  spotifyClientId: process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ?? '',
  deezerAppId: process.env.EXPO_PUBLIC_DEEZER_APP_ID ?? '',
  tidalClientId: process.env.EXPO_PUBLIC_TIDAL_CLIENT_ID ?? '',
};
