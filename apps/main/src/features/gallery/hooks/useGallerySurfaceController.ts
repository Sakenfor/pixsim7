import { createAssetActions } from '@pixsim7/shared.assets-core';
import { useState, useCallback, useMemo } from 'react';

import { useAssets, useAsset, useAssetDetailStore, type AssetModel, type AssetFilters } from '@features/assets';
import { useMediaGenerationActions } from '@features/generation';

import { useSelection } from '@/hooks/useSelection';

export interface GallerySurfaceConfig {
  /**
   * Surface mode/type
   */
  mode?: 'review' | 'widget' | 'panel' | 'default';

  /**
   * Optional initial filters
   */
  filters?: AssetFilters;

  /**
   * Maximum number of items to display (for widgets/panels)
   */
  limit?: number;

  /**
   * Enable selection state for multi-select
   */
  enableSelection?: boolean;

  /**
   * Auto-load data on mount
   */
  autoLoad?: boolean;
}

/**
 * Hook: useGallerySurfaceController
 *
 * Reusable controller for gallery-like surfaces that need asset data and generation actions.
 * Provides a lightweight alternative to useAssetsController for components that don't need
 * full route-level features (URL sync, scope tabs, viewer, etc.).
 *
 * Use cases:
 * - ReviewGallerySurface: review mode with accept/reject
 * - GalleryGridWidget: widget mode with limited items
 * - Other gallery panels and surfaces
 */
export function useGallerySurfaceController(config: GallerySurfaceConfig = {}) {
  const {
    mode = 'default',
    filters: initialFilters = {},
    limit,
    enableSelection = false,
    autoLoad = true,
  } = config;

  // Filters state (can be updated by surface)
  const [filters, setFilters] = useState<AssetFilters>(initialFilters);

  // Detail panel state (shared via store)
  const detailAssetId = useAssetDetailStore((s) => s.detailAssetId);
  const setDetailAssetId = useAssetDetailStore((s) => s.setDetailAssetId);
  const { asset: detailAsset, loading: detailLoading, error: detailError } = useAsset(detailAssetId);

  // Data loading
  const { items, loadMore, loading, error, hasMore, reset } = useAssets({
    filters,
    limit: autoLoad ? undefined : limit,
  });

  // Apply limit if specified (for widgets/panels)
  const displayItems = useMemo(() => {
    return limit ? items.slice(0, limit) : items;
  }, [items, limit]);

  // Media generation actions
  const {
    queueImageToImage,
    queueImageToVideo,
    queueVideoExtend,
    queueAddToTransition,
    queueAutoGenerate,
    quickGenerate,
  } = useMediaGenerationActions();

  // Selection state
  const { selectedIds: selectedAssetIds, toggleSelection: toggleAssetSelection, clearSelection } = useSelection({
    enableSelection,
  });

  // Get selected assets
  const selectedAssets = useMemo(() => {
    return displayItems.filter((asset) => selectedAssetIds.has(String(asset.id)));
  }, [displayItems, selectedAssetIds]);

  // Asset action handlers
  const actionHandlers = useMemo(() => ({
    onOpenDetails: setDetailAssetId,
    onImageToImage: queueImageToImage,
    onImageToVideo: queueImageToVideo,
    onVideoExtend: queueVideoExtend,
    onAddToTransition: queueAddToTransition,
    onAddToGenerate: queueAutoGenerate,
    onQuickAdd: quickGenerate,
  }), [queueImageToImage, queueImageToVideo, queueVideoExtend, queueAddToTransition, queueAutoGenerate, quickGenerate]);

  // Get per-asset actions
  const getAssetActions = useCallback((asset: AssetModel) => {
    return createAssetActions(asset, actionHandlers);
  }, [actionHandlers]);

  // Update filters
  const updateFilters = useCallback((partial: Partial<AssetFilters>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  }, []);

  return {
    // Config
    mode,

    // Filters
    filters,
    updateFilters,

    // Data
    assets: displayItems,
    allAssets: items,
    loadMore,
    loading,
    error,
    hasMore,
    reset,

    // Selection (if enabled)
    selectedAssetIds,
    selectedAssets,
    toggleAssetSelection,
    clearSelection,

    // Detail panel
    detailAssetId,
    setDetailAssetId,
    detailAsset,
    detailLoading,
    detailError,

    // Per-asset actions
    getAssetActions,
  };
}
