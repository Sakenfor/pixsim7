/**
 * useRegionStore
 *
 * Shared hook for common region store selector patterns.
 * Works with both useAssetRegionStore and useCaptureRegionStore.
 */

import { useMemo } from 'react';

import type { AssetRegion, AssetRegionStoreHook } from '@features/mediaViewer';

const EMPTY_REGIONS: AssetRegion[] = [];

export interface RegionStoreSelectors {
  /** All regions for the asset */
  regions: AssetRegion[];
  /** Number of regions */
  regionCount: number;
  /** Currently selected region ID */
  selectedRegionId: string | null;
  /** Current drawing mode */
  drawingMode: 'rect' | 'polygon' | 'select';
  /** Select a region by ID */
  selectRegion: (regionId: string | null) => void;
  /** Set drawing mode */
  setDrawingMode: (mode: 'rect' | 'polygon' | 'select') => void;
  /** Clear all regions for the asset */
  clearRegions: () => void;
  /** Get a specific region by ID */
  getRegion: (regionId: string) => AssetRegion | undefined;
}

/**
 * Hook for common region store selectors.
 *
 * @param useStore - The region store hook (useAssetRegionStore or useCaptureRegionStore)
 * @param assetId - Current asset ID
 * @returns Common selectors and actions
 */
export function useRegionStoreSelectors(
  useStore: AssetRegionStoreHook,
  assetId: string | number | null
): RegionStoreSelectors {
  const regions = useStore((s) => (assetId ? s.getRegions(assetId) : EMPTY_REGIONS));
  const selectedRegionId = useStore((s) => s.selectedRegionId);
  const drawingMode = useStore((s) => s.drawingMode);
  const selectRegion = useStore((s) => s.selectRegion);
  const setDrawingMode = useStore((s) => s.setDrawingMode);
  const clearAssetRegions = useStore((s) => s.clearAssetRegions);
  const getRegionFromStore = useStore((s) => s.getRegion);

  const clearRegions = useMemo(
    () => () => {
      if (assetId) clearAssetRegions(assetId);
    },
    [assetId, clearAssetRegions]
  );

  const getRegion = useMemo(
    () => (regionId: string) => {
      if (!assetId) return undefined;
      return getRegionFromStore(assetId, regionId);
    },
    [assetId, getRegionFromStore]
  );

  return {
    regions,
    regionCount: regions.length,
    selectedRegionId,
    drawingMode,
    selectRegion,
    setDrawingMode,
    clearRegions,
    getRegion,
  };
}
