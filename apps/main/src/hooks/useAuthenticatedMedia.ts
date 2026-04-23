/**
 * useAuthenticatedMedia
 *
 * Hook to load media URLs that require authentication.
 * Fetches with Authorization header and converts to blob URL for use in img/video src.
 */

import { useEffect, useRef, useState } from 'react';

import { authService } from '@lib/auth';
import { resolveBackendUrl } from '@lib/media/backendUrl';
import { createBlobCache } from '@lib/media/blobCache';

import { BACKEND_BASE } from '../lib/api/client';

// ── Module-level blob URL caches ────────────────────────────────────────
// Video blobs are 50-200MB+ each — keep a very small cache with a tight
// byte budget.  Image/mask blobs are 1-5MB — a larger count cache is fine.
const _authImageBlobCache = createBlobCache('useAuthenticatedMedia:blobCache', {
  maxEntries: 60,
  maxBytes: 300 * 1024 * 1024, // 300 MB
});
const _authVideoBlobCache = createBlobCache('useAuthenticatedMedia:videoBlobCache', {
  maxEntries: 8,
  maxBytes: 400 * 1024 * 1024, // 400 MB
});

/** Exposed for diagnostics (e.g., PerformancePanel). */
export const authMediaCaches = {
  image: _authImageBlobCache,
  video: _authVideoBlobCache,
};

/** Purge all authenticated-media blob caches (revokes object URLs). */
export function clearAuthMediaCaches(): void {
  _authImageBlobCache.clear();
  _authVideoBlobCache.clear();
}


export interface UseAuthenticatedMediaResult {
  /** The resolved media URL (blob URL for authenticated, original for external) */
  src: string | undefined;
  /** Whether the media is currently loading */
  loading: boolean;
  /** Whether the media failed to load */
  error: boolean;
}

/**
 * Hook to load authenticated media URLs.
 *
 * For backend URLs (starting with /api or relative paths), fetches with
 * Authorization header and returns a blob URL.
 * For external URLs (http/https), returns them directly.
 *
 * @param url - The media URL to load
 * @returns Object with src, loading, and error states
 */
export interface UseAuthenticatedMediaOptions {
  /**
   * When true, only fetch while active (e.g., hover scrub).
   * Default: true.
   */
  active?: boolean;
  /**
   * Hint for cache selection.  Video blobs are much larger (50-200MB+) than
   * images, so they use a smaller dedicated LRU cache to cap memory.
   */
  mediaType?: 'video' | 'image';
}

class MediaHttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

export function useAuthenticatedMedia(
  url: string | undefined,
  options: UseAuthenticatedMediaOptions = {},
): UseAuthenticatedMediaResult {
  const [src, setSrc] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const lastRequestUrlRef = useRef<string | undefined>(undefined);
  const isActive = options.active ?? true;
  const cache = options.mediaType === 'video' ? _authVideoBlobCache : _authImageBlobCache;

  useEffect(() => {
    let cancelled = false;

    if (!url || !isActive) {
      lastRequestUrlRef.current = undefined;
      setSrc(undefined);
      setLoading(false);
      setError(false);
      return;
    }

    // Blob/data/file URLs - use directly
    if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('file://')) {
      setSrc(url);
      setLoading(false);
      setError(false);
      return;
    }

    const { fullUrl, isBackend } = resolveBackendUrl(url, BACKEND_BASE);

    // External URLs - use directly (no auth needed)
    if (!isBackend) {
      lastRequestUrlRef.current = fullUrl;
      setSrc(fullUrl);
      setLoading(false);
      setError(false);
      return;
    }

    // Backend path - needs authentication

    const token = authService.getStoredToken();

    // Backend media endpoints require Authorization. Avoid falling back to a raw
    // backend URL because that creates noisy 401s from <img>/<video> elements.
    if (!token) {
      setSrc(undefined);
      setLoading(false);
      setError(true);
      return;
    }

    // Check module-level cache first
    const requestChanged = lastRequestUrlRef.current !== fullUrl;
    lastRequestUrlRef.current = fullUrl;
    const cached = cache.get(fullUrl);
    if (cached) {
      setSrc(cached);
      setLoading(false);
      setError(false);
      return;
    }

    // Fetch with authentication
    if (requestChanged) {
      setSrc(undefined);
    }
    setLoading(true);
    setError(false);

    const fetchMedia = async () => {
      try {
        const blobUrl = await cache.deduplicatedFetch(fullUrl, async () => {
          // Another caller may have cached while this request was waiting in-flight.
          const cachedAgain = cache.get(fullUrl);
          if (cachedAgain) return cachedAgain;

          // cache: 'no-store' prevents Chrome from holding a second copy of
          // the response body in its HTTP cache on top of our blob cache.
          const res = await fetch(fullUrl, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          });
          if (!res.ok) throw new MediaHttpError(res.status);

          const blob = await res.blob();
          // Re-check cache after blob read in case another in-flight path
          // populated it during this await.
          const raceCached = cache.get(fullUrl);
          if (raceCached) return raceCached;

          const objectUrl = URL.createObjectURL(blob);
          cache.set(fullUrl, objectUrl, blob.size);
          return objectUrl;
        });

        if (!cancelled) {
          setSrc(blobUrl);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof MediaHttpError) {
            console.warn(`[useAuthenticatedMedia] Failed to fetch ${fullUrl}: ${err.status}`);
          } else {
            console.warn(`[useAuthenticatedMedia] Error fetching ${fullUrl}:`, err);
          }
          setError(true);
          setLoading(false);
          setSrc(undefined);
        }
      }
    };

    fetchMedia();

    return () => {
      cancelled = true;
      // Blob URLs are NOT revoked here — the module-level LRU cache
      // keeps them alive so remounted components render instantly.
    };
  }, [url, isActive, cache]);

  return { src, loading, error };
}
