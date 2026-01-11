import { useMemo, useState, useCallback } from 'react';

import { useAssets, type AssetFilters, type AssetModel } from '@features/assets';

import { useSelection } from '@/hooks/useSelection';

export interface CuratorFilters extends AssetFilters {}

export type CuratorViewMode = 'grid' | 'list' | 'compact';

export interface CuratorGalleryController {
  assets: AssetModel[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;

  filters: CuratorFilters;
  setFilters: (updater: (prev: CuratorFilters) => CuratorFilters) => void;

  viewMode: CuratorViewMode;
  setViewMode: (mode: CuratorViewMode) => void;

  selectedAssetIds: Set<string>;
  selectedAssets: AssetModel[];
  toggleAssetSelection: (assetId: string | number) => void;
  selectAll: () => void;
  clearSelection: () => void;

  collections: Map<string, Set<string>>;
  addCollection: (name: string | null) => void;
}

/**
 * Hook: useCuratorGalleryController
 *
 * Centralizes state and logic for CuratorGallerySurface:
 * - Filters and data loading (via useAssets)
 * - View mode
 * - Selection and collections
 */
export function useCuratorGalleryController(): CuratorGalleryController {
  const [filters, setFiltersState] = useState<CuratorFilters>({
    q: '',
    tag: undefined,
    provider_id: undefined,
    sort: 'new',
    media_type: undefined,
  });

  const { items, loadMore, loading, error, hasMore, reset } = useAssets({ filters });

  // Selection state
  const { selectedIds: selectedAssetIds, toggleSelection: toggleAssetSelection, clearSelection, selectAll: selectAllBase } = useSelection();

  const [viewMode, setViewMode] = useState<CuratorViewMode>('grid');
  const [collections, setCollections] = useState<Map<string, Set<string>>>(new Map());

  const selectedAssets = useMemo(() => {
    return items.filter(a => selectedAssetIds.has(String(a.id)));
  }, [items, selectedAssetIds]);

  const setFilters = useCallback((updater: (prev: CuratorFilters) => CuratorFilters) => {
    setFiltersState(prev => updater(prev));
  }, []);

  const refresh = useCallback(() => {
    reset();
  }, [reset]);

  // Wrap selectAll to pass items
  const selectAll = useCallback(() => {
    selectAllBase(items);
  }, [items, selectAllBase]);

  const addCollection = useCallback((name: string | null) => {
    if (!name || selectedAssetIds.size === 0) return;
    setCollections(prev => {
      const next = new Map(prev);
      next.set(name, new Set(selectedAssetIds));
      return next;
    });
    clearSelection();
  }, [selectedAssetIds, clearSelection]);

  return {
    assets: items,
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
    filters,
    setFilters,
    viewMode,
    setViewMode,
    selectedAssetIds,
    selectedAssets,
    toggleAssetSelection,
    selectAll,
    clearSelection,
    collections,
    addCollection,
  };
}
