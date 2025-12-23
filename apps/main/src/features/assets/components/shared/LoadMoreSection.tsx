/**
 * LoadMoreSection Component
 *
 * Reusable pagination/infinite scroll component for gallery surfaces.
 * Supports button-based and infinite scroll modes.
 */

import { useRef, useEffect, type RefObject } from 'react';

export interface LoadMoreSectionProps {
  /** Whether there are more items to load */
  hasMore: boolean;
  /** Whether currently loading */
  loading: boolean;
  /** Callback to load more items */
  onLoadMore: () => void;
  /** Number of items currently loaded (for "no more" message) */
  itemCount?: number;
  /** Mode: 'button' shows a button, 'infinite' uses IntersectionObserver */
  mode?: 'button' | 'infinite';
  /** Root margin for infinite scroll intersection (default: '200px') */
  rootMargin?: string;
  /** Additional className */
  className?: string;
}

/**
 * LoadMoreSection with button or infinite scroll
 */
export function LoadMoreSection({
  hasMore,
  loading,
  onLoadMore,
  itemCount = 0,
  mode = 'button',
  rootMargin = '200px',
  className = '',
}: LoadMoreSectionProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll observer
  useEffect(() => {
    if (mode !== 'infinite') return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !loading) {
          onLoadMore();
        }
      },
      { rootMargin, threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [mode, hasMore, loading, onLoadMore, rootMargin]);

  return (
    <div className={`pt-4 pb-8 flex justify-center ${className}`}>
      {hasMore && mode === 'button' && (
        <button
          disabled={loading}
          onClick={onLoadMore}
          className="px-4 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Loading...' : 'Load More'}
        </button>
      )}

      {hasMore && mode === 'infinite' && (
        <div ref={sentinelRef} className="text-sm text-neutral-500">
          {loading ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span>Loading more assets...</span>
            </div>
          ) : (
            <span className="text-neutral-400">Scroll for more</span>
          )}
        </div>
      )}

      {!hasMore && itemCount > 0 && (
        <div className="text-sm text-neutral-500">No more assets</div>
      )}
    </div>
  );
}

/**
 * Hook for infinite scroll with external sentinel ref
 * Use when you need more control over sentinel placement.
 */
export function useInfiniteScroll(options: {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  rootMargin?: string;
}): RefObject<HTMLDivElement> {
  const { hasMore, loading, onLoadMore, rootMargin = '200px' } = options;
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !loading) {
          onLoadMore();
        }
      },
      { rootMargin, threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore, rootMargin]);

  return sentinelRef;
}
