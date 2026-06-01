/**
 * useMediaStreamSrc
 *
 * Resolve a media URL into a directly-streamable `<video>` src.
 *
 * Backend media gets a short-lived `?token=` appended so the element streams it
 * with native HTTP Range (no full-file blob download — first frame shows while
 * the rest downloads). `blob:`/`data:`/`file:` and external provider URLs are
 * returned as-is.
 *
 * When the media token is already warm (the common case after the first video),
 * the src is resolved synchronously during render so there's no wasted frame
 * with an empty src. Only the cold-token case is async.
 */
import { useEffect, useState } from 'react';

import { BACKEND_BASE } from '@lib/api/client';
import { resolveBackendUrl } from '@lib/media/backendUrl';
import { appendMediaToken, getMediaToken, peekMediaToken } from '@lib/media/mediaToken';

/** Resolve to a final src synchronously, or undefined if a token fetch is needed. */
function resolveSync(mediaUrl: string | undefined): string | undefined {
  if (!mediaUrl) return undefined;
  if (/^(blob:|data:|file:)/i.test(mediaUrl)) return mediaUrl;
  const { fullUrl, isBackend } = resolveBackendUrl(mediaUrl, BACKEND_BASE);
  if (!isBackend) return fullUrl;
  const token = peekMediaToken();
  return token ? appendMediaToken(fullUrl, token) : undefined;
}

export function useMediaStreamSrc(mediaUrl: string | undefined): string | undefined {
  const [resolved, setResolved] = useState<{ url: string | undefined; src: string | undefined }>(
    () => ({ url: mediaUrl, src: resolveSync(mediaUrl) }),
  );

  // Re-resolve synchronously when the input changes — avoids a render with a
  // stale/empty src (and the spinner that follows) when the token is warm.
  if (resolved.url !== mediaUrl) {
    setResolved({ url: mediaUrl, src: resolveSync(mediaUrl) });
  }

  useEffect(() => {
    // Only the backend-needs-token path is async; everything else resolved
    // synchronously above.
    if (resolveSync(mediaUrl) !== undefined || !mediaUrl) return;
    if (/^(blob:|data:|file:)/i.test(mediaUrl)) return;
    const { fullUrl, isBackend } = resolveBackendUrl(mediaUrl, BACKEND_BASE);
    if (!isBackend) return;

    let cancelled = false;
    void getMediaToken()
      .then((token) => {
        if (!cancelled) setResolved({ url: mediaUrl, src: appendMediaToken(fullUrl, token) });
      })
      .catch(() => {
        // Leave src empty — the <video> onError fallback chain takes over.
      });
    return () => {
      cancelled = true;
    };
  }, [mediaUrl]);

  return resolved.src;
}
