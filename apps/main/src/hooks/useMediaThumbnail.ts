import { useEffect, useRef, useState } from 'react';
import { BACKEND_BASE } from '../lib/api/client';
import { useMediaSettingsStore } from '../stores/mediaSettingsStore';

export interface UseMediaThumbnailOptions {
  /**
   * When true, fetches external URLs and converts to blob URLs to prevent
   * browser disk caching. Default: false (uses global setting)
   */
  preventDiskCache?: boolean;
}

/**
 * Hook to load and manage media thumbnails with authentication support.
 *
 * Features:
 * - Handles blob URL creation for authenticated backend endpoints
 * - Optionally converts external URLs to blob URLs to prevent disk caching
 * - Properly cleans up blob URLs on unmount
 *
 * @param thumbUrl - The thumbnail URL (can be external, backend-relative, or blob)
 * @param options - Optional settings for cache behavior
 */
export function useMediaThumbnail(
  thumbUrl?: string,
  options?: UseMediaThumbnailOptions
) {
  const [thumbSrc, setThumbSrc] = useState<string | undefined>(undefined);
  const objectUrlRef = useRef<string | null>(null);
  const globalPreventDiskCache = useMediaSettingsStore((s) => s.preventDiskCache);

  const preventDiskCache = options?.preventDiskCache ?? globalPreventDiskCache;

  useEffect(() => {
    let cancelled = false;

    // Cleanup any previous object URL
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    if (!thumbUrl) {
      setThumbSrc(undefined);
      return;
    }

    // Blob URL - use directly (already in memory)
    if (thumbUrl.startsWith('blob:')) {
      setThumbSrc(thumbUrl);
      return;
    }

    // External http/https URL
    if (thumbUrl.startsWith('http://') || thumbUrl.startsWith('https://')) {
      if (preventDiskCache) {
        // Fetch and convert to blob URL to prevent Chrome disk cache
        (async () => {
          try {
            const res = await fetch(thumbUrl, { mode: 'cors' });
            if (!res.ok) {
              if (!cancelled) setThumbSrc(thumbUrl);
              return;
            }
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            objectUrlRef.current = objectUrl;
            if (!cancelled) {
              setThumbSrc(objectUrl);
            } else {
              URL.revokeObjectURL(objectUrl);
            }
          } catch {
            // CORS or network error - fall back to direct URL
            if (!cancelled) setThumbSrc(thumbUrl);
          }
        })();
      } else {
        // Use URL directly (Chrome will cache on disk)
        setThumbSrc(thumbUrl);
      }
      return;
    }

    // Backend-relative path - construct full URL
    const fullUrl = thumbUrl.startsWith('/')
      ? `${BACKEND_BASE}${thumbUrl}`
      : `${BACKEND_BASE}/${thumbUrl}`;

    const token = localStorage.getItem('access_token');

    // If no token, fall back to using the URL directly
    if (!token) {
      setThumbSrc(fullUrl);
      return;
    }

    // Fetch with authorization and create blob URL
    (async () => {
      try {
        const res = await fetch(fullUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setThumbSrc(fullUrl);
          return;
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        if (!cancelled) {
          setThumbSrc(objectUrl);
        } else {
          URL.revokeObjectURL(objectUrl);
        }
      } catch {
        if (!cancelled) {
          setThumbSrc(fullUrl);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [thumbUrl, preventDiskCache]);

  return thumbSrc;
}
