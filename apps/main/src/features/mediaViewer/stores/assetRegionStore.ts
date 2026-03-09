/**
 * Asset Region Store
 *
 * In-memory store for region annotations on assets.
 * Regions are keyed by asset ID and grouped into editable layers.
 */

import { create } from 'zustand';

import type { NormalizedRect, NormalizedPoint } from '@/components/interactive-surface';

// ============================================================================
// Types
// ============================================================================

/**
 * A single annotation region on an asset.
 */
export interface AssetRegion {
  /** Unique region ID */
  id: string;
  /** Layer the region belongs to */
  layerId: string;
  /** Region type: rectangle, polygon (closed+filled), or curve (open stroke) */
  type: 'rect' | 'polygon' | 'curve';
  /** Bounds for rect regions (normalized 0-1) */
  bounds?: NormalizedRect;
  /** Points for polygon/curve regions (normalized 0-1) */
  points?: NormalizedPoint[];
  /** Per-point stroke widths (normalized, same length as points) */
  pointWidths?: number[];
  /** Short label/tag for the region */
  label: string;
  /** Optional longer note/description */
  note?: string;
  /** Display style */
  style?: {
    strokeColor?: string;
    fillColor?: string;
    strokeWidth?: number;
  };
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
}

/**
 * A drawable layer for regions on an asset.
 */
export interface AssetRegionLayer {
  /** Unique layer ID */
  id: string;
  /** Display name */
  name: string;
  /** Visibility toggle */
  visible: boolean;
  /** Lock toggle (future editing constraints) */
  locked: boolean;
  /** Layer opacity for rendering */
  opacity: number;
  /** Z-order */
  zIndex: number;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
}

/**
 * Structured export format for regions
 */
export interface ExportedRegion {
  id: string;
  layerId: string;
  type: 'rect' | 'polygon' | 'curve';
  bounds?: NormalizedRect;
  points?: NormalizedPoint[];
  pointWidths?: number[];
  label: string;
  note?: string;
}

/**
 * Store state for asset regions
 */
interface AssetRegionState {
  /** Regions keyed by asset ID (string or number) */
  regionsByAsset: Map<string, AssetRegion[]>;
  /** Layers keyed by asset ID (string or number) */
  layersByAsset: Map<string, AssetRegionLayer[]>;
  /** Active layer ID keyed by asset ID (string or number) */
  activeLayerByAsset: Map<string, string>;
  /** Currently selected region ID */
  selectedRegionId: string | null;
  /** Current drawing mode */
  drawingMode: 'rect' | 'polygon' | 'curve' | 'select';

  // Layer actions
  /** Ensure the asset has at least one layer and return the active layer ID */
  ensureDefaultLayer: (assetId: string | number) => string;
  /** Add a layer to an asset */
  addLayer: (
    assetId: string | number,
    layer?: Partial<Pick<AssetRegionLayer, 'name' | 'visible' | 'locked' | 'opacity' | 'zIndex'>>
  ) => string;
  /** Update layer metadata */
  updateLayer: (
    assetId: string | number,
    layerId: string,
    updates: Partial<Pick<AssetRegionLayer, 'name' | 'visible' | 'locked' | 'opacity' | 'zIndex'>>
  ) => void;
  /** Remove a layer and all regions on it */
  removeLayer: (assetId: string | number, layerId: string) => void;
  /** Get layers for an asset */
  getLayers: (assetId: string | number) => AssetRegionLayer[];
  /** Get a specific layer for an asset */
  getLayer: (assetId: string | number, layerId: string) => AssetRegionLayer | undefined;
  /** Set active layer for an asset */
  setActiveLayer: (assetId: string | number, layerId: string) => void;
  /** Get active layer ID for an asset */
  getActiveLayerId: (assetId: string | number) => string | null;
  /** Move layer up/down in z-order */
  moveLayer: (assetId: string | number, layerId: string, direction: 'up' | 'down') => void;

  // Actions
  /** Add a region to an asset */
  addRegion: (assetId: string | number, region: Omit<AssetRegion, 'id' | 'createdAt' | 'updatedAt'>) => string;
  /** Update a region */
  updateRegion: (assetId: string | number, regionId: string, updates: Partial<AssetRegion>) => void;
  /** Remove a region */
  removeRegion: (assetId: string | number, regionId: string) => void;
  /** Get all regions for an asset */
  getRegions: (assetId: string | number) => AssetRegion[];
  /** Get a specific region */
  getRegion: (assetId: string | number, regionId: string) => AssetRegion | undefined;
  /** Select a region */
  selectRegion: (regionId: string | null) => void;
  /** Clear all regions for an asset (layers are preserved) */
  clearAssetRegions: (assetId: string | number) => void;
  /** Set drawing mode */
  setDrawingMode: (mode: 'rect' | 'polygon' | 'curve' | 'select') => void;
  /** Export visible-layer regions for an asset as structured data */
  exportRegions: (assetId: string | number) => ExportedRegion[];
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateId(): string {
  return `region_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateLayerId(): string {
  return `layer_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeAssetId(id: string | number): string {
  return String(id);
}

/** Stable empty array to avoid creating new references */
const EMPTY_REGIONS: AssetRegion[] = [];
const EMPTY_LAYERS: AssetRegionLayer[] = [];

function createDefaultLayer(name: string, zIndex = 0): AssetRegionLayer {
  const now = Date.now();
  return {
    id: generateLayerId(),
    name,
    visible: true,
    locked: false,
    opacity: 1,
    zIndex,
    createdAt: now,
    updatedAt: now,
  };
}

function nextLayerName(existing: AssetRegionLayer[]): string {
  let i = 1;
  while (existing.some((layer) => layer.name === `Layer ${i}`)) {
    i += 1;
  }
  return `Layer ${i}`;
}

function sortLayers(layers: AssetRegionLayer[]): AssetRegionLayer[] {
  return [...layers].sort((a, b) => a.zIndex - b.zIndex || a.createdAt - b.createdAt);
}

// ============================================================================
// Store
// ============================================================================

export function createAssetRegionStore() {
  return create<AssetRegionState>((set, get) => ({
    regionsByAsset: new Map(),
    layersByAsset: new Map(),
    activeLayerByAsset: new Map(),
    selectedRegionId: null,
    drawingMode: 'rect',

    ensureDefaultLayer: (assetId) => {
      const key = normalizeAssetId(assetId);
      let ensuredLayerId: string | null = null;

      set((state) => {
        const existingLayers = state.layersByAsset.get(key) ?? EMPTY_LAYERS;
        if (existingLayers.length > 0) {
          const existingActive = state.activeLayerByAsset.get(key);
          if (existingActive && existingLayers.some((layer) => layer.id === existingActive)) {
            ensuredLayerId = existingActive;
            return state;
          }

          ensuredLayerId = existingLayers[0].id;
          const newActiveMap = new Map(state.activeLayerByAsset);
          newActiveMap.set(key, ensuredLayerId);
          return { activeLayerByAsset: newActiveMap };
        }

        const defaultLayer = createDefaultLayer('Layer 1', 0);
        ensuredLayerId = defaultLayer.id;

        const newLayersMap = new Map(state.layersByAsset);
        newLayersMap.set(key, [defaultLayer]);

        const newActiveMap = new Map(state.activeLayerByAsset);
        newActiveMap.set(key, defaultLayer.id);

        return {
          layersByAsset: newLayersMap,
          activeLayerByAsset: newActiveMap,
        };
      });

      return ensuredLayerId ?? get().getActiveLayerId(assetId) ?? '';
    },

    addLayer: (assetId, layerData = {}) => {
      const key = normalizeAssetId(assetId);
      const id = generateLayerId();
      const now = Date.now();

      set((state) => {
        const existing = state.layersByAsset.get(key) ?? EMPTY_LAYERS;
        const maxZ = existing.length > 0 ? Math.max(...existing.map((l) => l.zIndex)) : -1;

        const layer: AssetRegionLayer = {
          id,
          name: layerData.name?.trim() || nextLayerName(existing),
          visible: layerData.visible ?? true,
          locked: layerData.locked ?? false,
          opacity: layerData.opacity ?? 1,
          zIndex: layerData.zIndex ?? (maxZ + 1),
          createdAt: now,
          updatedAt: now,
        };

        const newLayersMap = new Map(state.layersByAsset);
        newLayersMap.set(key, sortLayers([...existing, layer]));

        const newActiveMap = new Map(state.activeLayerByAsset);
        newActiveMap.set(key, id);

        return {
          layersByAsset: newLayersMap,
          activeLayerByAsset: newActiveMap,
        };
      });

      return id;
    },

    updateLayer: (assetId, layerId, updates) => {
      const key = normalizeAssetId(assetId);

      set((state) => {
        const layers = state.layersByAsset.get(key);
        if (!layers || layers.length === 0) return state;

        let didUpdate = false;
        const updatedLayers = layers.map((layer) => {
          if (layer.id !== layerId) return layer;
          didUpdate = true;
          return {
            ...layer,
            ...updates,
            name: updates.name !== undefined ? updates.name.trim() || layer.name : layer.name,
            updatedAt: Date.now(),
          };
        });

        if (!didUpdate) return state;

        const newLayersMap = new Map(state.layersByAsset);
        const sortedLayers = sortLayers(updatedLayers);
        newLayersMap.set(key, sortedLayers);

        // If a layer is hidden and the selected region belongs to it, clear selection.
        const shouldClearSelection = updates.visible === false
          && !!state.selectedRegionId
          && (state.regionsByAsset.get(key) ?? EMPTY_REGIONS).some(
            (region) => region.id === state.selectedRegionId && region.layerId === layerId
          );

        let nextActiveLayerByAsset = state.activeLayerByAsset;
        const activeLayerId = state.activeLayerByAsset.get(key);
        const hiddenActiveLayer = updates.visible === false && activeLayerId === layerId;
        if (hiddenActiveLayer) {
          const fallbackVisibleLayerId = sortedLayers.find((layer) => layer.visible)?.id ?? layerId;
          if (fallbackVisibleLayerId !== activeLayerId) {
            nextActiveLayerByAsset = new Map(state.activeLayerByAsset);
            nextActiveLayerByAsset.set(key, fallbackVisibleLayerId);
          }
        }

        return {
          layersByAsset: newLayersMap,
          activeLayerByAsset: nextActiveLayerByAsset,
          selectedRegionId: shouldClearSelection ? null : state.selectedRegionId,
        };
      });
    },

    removeLayer: (assetId, layerId) => {
      const key = normalizeAssetId(assetId);

      set((state) => {
        const layers = state.layersByAsset.get(key) ?? EMPTY_LAYERS;
        if (layers.length === 0 || !layers.some((layer) => layer.id === layerId)) {
          return state;
        }

        const regions = state.regionsByAsset.get(key) ?? EMPTY_REGIONS;
        const removedRegionIds = new Set(
          regions.filter((region) => region.layerId === layerId).map((region) => region.id)
        );
        const remainingRegions = regions.filter((region) => region.layerId !== layerId);
        const remainingLayers = layers.filter((layer) => layer.id !== layerId);

        const nextLayers = remainingLayers.length > 0
          ? remainingLayers
          : [createDefaultLayer('Layer 1', 0)];
        const sortedNextLayers = sortLayers(nextLayers);

        const oldActiveLayerId = state.activeLayerByAsset.get(key);
        const nextActiveLayerId = (
          oldActiveLayerId && sortedNextLayers.some((layer) => layer.id === oldActiveLayerId)
            ? oldActiveLayerId
            : sortedNextLayers[0]?.id
        ) ?? '';

        const newRegionsMap = new Map(state.regionsByAsset);
        newRegionsMap.set(key, remainingRegions);

        const newLayersMap = new Map(state.layersByAsset);
        newLayersMap.set(key, sortedNextLayers);

        const newActiveMap = new Map(state.activeLayerByAsset);
        newActiveMap.set(key, nextActiveLayerId);

        return {
          regionsByAsset: newRegionsMap,
          layersByAsset: newLayersMap,
          activeLayerByAsset: newActiveMap,
          selectedRegionId: removedRegionIds.has(state.selectedRegionId ?? '')
            ? null
            : state.selectedRegionId,
        };
      });
    },

    getLayers: (assetId) => {
      const key = normalizeAssetId(assetId);
      return get().layersByAsset.get(key) ?? EMPTY_LAYERS;
    },

    getLayer: (assetId, layerId) => {
      const layers = get().getLayers(assetId);
      return layers.find((layer) => layer.id === layerId);
    },

    setActiveLayer: (assetId, layerId) => {
      const key = normalizeAssetId(assetId);

      set((state) => {
        const layers = state.layersByAsset.get(key) ?? EMPTY_LAYERS;
        if (!layers.some((layer) => layer.id === layerId)) return state;

        const newActiveMap = new Map(state.activeLayerByAsset);
        newActiveMap.set(key, layerId);
        return { activeLayerByAsset: newActiveMap };
      });
    },

    getActiveLayerId: (assetId) => {
      const key = normalizeAssetId(assetId);
      const fromMap = get().activeLayerByAsset.get(key);
      if (fromMap) return fromMap;
      return get().getLayers(assetId)[0]?.id ?? null;
    },

    moveLayer: (assetId, layerId, direction) => {
      const key = normalizeAssetId(assetId);

      set((state) => {
        const layers = state.layersByAsset.get(key) ?? EMPTY_LAYERS;
        if (layers.length < 2) return state;

        const ordered = sortLayers(layers);
        const currentIndex = ordered.findIndex((layer) => layer.id === layerId);
        if (currentIndex < 0) return state;

        const targetIndex = direction === 'up' ? currentIndex + 1 : currentIndex - 1;
        if (targetIndex < 0 || targetIndex >= ordered.length) return state;

        const reordered = [...ordered];
        const swap = reordered[targetIndex];
        reordered[targetIndex] = reordered[currentIndex];
        reordered[currentIndex] = swap;

        const now = Date.now();
        const normalized = reordered.map((layer, index) => ({
          ...layer,
          zIndex: index,
          updatedAt:
            layer.id === layerId || layer.id === swap.id
              ? now
              : layer.updatedAt,
        }));

        const newLayersMap = new Map(state.layersByAsset);
        newLayersMap.set(key, normalized);

        return { layersByAsset: newLayersMap };
      });
    },

    addRegion: (assetId, regionData) => {
      const ensuredLayerId = get().ensureDefaultLayer(assetId);
      const id = generateId();
      const now = Date.now();
      const region: AssetRegion = {
        ...regionData,
        layerId: regionData.layerId || ensuredLayerId,
        id,
        createdAt: now,
        updatedAt: now,
      };

      set((state) => {
        const key = normalizeAssetId(assetId);
        const newMap = new Map(state.regionsByAsset);
        const existing = newMap.get(key) || [];
        newMap.set(key, [...existing, region]);
        return { regionsByAsset: newMap };
      });

      return id;
    },

    updateRegion: (assetId, regionId, updates) => {
      set((state) => {
        const key = normalizeAssetId(assetId);
        const newMap = new Map(state.regionsByAsset);
        const regions = newMap.get(key);
        if (!regions) return state;
        const layers = state.layersByAsset.get(key) ?? EMPTY_LAYERS;

        const updatedRegions = regions.map((r) => {
          if (r.id !== regionId) return r;

          // Regions on locked layers are immutable.
          const currentLayerLocked = layers.some((layer) => layer.id === r.layerId && layer.locked);
          if (currentLayerLocked) {
            return r;
          }

          // Reject moves to non-existent layers.
          if (updates.layerId && !layers.some((layer) => layer.id === updates.layerId)) {
            return r;
          }

          // Reject moves into locked layers.
          if (updates.layerId && layers.some((layer) => layer.id === updates.layerId && layer.locked)) {
            return r;
          }

          return { ...r, ...updates, updatedAt: Date.now() };
        });
        newMap.set(key, updatedRegions);
        return { regionsByAsset: newMap };
      });
    },

    removeRegion: (assetId, regionId) => {
      set((state) => {
        const key = normalizeAssetId(assetId);
        const newMap = new Map(state.regionsByAsset);
        const regions = newMap.get(key);
        if (!regions) return state;
        const layers = state.layersByAsset.get(key) ?? EMPTY_LAYERS;

        const target = regions.find((region) => region.id === regionId);
        if (!target) return state;
        if (layers.some((layer) => layer.id === target.layerId && layer.locked)) {
          return state;
        }

        newMap.set(key, regions.filter((r) => r.id !== regionId));
        return {
          regionsByAsset: newMap,
          selectedRegionId: state.selectedRegionId === regionId ? null : state.selectedRegionId,
        };
      });
    },

    getRegions: (assetId) => {
      const key = normalizeAssetId(assetId);
      return get().regionsByAsset.get(key) ?? EMPTY_REGIONS;
    },

    getRegion: (assetId, regionId) => {
      const regions = get().getRegions(assetId);
      return regions.find((r) => r.id === regionId);
    },

    selectRegion: (regionId) => {
      set({ selectedRegionId: regionId });
    },

    clearAssetRegions: (assetId) => {
      set((state) => {
        const key = normalizeAssetId(assetId);
        const newMap = new Map(state.regionsByAsset);
        newMap.set(key, []);
        return { regionsByAsset: newMap, selectedRegionId: null };
      });
    },

    setDrawingMode: (mode) => {
      set({ drawingMode: mode });
    },

    exportRegions: (assetId) => {
      const layers = get().getLayers(assetId);
      const visibleLayerIds = new Set(
        layers
          .filter((layer) => layer.visible)
          .map((layer) => layer.id)
      );
      if (visibleLayerIds.size === 0) return [];

      const regions = get().getRegions(assetId).filter((region) => visibleLayerIds.has(region.layerId));
      return regions.map((r) => ({
        id: r.id,
        layerId: r.layerId,
        type: r.type,
        bounds: r.bounds,
        points: r.points,
        pointWidths: r.pointWidths,
        label: r.label,
        note: r.note,
      }));
    },
  }));
}

export type AssetRegionStoreHook = ReturnType<typeof createAssetRegionStore>;

export const useAssetRegionStore = createAssetRegionStore();
export const useCaptureRegionStore = createAssetRegionStore();

// ============================================================================
// Selectors
// ============================================================================

export const selectSelectedRegionId = (state: AssetRegionState) => state.selectedRegionId;
export const selectDrawingMode = (state: AssetRegionState) => state.drawingMode;
