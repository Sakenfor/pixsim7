import { useState, useCallback, useMemo } from 'react';
import { useAssets, type AssetSummary, type AssetFilters } from '@/hooks/useAssets';
import { useMediaGenerationActions } from '@/hooks/useMediaGenerationActions';
import { useSelection } from '@/hooks/useSelection';
import { createAssetActions } from '@/lib/assets/assetActions';

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
    queueImageToVideo,
    queueVideoExtend,
    queueAddToTransition,
    queueAutoGenerate,
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
    onImageToVideo: queueImageToVideo,
    onVideoExtend: queueVideoExtend,
    onAddToTransition: queueAddToTransition,
    onAddToGenerate: queueAutoGenerate,
  }), [queueImageToVideo, queueVideoExtend, queueAddToTransition, queueAutoGenerate]);

  // Get per-asset actions
  const getAssetActions = useCallback((asset: AssetSummary) => {
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

    // Per-asset actions
    getAssetActions,
  };
}
