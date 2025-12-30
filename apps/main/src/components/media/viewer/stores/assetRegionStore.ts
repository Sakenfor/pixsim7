/**
 * Asset Region Store
 *
 * In-memory store for region annotations on assets.
 * Regions are keyed by asset ID and contain normalized coordinates
 * with labels and notes for prompt generation.
 */

import { create } from 'zustand';
import type { NormalizedRect, NormalizedPoint } from '@/components/interactive-surface';

// ============================================================================
// Types
// ============================================================================

/**
 * A single annotation region on an asset
 */
export interface AssetRegion {
  /** Unique region ID */
  id: string;
  /** Region type: rectangle or polygon */
  type: 'rect' | 'polygon';
  /** Bounds for rect regions (normalized 0-1) */
  bounds?: NormalizedRect;
  /** Points for polygon regions (normalized 0-1) */
  points?: NormalizedPoint[];
  /** Short label/tag for the region */
  label: string;
  /** Optional longer note/description */
  note?: string;
  /** Display style */
  style?: {
    strokeColor?: string;
    fillColor?: string;
  };
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
  type: 'rect' | 'polygon';
  bounds?: NormalizedRect;
  points?: NormalizedPoint[];
  label: string;
  note?: string;
}

/**
 * Store state for asset regions
 */
interface AssetRegionState {
  /** Regions keyed by asset ID (string or number) */
  regionsByAsset: Map<string, AssetRegion[]>;
  /** Currently selected region ID */
  selectedRegionId: string | null;
  /** Whether annotation mode is active */
  annotationMode: boolean;
  /** Current drawing mode */
  drawingMode: 'rect' | 'polygon' | 'select';

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
  /** Clear all regions for an asset */
  clearAssetRegions: (assetId: string | number) => void;
  /** Toggle annotation mode */
  setAnnotationMode: (enabled: boolean) => void;
  /** Set drawing mode */
  setDrawingMode: (mode: 'rect' | 'polygon' | 'select') => void;
  /** Export regions for an asset as structured data */
  exportRegions: (assetId: string | number) => ExportedRegion[];
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateId(): string {
  return `region_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeAssetId(id: string | number): string {
  return String(id);
}

/** Stable empty array to avoid creating new references */
const EMPTY_REGIONS: AssetRegion[] = [];

// ============================================================================
// Store
// ============================================================================

export const useAssetRegionStore = create<AssetRegionState>((set, get) => ({
  regionsByAsset: new Map(),
  selectedRegionId: null,
  annotationMode: false,
  drawingMode: 'rect',

  addRegion: (assetId, regionData) => {
    const id = generateId();
    const now = Date.now();
    const region: AssetRegion = {
      ...regionData,
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

      const updatedRegions = regions.map((r) =>
        r.id === regionId
          ? { ...r, ...updates, updatedAt: Date.now() }
          : r
      );
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
      newMap.delete(key);
      return { regionsByAsset: newMap, selectedRegionId: null };
    });
  },

  setAnnotationMode: (enabled) => {
    set({ annotationMode: enabled });
  },

  setDrawingMode: (mode) => {
    set({ drawingMode: mode });
  },

  exportRegions: (assetId) => {
    const regions = get().getRegions(assetId);
    return regions.map((r) => ({
      id: r.id,
      type: r.type,
      bounds: r.bounds,
      points: r.points,
      label: r.label,
      note: r.note,
    }));
  },
}));

// ============================================================================
// Selectors
// ============================================================================

export const selectAnnotationMode = (state: AssetRegionState) => state.annotationMode;
export const selectSelectedRegionId = (state: AssetRegionState) => state.selectedRegionId;
export const selectDrawingMode = (state: AssetRegionState) => state.drawingMode;
