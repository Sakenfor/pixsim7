import { createAssetActions } from '@pixsim7/shared.assets.core';
import { useState, useCallback, useMemo } from 'react';

import { useAssets, useAsset, useAssetDetailStore, toSelectedAsset, type AssetModel, type AssetFilters } from '@features/assets';
import { useAssetSelectionStore } from '@features/assets/stores/assetSelectionStore';
import { useMediaGenerationActions } from '@features/generation';

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

  // Selection state (global store)
  const storeSelectedAssets = useAssetSelectionStore((s) => s.selectedAssets);
  const toggleAsset = useAssetSelectionStore((s) => s.toggleAsset);
  const clearSelection = useAssetSelectionStore((s) => s.clearSelection);

  const selectedAssetIds = useMemo(
    () => new Set(storeSelectedAssets.map((a) => String(a.id))),
    [storeSelectedAssets],
  );

  const toggleAssetSelection = useCallback(
    (asset: AssetModel) => {
      if (!enableSelection) return;
      toggleAsset(toSelectedAsset(asset, 'gallery'));
    },
    [enableSelection, toggleAsset],
  );

  // Get selected assets (filtered to displayItems for this surface)
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
    const actions = createAssetActions(asset, actionHandlers);
    // Wire onQuickGenerate to forward burst count and duration from gesture system
    if (!actions.onQuickGenerate) {
      actions.onQuickGenerate = (_id?: number, count?: number, overrides?: { duration?: number }) =>
        quickGenerate(asset, { count, duration: overrides?.duration });
    }
    return actions;
  }, [actionHandlers, quickGenerate]);

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
