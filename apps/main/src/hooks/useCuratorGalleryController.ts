import { useMemo, useState, useCallback } from 'react';
import { useAssets, type AssetFilters, type AssetSummary } from './useAssets';

export interface CuratorFilters extends AssetFilters {}

export type CuratorViewMode = 'grid' | 'list' | 'compact';

export interface CuratorGalleryController {
  assets: AssetSummary[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;

  filters: CuratorFilters;
  setFilters: (updater: (prev: CuratorFilters) => CuratorFilters) => void;

  viewMode: CuratorViewMode;
  setViewMode: (mode: CuratorViewMode) => void;

  selectedAssetIds: Set<string>;
  selectedAssets: AssetSummary[];
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

  const { items, loadMore, loading, error, hasMore } = useAssets({ filters });

  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<CuratorViewMode>('grid');
  const [collections, setCollections] = useState<Map<string, Set<string>>>(new Map());

  const selectedAssets = useMemo(() => {
    return items.filter(a => selectedAssetIds.has(String(a.id)));
  }, [items, selectedAssetIds]);

  const setFilters = useCallback((updater: (prev: CuratorFilters) => CuratorFilters) => {
    setFiltersState(prev => updater(prev));
  }, []);

  const toggleAssetSelection = useCallback((assetId: string | number) => {
    const idStr = String(assetId);
    setSelectedAssetIds(prev => {
      const next = new Set(prev);
      if (next.has(idStr)) {
        next.delete(idStr);
      } else {
        next.add(idStr);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedAssetIds(new Set(items.map(a => String(a.id))));
  }, [items]);

  const clearSelection = useCallback(() => {
    setSelectedAssetIds(new Set());
  }, []);

  const addCollection = useCallback((name: string | null) => {
    if (!name || selectedAssetIds.size === 0) return;
    setCollections(prev => {
      const next = new Map(prev);
      next.set(name, new Set(selectedAssetIds));
      return next;
    });
    setSelectedAssetIds(new Set());
  }, [selectedAssetIds]);

  return {
    assets: items,
    loading,
    error,
    hasMore,
    loadMore,
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

