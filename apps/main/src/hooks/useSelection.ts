/**
 * useSelection Hook
 *
 * Shared selection state management for multi-select galleries and lists.
 * Provides toggle, clear, and select-all functionality with Set-based storage.
 *
 * Used by: useAssetsController, useGallerySurfaceController, useCuratorGalleryController
 */

import { useState, useCallback } from 'react';

export interface UseSelectionOptions {
  /** Whether selection is enabled (default: true) */
  enableSelection?: boolean;
}

export interface UseSelectionResult {
  /** Set of selected item IDs (as strings) */
  selectedIds: Set<string>;
  /** Toggle selection for an item */
  toggleSelection: (id: string | number) => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Select all items from a list */
  selectAll: (items: Array<{ id: string | number }>) => void;
  /** Check if an item is selected */
  isSelected: (id: string | number) => boolean;
}

/**
 * Hook for managing multi-select state
 *
 * @example
 * ```tsx
 * const { selectedIds, toggleSelection, clearSelection } = useSelection();
 *
 * <MediaCard
 *   selected={selectedIds.has(String(asset.id))}
 *   onSelect={() => toggleSelection(asset.id)}
 * />
 * ```
 */
export function useSelection(options: UseSelectionOptions = {}): UseSelectionResult {
  const { enableSelection = true } = options;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelection = useCallback(
    (id: string | number) => {
      if (!enableSelection) return;

      const idStr = String(id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(idStr)) {
          next.delete(idStr);
        } else {
          next.add(idStr);
        }
        return next;
      });
    },
    [enableSelection]
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectAll = useCallback((items: Array<{ id: string | number }>) => {
    setSelectedIds(new Set(items.map((item) => String(item.id))));
  }, []);

  const isSelected = useCallback(
    (id: string | number) => {
      return selectedIds.has(String(id));
    },
    [selectedIds]
  );

  return {
    selectedIds,
    toggleSelection,
    clearSelection,
    selectAll,
    isSelected,
  };
}
