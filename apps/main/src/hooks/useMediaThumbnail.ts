import { useEffect, useRef, useState } from 'react';
import { BACKEND_BASE } from '../lib/api/client';

/**
 * Hook to load and manage media thumbnails with authentication support
 * Handles blob URL creation for authenticated endpoints
 */
export function useMediaThumbnail(thumbUrl?: string) {
  const [thumbSrc, setThumbSrc] = useState<string | undefined>(undefined);
  const objectUrlRef = useRef<string | null>(null);

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

    // Public absolute URL or blob URL - use directly
    if (
      thumbUrl.startsWith('http://') ||
      thumbUrl.startsWith('https://') ||
      thumbUrl.startsWith('blob:')
    ) {
      setThumbSrc(thumbUrl);
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
  }, [thumbUrl]);

  return thumbSrc;
}
