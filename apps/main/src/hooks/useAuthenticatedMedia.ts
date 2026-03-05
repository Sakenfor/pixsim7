/**
 * useAuthenticatedMedia
 *
 * Hook to load media URLs that require authentication.
 * Fetches with Authorization header and converts to blob URL for use in img/video src.
 */

import { useEffect, useState } from 'react';

import { authService } from '@lib/auth';
import { resolveBackendUrl } from '@lib/media/backendUrl';
import { hmrSingleton } from '@lib/utils';

import { BACKEND_BASE } from '../lib/api/client';

// ── Module-level blob URL cache ─────────────────────────────────────────
// Keeps authenticated blob URLs alive across HMR unmount/remount cycles
// so media renders instantly when components remount.
// LRU eviction revokes the oldest URLs to cap memory.
const AUTH_BLOB_CACHE_MAX = 100;
const _authBlobCache = hmrSingleton('useAuthenticatedMedia:blobCache', () => new Map<string, string>());

function clearAuthBlobCache(): void {
  for (const blobUrl of _authBlobCache.values()) {
    URL.revokeObjectURL(blobUrl);
  }
  _authBlobCache.clear();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    clearAuthBlobCache();
  });
}

function getCachedAuthBlob(fetchUrl: string): string | undefined {
  const blobUrl = _authBlobCache.get(fetchUrl);
  if (blobUrl !== undefined) {
    // Move to end (most recently used)
    _authBlobCache.delete(fetchUrl);
    _authBlobCache.set(fetchUrl, blobUrl);
  }
  return blobUrl;
}

function setCachedAuthBlob(fetchUrl: string, blobUrl: string): void {
  const existing = _authBlobCache.get(fetchUrl);
  if (existing && existing !== blobUrl) URL.revokeObjectURL(existing);
  _authBlobCache.delete(fetchUrl);
  _authBlobCache.set(fetchUrl, blobUrl);
  while (_authBlobCache.size > AUTH_BLOB_CACHE_MAX) {
    const first = _authBlobCache.keys().next().value;
    if (first === undefined) break;
    const old = _authBlobCache.get(first);
    _authBlobCache.delete(first);
    if (old) URL.revokeObjectURL(old);
  }
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
}

export function useAuthenticatedMedia(
  url: string | undefined,
  options: UseAuthenticatedMediaOptions = {},
): UseAuthenticatedMediaResult {
  const [src, setSrc] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const isActive = options.active ?? true;

  useEffect(() => {
    let cancelled = false;

    if (!url || !isActive) {
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
      setSrc(fullUrl);
      setLoading(false);
      setError(false);
      return;
    }

    // Backend path - needs authentication

    const token = authService.getStoredToken();

    // No token - try the URL directly (might work for public endpoints)
    if (!token) {
      setSrc(fullUrl);
      setLoading(false);
      setError(false);
      return;
    }

    // Check module-level cache first
    const cached = getCachedAuthBlob(fullUrl);
    if (cached) {
      setSrc(cached);
      setLoading(false);
      setError(false);
      return;
    }

    // Fetch with authentication
    setLoading(true);
    setError(false);

    const fetchMedia = async () => {
      try {
        const res = await fetch(fullUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          if (!cancelled) {
            console.warn(`[useAuthenticatedMedia] Failed to fetch ${fullUrl}: ${res.status}`);
            setError(true);
            setLoading(false);
            setSrc(fullUrl);
          }
          return;
        }

        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        setCachedAuthBlob(fullUrl, objectUrl);

        if (!cancelled) {
          setSrc(objectUrl);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn(`[useAuthenticatedMedia] Error fetching ${fullUrl}:`, err);
          setError(true);
          setLoading(false);
          setSrc(fullUrl);
        }
      }
    };

    fetchMedia();

    return () => {
      cancelled = true;
      // Blob URLs are NOT revoked here — the module-level LRU cache
      // keeps them alive so remounted components render instantly.
    };
  }, [url, isActive]);

  return { src, loading, error };
}
