/**
 * useViewer Hook
 *
 * Shared viewer state management for asset/media viewers.
 * Provides open/close/navigate functionality for lightbox-style viewers.
 *
 * Used by: useAssetsController, useLocalFoldersController
 */

import { useState, useCallback } from 'react';

export interface UseViewerOptions<T> {
  /** List of items that can be navigated */
  items: T[];
  /** Optional function to extract unique key from item (defaults to item.id) */
  getKey?: (item: T) => string | number;
  /** Optional callback when viewer opens */
  onOpen?: (item: T) => void | Promise<void>;
  /** Optional callback when viewer closes */
  onClose?: () => void | Promise<void>;
}

export interface UseViewerResult<T> {
  /** Currently viewed item (null if closed) */
  viewerItem: T | null;
  /** Open viewer with specific item */
  openViewer: (item: T) => Promise<void>;
  /** Close viewer */
  closeViewer: () => Promise<void>;
  /** Navigate to previous/next item in list */
  navigateViewer: (direction: 'prev' | 'next') => void;
}

/**
 * Hook for managing viewer state with navigation
 *
 * @example
 * ```tsx
 * const { viewerItem, openViewer, closeViewer, navigateViewer } = useViewer({
 *   items: assets,
 *   onOpen: async (asset) => {
 *     // Load full-res version
 *   },
 *   onClose: () => {
 *     // Cleanup
 *   },
 * });
 *
 * {viewerItem && (
 *   <Viewer
 *     asset={viewerItem}
 *     onClose={closeViewer}
 *     onPrev={() => navigateViewer('prev')}
 *     onNext={() => navigateViewer('next')}
 *   />
 * )}
 * ```
 */
export function useViewer<T extends { id: string | number }>(
  options: UseViewerOptions<T>
): UseViewerResult<T> {
  const { items, getKey, onOpen, onClose } = options;
  const [viewerItem, setViewerItem] = useState<T | null>(null);

  const openViewer = useCallback(
    async (item: T) => {
      await onOpen?.(item);
      setViewerItem(item);
    },
    [onOpen]
  );

  const closeViewer = useCallback(async () => {
    await onClose?.();
    setViewerItem(null);
  }, [onClose]);

  const navigateViewer = useCallback(
    (direction: 'prev' | 'next') => {
      if (!viewerItem) return;

      // Get key function (default to item.id)
      const keyFn = getKey || ((item: T) => item.id);
      const currentKey = keyFn(viewerItem);

      // Find current index
      const currentIndex = items.findIndex((item) => keyFn(item) === currentKey);
      if (currentIndex === -1) return;

      // Calculate next index
      const nextIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;

      // Check bounds
      if (nextIndex < 0 || nextIndex >= items.length) return;

      // Navigate to next item
      const nextItem = items[nextIndex];
      onOpen?.(nextItem);
      setViewerItem(nextItem);
    },
    [viewerItem, items, getKey, onOpen]
  );

  return {
    viewerItem,
    openViewer,
    closeViewer,
    navigateViewer,
  };
}
