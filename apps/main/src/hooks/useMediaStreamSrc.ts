/**
 * useMediaStreamSrc
 *
 * Resolve a media URL into a directly-streamable `<video>` src.
 *
 * Backend media gets a short-lived `?token=` appended so the element streams it
 * with native HTTP Range (no full-file blob download — first frame shows while
 * the rest downloads). `blob:`/`data:`/`file:` and external provider URLs are
 * returned as-is. Returns `undefined` until a backend token is available, then
 * resolves on the next tick.
 */
import { useEffect, useState } from 'react';

import { BACKEND_BASE } from '@lib/api/client';
import { resolveBackendUrl } from '@lib/media/backendUrl';
import { appendMediaToken, getMediaToken, peekMediaToken } from '@lib/media/mediaToken';

export function useMediaStreamSrc(mediaUrl: string | undefined): string | undefined {
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    if (!mediaUrl) {
      setSrc(undefined);
      return;
    }

    // Already directly usable by the element.
    if (/^(blob:|data:|file:)/i.test(mediaUrl)) {
      setSrc(mediaUrl);
      return;
    }

    const { fullUrl, isBackend } = resolveBackendUrl(mediaUrl, BACKEND_BASE);
    if (!isBackend) {
      // External provider URL — no auth needed.
      setSrc(fullUrl);
      return;
    }

    // Backend: stream directly with a media token.
    const cachedToken = peekMediaToken();
    if (cachedToken) {
      setSrc(appendMediaToken(fullUrl, cachedToken));
      return;
    }

    setSrc(undefined);
    void getMediaToken()
      .then((token) => {
        if (!cancelled) setSrc(appendMediaToken(fullUrl, token));
      })
      .catch(() => {
        // Leave undefined — the <video> onError fallback chain takes over.
        if (!cancelled) setSrc(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [mediaUrl]);

  return src;
}
