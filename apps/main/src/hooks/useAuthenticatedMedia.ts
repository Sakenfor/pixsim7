/**
 * useAuthenticatedMedia
 *
 * Hook to load media URLs that require authentication.
 * Fetches with Authorization header and converts to blob URL for use in img/video src.
 */

import { useEffect, useRef, useState } from 'react';

import { authService } from '@lib/auth';

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
export function useAuthenticatedMedia(url: string | undefined): UseAuthenticatedMediaResult {
  const [src, setSrc] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Cleanup previous blob URL
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    if (!url) {
      setSrc(undefined);
      setLoading(false);
      setError(false);
      return;
    }

    // Blob URLs - use directly
    if (url.startsWith('blob:')) {
      setSrc(url);
      setLoading(false);
      setError(false);
      return;
    }

    // External URLs - use directly (no auth needed)
    if (url.startsWith('http://') || url.startsWith('https://')) {
      setSrc(url);
      setLoading(false);
      setError(false);
      return;
    }

    // Backend-relative path - needs authentication
    const fullUrl = url.startsWith('/')
      ? `${BACKEND_BASE}${url}`
      : `${BACKEND_BASE}/${url}`;

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
  }, [url]);

  return { src, loading, error };
}
