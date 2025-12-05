import { useEffect, useRef } from 'react';

/**
 * Options for the useLazyPreview hook.
 */
export interface UseLazyPreviewOptions {
  /**
   * Root margin for IntersectionObserver. Positive values trigger loading
   * before the element enters viewport. Default: '400px'
   */
  rootMargin?: string;

  /**
   * If true, show a spinner while loading. When false (silent refresh),
   * the current preview remains visible during reload.
   * Default: false (silent refresh behavior)
   */
  showSpinner?: boolean;

  /**
   * If true, the hook is disabled and won't observe the element.
   * Useful for conditional lazy loading.
   * Default: false
   */
  disabled?: boolean;
}

/**
 * Hook to lazy-load previews when an element enters the viewport.
 *
 * Uses IntersectionObserver to detect when an element is about to become
 * visible and triggers a load function. Once loaded, the observer disconnects.
 *
 * Features:
 * - Configurable root margin for early loading (default 400px)
 * - Guards against duplicate loads while a request is in flight
 * - Does NOT revoke/unload on scroll out - keeps previews stable once loaded
 * - Cleanup only happens on unmount (revocation handled by caller)
 *
 * @example
 * ```tsx
 * function LazyCard({ asset, previewUrl, loadPreview }) {
 *   const ref = useLazyPreview({
 *     hasPreview: !!previewUrl,
 *     loadPreview: () => loadPreview(asset),
 *   });
 *
 *   return (
 *     <div ref={ref}>
 *       {previewUrl ? <img src={previewUrl} /> : <Spinner />}
 *     </div>
 *   );
 * }
 * ```
 *
 * @param hasPreview - Whether the preview is already loaded
 * @param loadPreview - Async function to load the preview
 * @param options - Configuration options
 * @returns A ref to attach to the element to observe
 */
export function useLazyPreview(
  hasPreview: boolean,
  loadPreview: () => Promise<void>,
  options: UseLazyPreviewOptions = {}
): React.RefObject<HTMLDivElement | null> {
  const { rootMargin = '400px', disabled = false } = options;

  const ref = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;

    // Already have preview or already loading - skip
    if (hasPreview || loadingRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasPreview && !loadingRef.current) {
            loadingRef.current = true;
            loadPreview().finally(() => {
              loadingRef.current = false;
            });
            observer.disconnect();
          }
        });
      },
      { rootMargin }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [hasPreview, loadPreview, rootMargin, disabled]);

  return ref;
}

/**
 * Hook to lazy-load previews for multiple assets efficiently.
 *
 * This is a convenience wrapper for use cases where you have a collection
 * of assets and want to manage lazy loading for all of them with a single
 * IntersectionObserver instance.
 *
 * @param options - Configuration options shared across all observed elements
 * @returns An object with methods to register and unregister elements
 */
export function useLazyPreviewManager(options: UseLazyPreviewOptions = {}) {
  const { rootMargin = '400px' } = options;

  const observerRef = useRef<IntersectionObserver | null>(null);
  const callbacksRef = useRef<Map<Element, () => Promise<void>>>(new Map());
  const loadingRef = useRef<Set<Element>>(new Set());

  // Initialize observer lazily
  const getObserver = () => {
    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const el = entry.target;
              const callback = callbacksRef.current.get(el);
              if (callback && !loadingRef.current.has(el)) {
                loadingRef.current.add(el);
                callback().finally(() => {
                  loadingRef.current.delete(el);
                  callbacksRef.current.delete(el);
                  observerRef.current?.unobserve(el);
                });
              }
            }
          });
        },
        { rootMargin }
      );
    }
    return observerRef.current;
  };

  const observe = (el: Element, loadPreview: () => Promise<void>) => {
    callbacksRef.current.set(el, loadPreview);
    getObserver().observe(el);
  };

  const unobserve = (el: Element) => {
    callbacksRef.current.delete(el);
    loadingRef.current.delete(el);
    observerRef.current?.unobserve(el);
  };

  const disconnect = () => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    callbacksRef.current.clear();
    loadingRef.current.clear();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return { observe, unobserve, disconnect };
}
