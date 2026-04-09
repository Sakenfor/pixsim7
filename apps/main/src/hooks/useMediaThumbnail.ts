import { useCallback, useEffect, useRef, useState } from 'react';

import { authService } from '@lib/auth';
import { createBlobCache } from '@lib/media/blobCache';
import { resolveBackendUrl } from '@lib/media/backendUrl';

import { useMediaSettingsStore } from '@features/assets';
import { assetEvents, useAssetViewerStore } from '@features/assets';

import { BACKEND_BASE } from '../lib/api/client';


// ── Module-level blob URL cache ─────────────────────────────────────────
const _blobCache = createBlobCache('useMediaThumbnail:blobCache', 200);


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

// ── Constants ────────────────────────────────────────────────────────────
const MAX_RETRIES = 6;
const RETRY_DELAY_MS = 5000;
const REGEN_RETRY_DELAY_MS = 2000;
const FETCH_TIMEOUT_MS = 15_000;
const EXHAUSTION_RETRY_MS = 30_000;

const NON_IMAGE_RE = /\.(mp4|webm|mov|m4v|mkv|avi|mp3|wav|ogg|m4a|aac|flac)(?:$|[?#])/;

function isNonImageMediaUrl(url: string): boolean {
  const lowered = url.toLowerCase();
  if (lowered.startsWith('data:video') || lowered.startsWith('data:audio')) return true;
  return NON_IMAGE_RE.test(lowered);
}

/**
 * Hook to load and manage media thumbnails/previews with authentication support.
 *
 * Features:
 * - Handles blob URL creation for authenticated backend endpoints
 * - Smart fallback: preview → thumbnail → remote_url
 * - Optionally converts external URLs to blob URLs to prevent disk caching
 * - Auto-retries on 404 (CDN propagation) and 202 (thumbnail regeneration)
 * - Delayed auto-retry after exhaustion + network recovery listener
 * - Manual retry function for failed thumbnails
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
  const globalPreventDiskCache = useMediaSettingsStore((s) => s.preventDiskCache);
  const galleryQualityMode = useAssetViewerStore((s) => s.settings.qualityMode);
  const preferOriginal = useAssetViewerStore((s) => s.settings.preferOriginal);

  const preventDiskCache = options?.preventDiskCache ?? globalPreventDiskCache;

  // Determine if we should prefer preview based on options or global setting
  const shouldPreferPreview = options?.preferPreview ??
    (galleryQualityMode === 'preview' || galleryQualityMode === 'auto');

  // Select URL with fallback chain:
  // - If preferOriginal is enabled, use remoteUrl directly (skips derivatives)
  // - Otherwise: preview (if preferred) → thumbnail → preview (fallback)
  const selectedUrl = preferOriginal && remoteUrl
    ? remoteUrl
    : shouldPreferPreview && previewUrl
      ? previewUrl
      : (thumbUrl || previewUrl);

  const retryCountRef = useRef(0);
  const exhaustionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Manual retry function
  const retry = useCallback(() => {
    if (exhaustionTimerRef.current) {
      clearTimeout(exhaustionTimerRef.current);
      exhaustionTimerRef.current = null;
    }
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

  // Auto-retry on network recovery
  useEffect(() => {
    if (!failed) return;
    const handleOnline = () => retry();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [failed, retry]);

  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();
    retryCountRef.current = 0;
    setLoading(true);
    setFailed(false);

    if (!selectedUrl) {
      setThumbSrc(undefined);
      setLoading(false);
      return;
    }

    if (isNonImageMediaUrl(selectedUrl)) {
      setThumbSrc(undefined);
      setLoading(false);
      return;
    }

    // Blob/data URL - use directly (already in memory)
    if (selectedUrl.startsWith('blob:') || selectedUrl.startsWith('data:')) {
      setThumbSrc(selectedUrl);
      setLoading(false);
      return;
    }

    const { fullUrl, isBackend } = resolveBackendUrl(selectedUrl, BACKEND_BASE);

    // Instant hit from blob cache — avoids flash when virtualized cards remount
    const cached = _blobCache.get(fullUrl);
    if (cached) {
      setThumbSrc(cached);
      setLoading(false);
      return;
    }

    // External URL without disk-cache prevention — use directly
    if (!isBackend && !preventDiskCache) {
      setThumbSrc(fullUrl);
      setLoading(false);
      return;
    }

    // Backend path without auth token — use URL directly
    const token = isBackend ? authService.getStoredToken() : null;
    if (isBackend && !token) {
      setThumbSrc(fullUrl);
      setLoading(false);
      return;
    }

    // ── Helpers (close over effect-local state) ──────────────────────────
    const scheduleExhaustionRetry = () => {
      exhaustionTimerRef.current = setTimeout(() => {
        if (!cancelled) { setFailed(false); setRetryTrigger((t) => t + 1); }
      }, EXHAUSTION_RETRY_MS);
    };

    const markFailed = (fallbackSrc?: string) => {
      if (cancelled) return;
      setThumbSrc(fallbackSrc);
      setFailed(true);
      setLoading(false);
      scheduleExhaustionRetry();
    };

    // ── Unified fetch with retry ─────────────────────────────────────────
    const fetchOpts: RequestInit = isBackend
      ? { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.any([abortController.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]) }
      : { mode: 'cors', signal: AbortSignal.any([abortController.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]) };

    const fetchWithRetry = async () => {
      try {
        const res = await fetch(fullUrl, fetchOpts);

        // 202 Accepted — thumbnail regeneration in progress (backend only)
        if (isBackend && res.status === 202) {
          if (retryCountRef.current < MAX_RETRIES) {
            retryCountRef.current++;
            console.log(`[useMediaThumbnail] 202 for ${fullUrl}, regenerating (${retryCountRef.current}/${MAX_RETRIES})...`);
            setTimeout(() => { if (!cancelled) fetchWithRetry(); }, REGEN_RETRY_DELAY_MS);
            return;
          }
          console.warn(`[useMediaThumbnail] Regeneration timed out for ${fullUrl}`);
          markFailed(undefined);
          return;
        }

        // 404 — retry for CDN propagation delays
        if (res.status === 404) {
          if (retryCountRef.current < MAX_RETRIES) {
            retryCountRef.current++;
            console.log(`[useMediaThumbnail] 404 for ${fullUrl}, retrying (${retryCountRef.current}/${MAX_RETRIES})...`);
            setTimeout(() => { if (!cancelled) fetchWithRetry(); }, RETRY_DELAY_MS);
            return;
          }
          console.warn(`[useMediaThumbnail] Failed to fetch ${fullUrl} after ${MAX_RETRIES} retries`);
          if (!cancelled) {
            setThumbSrc(remoteUrl);
            setFailed(!remoteUrl);
            setLoading(false);
            if (!remoteUrl) scheduleExhaustionRetry();
          }
          return;
        }

        // Other non-OK — fall back to remote URL
        if (!res.ok) {
          if (!cancelled) {
            setThumbSrc(remoteUrl || fullUrl);
            setLoading(false);
          }
          return;
        }

        // Success — create blob URL and cache it
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        _blobCache.set(fullUrl, objectUrl);
        if (!cancelled) {
          setThumbSrc(objectUrl);
          setLoading(false);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // TimeoutError falls through to markFailed below
        if (isBackend && remoteUrl) {
          // Backend failure with remote fallback — use remote URL without marking failed
          if (!cancelled) {
            setThumbSrc(remoteUrl);
            setLoading(false);
          }
        } else {
          console.warn(`[useMediaThumbnail] Error fetching ${fullUrl}`);
          markFailed(undefined);
        }
      }
    };
    fetchWithRetry();

    return () => {
      cancelled = true;
      abortController.abort();
      if (exhaustionTimerRef.current) {
        clearTimeout(exhaustionTimerRef.current);
        exhaustionTimerRef.current = null;
      }
      // Blob URLs are NOT revoked here — the module-level LRU cache
      // keeps them alive so remounted cards render instantly.
    };
  }, [selectedUrl, preventDiskCache, remoteUrl, retryTrigger]);

  return { src: thumbSrc, failed, loading, retry };
}

/**
 * Simplified wrapper that returns only the resolved src URL.
 * @deprecated Use useMediaThumbnailFull for access to failed/loading/retry state.
 */
export function useMediaThumbnail(
  thumbUrl?: string,
  previewUrl?: string,
  remoteUrl?: string,
  options?: UseMediaThumbnailOptions
): string | undefined {
  return useMediaThumbnailFull(thumbUrl, previewUrl, remoteUrl, options).src;
}
