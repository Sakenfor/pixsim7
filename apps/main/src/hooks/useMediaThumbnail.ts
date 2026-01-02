import { useCallback, useEffect, useRef, useState } from 'react';
import { BACKEND_BASE } from '../lib/api/client';
import { useMediaSettingsStore } from '@features/assets';
import { assetEvents, useAssetViewerStore } from '@features/assets';
import { authService } from '@lib/auth/authService';

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

export interface UseMediaThumbnailResult {
  /** The resolved thumbnail source URL (blob or direct) */
  src: string | undefined;
  /** Whether the thumbnail failed to load after all retries */
  failed: boolean;
  /** Whether currently loading/retrying */
  loading: boolean;
  /** Manually retry fetching the thumbnail */
  retry: () => void;
}

/**
 * Hook to load and manage media thumbnails/previews with authentication support.
 *
 * Features:
 * - Handles blob URL creation for authenticated backend endpoints
 * - Smart fallback: preview → thumbnail → remote_url
 * - Optionally converts external URLs to blob URLs to prevent disk caching
 * - Properly cleans up blob URLs on unmount
 * - Auto-retries on 404 (CDN propagation delays)
 * - Manual retry function for failed thumbnails
 *
 * @param thumbUrl - The thumbnail URL
 * @param previewUrl - Optional higher-quality preview URL
 * @param remoteUrl - Optional provider's remote URL as final fallback
 * @param options - Optional settings for cache behavior and quality
 * @returns Object with src, failed state, loading state, and retry function
 *
 * @example
 * // Basic usage (backwards compatible)
 * const src = useMediaThumbnail(thumbUrl, previewUrl, remoteUrl);
 *
 * @example
 * // Full usage with retry
 * const { src, failed, loading, retry } = useMediaThumbnailFull(thumbUrl, previewUrl, remoteUrl);
 * if (failed) return <button onClick={retry}>Retry</button>;
 */
export function useMediaThumbnail(
  thumbUrl?: string,
  previewUrl?: string,
  remoteUrl?: string,
  options?: UseMediaThumbnailOptions
): string | undefined {
  const result = useMediaThumbnailFull(thumbUrl, previewUrl, remoteUrl, options);
  return result.src;
}

/**
 * Full version of useMediaThumbnail that returns loading/failed state and retry function.
 */
export function useMediaThumbnailFull(
  thumbUrl?: string,
  previewUrl?: string,
  remoteUrl?: string,
  options?: UseMediaThumbnailOptions
): UseMediaThumbnailResult {
  const [thumbSrc, setThumbSrc] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const objectUrlRef = useRef<string | null>(null);
  const globalPreventDiskCache = useMediaSettingsStore((s) => s.preventDiskCache);
  const galleryQualityMode = useAssetViewerStore((s) => s.settings.qualityMode);

  const preventDiskCache = options?.preventDiskCache ?? globalPreventDiskCache;

  // Determine if we should prefer preview based on options or global setting
  const shouldPreferPreview = options?.preferPreview ??
    (galleryQualityMode === 'preview' || galleryQualityMode === 'auto');

  // Select URL with fallback chain: preview (if preferred) → thumbnail → preview (fallback)
  const selectedUrl = shouldPreferPreview && previewUrl
    ? previewUrl
    : (thumbUrl || previewUrl);

  // Retry state for CDN propagation delays
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 6;
  const RETRY_DELAY_MS = 5000; // 5 seconds between retries, total 30 seconds

  // Manual retry function
  const retry = useCallback(() => {
    setFailed(false);
    setRetryTrigger((t) => t + 1);
  }, []);

  // Listen for global retry-all event
  useEffect(() => {
    return assetEvents.subscribeToRetry(() => {
      if (failed) {
        retry();
      }
    });
  }, [failed, retry]);

  useEffect(() => {
    let cancelled = false;
    retryCountRef.current = 0;
    setLoading(true);
    setFailed(false);

    // Cleanup any previous object URL
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    if (!selectedUrl) {
      setThumbSrc(undefined);
      setLoading(false);
      return;
    }

    // Blob URL - use directly (already in memory)
    if (selectedUrl.startsWith('blob:')) {
      setThumbSrc(selectedUrl);
      setLoading(false);
      return;
    }

    // External http/https URL
    if (selectedUrl.startsWith('http://') || selectedUrl.startsWith('https://')) {
      if (preventDiskCache) {
        // Fetch and convert to blob URL to prevent Chrome disk cache
        const fetchWithRetry = async () => {
          try {
            const res = await fetch(selectedUrl, { mode: 'cors' });
            if (!res.ok) {
              // Retry on 404 (CDN propagation delay)
              if (res.status === 404 && retryCountRef.current < MAX_RETRIES) {
                retryCountRef.current++;
                console.log(`[useMediaThumbnail] 404 for ${selectedUrl}, retrying (${retryCountRef.current}/${MAX_RETRIES})...`);
                setTimeout(() => {
                  if (!cancelled) fetchWithRetry();
                }, RETRY_DELAY_MS);
                return;
              }
              // All retries exhausted or non-404 error
              if (!cancelled) {
                console.warn(`[useMediaThumbnail] Failed to fetch ${selectedUrl} after ${retryCountRef.current} retries`);
                setThumbSrc(undefined);
                setFailed(true);
                setLoading(false);
              }
              return;
            }
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            objectUrlRef.current = objectUrl;
            if (!cancelled) {
              setThumbSrc(objectUrl);
              setLoading(false);
            } else {
              URL.revokeObjectURL(objectUrl);
            }
          } catch {
            // CORS or network error
            if (!cancelled) {
              console.warn(`[useMediaThumbnail] Network error for ${selectedUrl}`);
              setThumbSrc(undefined);
              setFailed(true);
              setLoading(false);
            }
          }
        };
        fetchWithRetry();
      } else {
        // Use URL directly (Chrome will cache on disk)
        setThumbSrc(selectedUrl);
        setLoading(false);
      }
      return;
    }

    // Backend-relative path - construct full URL
    const fullUrl = selectedUrl.startsWith('/')
      ? `${BACKEND_BASE}${selectedUrl}`
      : `${BACKEND_BASE}/${selectedUrl}`;

    const token = authService.getStoredToken();

    // If no token, fall back to using the URL directly
    if (!token) {
      setThumbSrc(fullUrl);
      setLoading(false);
      return;
    }

    // Fetch with authorization and create blob URL
    (async () => {
      try {
        const res = await fetch(fullUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          // Fall back to remote URL if backend thumbnail is unavailable
          if (!cancelled) {
            setThumbSrc(remoteUrl || fullUrl);
            setLoading(false);
          }
          return;
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        if (!cancelled) {
          setThumbSrc(objectUrl);
          setLoading(false);
        } else {
          URL.revokeObjectURL(objectUrl);
        }
      } catch {
        if (!cancelled) {
          // Fall back to remote URL on error
          setThumbSrc(remoteUrl || fullUrl);
          setLoading(false);
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
  }, [selectedUrl, preventDiskCache, remoteUrl, retryTrigger]);

  return { src: thumbSrc, failed, loading, retry };
}
