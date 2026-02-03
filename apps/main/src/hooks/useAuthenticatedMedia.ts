/**
 * useAuthenticatedMedia
 *
 * Hook to load media URLs that require authentication.
 * Fetches with Authorization header and converts to blob URL for use in img/video src.
 */

import { useEffect, useRef, useState } from 'react';

import { authService } from '@lib/auth';
import { resolveBackendUrl } from '@lib/media/backendUrl';

import { BACKEND_BASE } from '../lib/api/client';

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
  const objectUrlRef = useRef<string | null>(null);
  const isActive = options.active ?? true;

  useEffect(() => {
    let cancelled = false;

    // Cleanup previous blob URL
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

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
            // Still try the URL directly as fallback
            setSrc(fullUrl);
          }
          return;
        }

        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;

        if (!cancelled) {
          setSrc(objectUrl);
          setLoading(false);
        } else {
          URL.revokeObjectURL(objectUrl);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn(`[useAuthenticatedMedia] Error fetching ${fullUrl}:`, err);
          setError(true);
          setLoading(false);
          // Fallback to direct URL
          setSrc(fullUrl);
        }
      }
    };

    fetchMedia();

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [url, isActive]);

  return { src, loading, error };
}
