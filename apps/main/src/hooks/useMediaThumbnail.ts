import { useEffect, useRef, useState } from 'react';
import { BACKEND_BASE } from '../lib/api/client';
import { useMediaSettingsStore } from '../stores/mediaSettingsStore';
import { useGallerySettingsStore } from '../stores/gallerySettingsStore';

export interface UseMediaThumbnailOptions {
  /**
   * When true, fetches external URLs and converts to blob URLs to prevent
   * browser disk caching. Default: false (uses global setting)
   */
  preventDiskCache?: boolean;

  /**
   * Prefer preview over thumbnail for better quality.
   * Default: false (uses global gallery quality setting)
   */
  preferPreview?: boolean;
}

/**
 * Hook to load and manage media thumbnails/previews with authentication support.
 *
 * Features:
 * - Handles blob URL creation for authenticated backend endpoints
 * - Smart fallback: preview → thumbnail → remote_url
 * - Optionally converts external URLs to blob URLs to prevent disk caching
 * - Properly cleans up blob URLs on unmount
 *
 * @param thumbUrl - The thumbnail URL
 * @param previewUrl - Optional higher-quality preview URL
 * @param options - Optional settings for cache behavior and quality
 */
export function useMediaThumbnail(
  thumbUrl?: string,
  previewUrl?: string,
  options?: UseMediaThumbnailOptions
) {
  const [thumbSrc, setThumbSrc] = useState<string | undefined>(undefined);
  const objectUrlRef = useRef<string | null>(null);
  const globalPreventDiskCache = useMediaSettingsStore((s) => s.preventDiskCache);
  const galleryQualityMode = useGallerySettingsStore((s) => s.qualityMode);

  const preventDiskCache = options?.preventDiskCache ?? globalPreventDiskCache;

  // Determine if we should prefer preview based on options or global setting
  const shouldPreferPreview = options?.preferPreview ??
    (galleryQualityMode === 'preview' || galleryQualityMode === 'auto');

  // Select URL with fallback chain: preview (if preferred) → thumbnail → preview (fallback)
  const selectedUrl = shouldPreferPreview && previewUrl
    ? previewUrl
    : (thumbUrl || previewUrl);

  useEffect(() => {
    let cancelled = false;

    // Cleanup any previous object URL
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    if (!selectedUrl) {
      setThumbSrc(undefined);
      return;
    }

    // Blob URL - use directly (already in memory)
    if (selectedUrl.startsWith('blob:')) {
      setThumbSrc(selectedUrl);
      return;
    }

    // External http/https URL
    if (selectedUrl.startsWith('http://') || selectedUrl.startsWith('https://')) {
      if (preventDiskCache) {
        // Fetch and convert to blob URL to prevent Chrome disk cache
        (async () => {
          try {
            const res = await fetch(selectedUrl, { mode: 'cors' });
            if (!res.ok) {
              if (!cancelled) setThumbSrc(selectedUrl);
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
            if (!cancelled) setThumbSrc(selectedUrl);
          }
        })();
      } else {
        // Use URL directly (Chrome will cache on disk)
        setThumbSrc(selectedUrl);
      }
      return;
    }

    // Backend-relative path - construct full URL
    const fullUrl = selectedUrl.startsWith('/')
      ? `${BACKEND_BASE}${selectedUrl}`
      : `${BACKEND_BASE}/${selectedUrl}`;

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
      // Clean up blob URL on unmount
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [selectedUrl, preventDiskCache]);

  return thumbSrc;
}
