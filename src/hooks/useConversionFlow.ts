import { useRef, useState } from 'react';
import type { OdesliResult, PlatformKey } from '../services/odesli';
import { fetchLinks as defaultFetchLinks } from '../services/odesli';

export type ConversionStatus = 'idle' | 'loading' | 'success' | 'error';

export type FetchFn = (
  url: string,
  platform?: PlatformKey,
) => Promise<OdesliResult>;

/**
 * Manages the music-link conversion state machine.
 *
 * Core invariant: when `pendingUrl` is set and `status === 'idle'`, the contact
 * picker MUST be visible. This is guaranteed by:
 *   1. `onShareIntent()` atomically resets status to 'idle' AND increments
 *      `generationRef` so any in-flight fetchLinks callback is discarded.
 *   2. `convertingRef` is cleared on `onShareIntent`/`reset` so the next
 *      `startConversion` call is never blocked by a stale guard.
 */
export function useConversionFlow({
  platform,
  fetchFn = defaultFetchLinks,
}: {
  platform: PlatformKey | null;
  fetchFn?: FetchFn;
}) {
  const [status, setStatus] = useState<ConversionStatus>('idle');
  const [result, setResult] = useState<OdesliResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingMsg, setLoadingMsg] = useState('');
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  // Prevents double-conversion from simultaneous clipboard + intent triggers
  const convertingRef = useRef(false);
  // Incremented on every onShareIntent/reset to invalidate stale async callbacks
  const generationRef = useRef(0);

  /**
   * Call when a share intent arrives with a music URL.
   * Atomically resets to idle AND invalidates any in-flight fetchLinks call.
   */
  function onShareIntent(url: string) {
    generationRef.current += 1;
    convertingRef.current = false;
    setPendingUrl(url);
    setStatus('idle');
    setResult(null);
    setErrorMsg('');
  }

  function startConversion(url: string, targetPlatform?: PlatformKey) {
    if (convertingRef.current) return;
    convertingRef.current = true;
    const gen = ++generationRef.current;

    setStatus('loading');
    setResult(null);
    setErrorMsg('');
    setLoadingMsg('On cherche ce morceau…');

    fetchFn(url, targetPlatform)
      .then((data) => {
        if (generationRef.current !== gen) return; // stale – discard
        convertingRef.current = false;
        setResult(data);
        setStatus('success');
      })
      .catch((err: Error) => {
        if (generationRef.current !== gen) return; // stale – discard
        convertingRef.current = false;
        setErrorMsg(err.message ?? 'Unknown error');
        setStatus('error');
      });
  }

  /** Clears all conversion state and invalidates any in-flight fetches. */
  function reset() {
    generationRef.current += 1;
    convertingRef.current = false;
    setPendingUrl(null);
    setStatus('idle');
    setResult(null);
    setErrorMsg('');
    setLoadingMsg('');
  }

  const showContactPicker = pendingUrl !== null && status === 'idle';

  return {
    status,
    result,
    errorMsg,
    loadingMsg,
    pendingUrl,
    showContactPicker,
    onShareIntent,
    startConversion,
    reset,
  };
}
