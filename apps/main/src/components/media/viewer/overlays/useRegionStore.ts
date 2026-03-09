/**
 * useRegionStore
 *
 * Shared hook for common region store selector patterns.
 * Works with both useAssetRegionStore and useCaptureRegionStore.
 */

import { useMemo } from 'react';

import type { AssetRegion, AssetRegionLayer, AssetRegionStoreHook } from '@features/mediaViewer';

const EMPTY_REGIONS: AssetRegion[] = [];
const EMPTY_LAYERS: AssetRegionLayer[] = [];

export interface RegionStoreSelectors {
  /** All regions for the asset */
  regions: AssetRegion[];
  /** Number of regions */
  regionCount: number;
  /** Layers for the asset */
  layers: AssetRegionLayer[];
  /** Active layer ID */
  activeLayerId: string | null;
  /** Currently selected region ID */
  selectedRegionId: string | null;
  /** Current drawing mode */
  drawingMode: 'rect' | 'polygon' | 'curve' | 'select';
  /** Add a new layer and activate it */
  addLayer: () => void;
  /** Remove a layer */
  removeLayer: (layerId: string) => void;
  /** Activate a layer */
  setActiveLayer: (layerId: string) => void;
  /** Toggle layer visibility */
  toggleLayerVisibility: (layerId: string) => void;
  /** Toggle layer lock */
  toggleLayerLock: (layerId: string) => void;
  /** Move layer up/down in stack */
  moveLayer: (layerId: string, direction: 'up' | 'down') => void;
  /** Rename a layer */
  renameLayer: (layerId: string, name: string) => void;
  /** Select a region by ID */
  selectRegion: (regionId: string | null) => void;
  /** Set drawing mode */
  setDrawingMode: (mode: 'rect' | 'polygon' | 'curve' | 'select') => void;
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
  const layers = useStore((s) => (assetId ? s.getLayers(assetId) : EMPTY_LAYERS));
  const activeLayerId = useStore((s) => (assetId ? s.getActiveLayerId(assetId) : null));
  const selectedRegionId = useStore((s) => s.selectedRegionId);
  const drawingMode = useStore((s) => s.drawingMode);
  const addLayerInStore = useStore((s) => s.addLayer);
  const removeLayerInStore = useStore((s) => s.removeLayer);
  const updateLayerInStore = useStore((s) => s.updateLayer);
  const setActiveLayerInStore = useStore((s) => s.setActiveLayer);
  const moveLayerInStore = useStore((s) => s.moveLayer);
  const selectRegion = useStore((s) => s.selectRegion);
  const setDrawingMode = useStore((s) => s.setDrawingMode);
  const clearAssetRegions = useStore((s) => s.clearAssetRegions);
  const getRegionFromStore = useStore((s) => s.getRegion);

  const addLayer = useMemo(
    () => () => {
      if (!assetId) return;
      addLayerInStore(assetId);
    },
    [assetId, addLayerInStore]
  );

  const removeLayer = useMemo(
    () => (layerId: string) => {
      if (!assetId) return;
      removeLayerInStore(assetId, layerId);
    },
    [assetId, removeLayerInStore]
  );

  const setActiveLayer = useMemo(
    () => (layerId: string) => {
      if (!assetId) return;
      setActiveLayerInStore(assetId, layerId);
    },
    [assetId, setActiveLayerInStore]
  );

  const toggleLayerVisibility = useMemo(
    () => (layerId: string) => {
      if (!assetId) return;
      const layer = layers.find((l) => l.id === layerId);
      if (!layer) return;
      updateLayerInStore(assetId, layerId, { visible: !layer.visible });
    },
    [assetId, layers, updateLayerInStore]
  );

  const toggleLayerLock = useMemo(
    () => (layerId: string) => {
      if (!assetId) return;
      const layer = layers.find((l) => l.id === layerId);
      if (!layer) return;
      updateLayerInStore(assetId, layerId, { locked: !layer.locked });
    },
    [assetId, layers, updateLayerInStore]
  );

  const moveLayer = useMemo(
    () => (layerId: string, direction: 'up' | 'down') => {
      if (!assetId) return;
      moveLayerInStore(assetId, layerId, direction);
    },
    [assetId, moveLayerInStore]
  );

  const renameLayer = useMemo(
    () => (layerId: string, name: string) => {
      if (!assetId) return;
      updateLayerInStore(assetId, layerId, { name });
    },
    [assetId, updateLayerInStore]
  );

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
    layers,
    activeLayerId,
    selectedRegionId,
    drawingMode,
    addLayer,
    removeLayer,
    setActiveLayer,
    toggleLayerVisibility,
    toggleLayerLock,
    moveLayer,
    renameLayer,
    selectRegion,
    setDrawingMode,
    clearRegions,
    getRegion,
  };
}
