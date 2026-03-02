/**
 * usePlaylistExport — state machine for exporting a playlist to a streaming platform.
 *
 * States:
 *   idle          → initial / after reset
 *   authenticating → OAuth flow in progress
 *   creating      → creating the playlist on the platform
 *   adding        → adding tracks (progress updated per batch)
 *   done          → export successful, playlistUrl available
 *   error         → export failed, error message available
 *
 * Usage:
 *   const { status, progress, playlistUrl, error, exportTo, reset } = usePlaylistExport(tracks, name);
 *   exportTo('spotify');   // or 'youtubeMusic' | 'deezer' | 'tidal'
 */
import { useCallback, useRef, useState } from 'react';
import type { PlatformKey } from '../services/odesli';
import type { PlaylistTrack } from '../services/playlists';
import { getExporter } from '../services/export';

export type ExportStatus =
  | 'idle'
  | 'authenticating'
  | 'creating'
  | 'adding'
  | 'done'
  | 'error';

export interface ExportProgress {
  added: number;
  total: number;
  /** Tracks that had no link for the target platform and were skipped. */
  skipped: number;
}

export interface UsePlaylistExportResult {
  status: ExportStatus;
  progress: ExportProgress;
  playlistUrl: string | null;
  error: string | null;
  exportTo: (platform: PlatformKey) => Promise<void>;
  reset: () => void;
}

const INITIAL_PROGRESS: ExportProgress = { added: 0, total: 0, skipped: 0 };

export function usePlaylistExport(
  tracks: PlaylistTrack[],
  playlistName: string,
  playlistDescription?: string,
): UsePlaylistExportResult {
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [progress, setProgress] = useState<ExportProgress>(INITIAL_PROGRESS);
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cancellation guard: if the component unmounts mid-export, we discard stale state updates.
  const activeRef = useRef(true);

  const exportTo = useCallback(
    async (platform: PlatformKey): Promise<void> => {
      activeRef.current = true;
      const exporter = getExporter(platform);

      // Pre-filter tracks that have a link for the target platform.
      const availableUrls: string[] = [];
      let skipped = 0;
      for (const track of tracks) {
        const url = track.platformLinks[platform];
        if (url) {
          availableUrls.push(url);
        } else {
          skipped++;
        }
      }

      setProgress({ added: 0, total: availableUrls.length, skipped });
      setPlaylistUrl(null);
      setError(null);

      try {
        setStatus('authenticating');
        if (!(await exporter.isAuthenticated())) {
          await exporter.authenticate();
        }

        if (!activeRef.current) return;
        setStatus('creating');
        const platformPlaylistId = await exporter.createPlaylist(
          playlistName,
          playlistDescription,
        );

        if (!activeRef.current) return;
        setStatus('adding');
        // Track the last onProgress value — addTracks reports actual successes,
        // not assumed ones. The done state uses this rather than availableUrls.length.
        let finalAdded = 0;
        await exporter.addTracks(platformPlaylistId, availableUrls, (added, total) => {
          if (!activeRef.current) return;
          finalAdded = added;
          setProgress({ added, total, skipped });
        });

        if (!activeRef.current) return;
        setPlaylistUrl(exporter.getPlaylistUrl(platformPlaylistId));
        setProgress({ added: finalAdded, total: availableUrls.length, skipped });
        setStatus('done');
      } catch (err) {
        if (!activeRef.current) return;
        setError(err instanceof Error ? err.message : 'Export échoué');
        setStatus('error');
      }
    },
    [tracks, playlistName, playlistDescription],
  );

  const reset = useCallback(() => {
    activeRef.current = false;
    setStatus('idle');
    setProgress(INITIAL_PROGRESS);
    setPlaylistUrl(null);
    setError(null);
  }, []);

  return { status, progress, playlistUrl, error, exportTo, reset };
}
