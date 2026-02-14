/**
 * Gizmo Lab Store
 *
 * Shared selection state for the Gizmo Lab panels.
 * Panels (browsers + playgrounds) communicate through this store.
 */

import {
  getAllGizmos,
  getAllTools,
  type GizmoDefinition,
  type InteractiveTool,
} from '@pixsim7/interaction.gizmos';
import type { NpcBodyZone } from '@pixsim7/shared.types';
import { create } from 'zustand';

import { zoneDetectorRegistry } from '@lib/detection';

interface GizmoLabState {
  /** Selected gizmo ID */
  selectedGizmoId: string | null;
  /** Selected tool ID */
  selectedToolId: string | null;
  /** Gizmo category filter ('all' = no filter) */
  gizmoFilter: string;
  /** Tool type filter ('all' = no filter) */
  toolFilter: string;

  // ===== Asset + Detection =====

  /** Loaded asset ID */
  assetId: number | null;
  /** Loaded asset image URL */
  assetUrl: string | null;
  /** Zones detected on the loaded asset */
  detectedZones: NpcBodyZone[];
  /** Currently selected detector */
  activeDetectorId: string;
  /** Whether detection is in progress */
  isDetecting: boolean;
  /** Last detection error message */
  detectionError: string | null;
}

interface GizmoLabActions {
  selectGizmo: (id: string | null) => void;
  selectTool: (id: string | null) => void;
  setGizmoFilter: (category: string) => void;
  setToolFilter: (type: string) => void;

  // ===== Asset + Detection =====

  setAsset: (id: number, url: string) => void;
  clearAsset: () => void;
  setDetectorId: (id: string) => void;
  runDetection: (image: HTMLImageElement) => Promise<void>;
  setDetectedZones: (zones: NpcBodyZone[]) => void;
}

export const useGizmoLabStore = create<GizmoLabState & GizmoLabActions>((set, get) => ({
  selectedGizmoId: null,
  selectedToolId: null,
  gizmoFilter: 'all',
  toolFilter: 'all',

  assetId: null,
  assetUrl: null,
  detectedZones: [],
  activeDetectorId: 'preset',
  isDetecting: false,
  detectionError: null,

  selectGizmo: (id) => set({ selectedGizmoId: id }),
  selectTool: (id) => set({ selectedToolId: id }),
  setGizmoFilter: (category) => set({ gizmoFilter: category }),
  setToolFilter: (type) => set({ toolFilter: type }),

  setAsset: (id, url) => set({ assetId: id, assetUrl: url, detectedZones: [], detectionError: null }),
  clearAsset: () => set({ assetId: null, assetUrl: null, detectedZones: [], detectionError: null }),
  setDetectorId: (id) => set({ activeDetectorId: id }),
  setDetectedZones: (zones) => set({ detectedZones: zones }),

  runDetection: async (image) => {
    const { activeDetectorId, assetId, assetUrl } = get();
    const detector = zoneDetectorRegistry.get(activeDetectorId);
    if (!detector) {
      set({ detectionError: `Unknown detector: ${activeDetectorId}` });
      return;
    }

    set({ isDetecting: true, detectionError: null });

    try {
      const result = await detector.detect({ image, assetId: assetId ?? undefined, assetUrl: assetUrl ?? undefined });
      set({ detectedZones: result.zones, isDetecting: false });
    } catch (err) {
      set({
        detectionError: err instanceof Error ? err.message : 'Detection failed',
        isDetecting: false,
      });
    }
  },
}));

/** Resolve the selected gizmo definition from registry */
export function useSelectedGizmo(): GizmoDefinition | null {
  const id = useGizmoLabStore((s) => s.selectedGizmoId);
  if (!id) return null;
  return getAllGizmos().find((g) => g.id === id) ?? null;
}

/** Resolve the selected tool definition from registry */
export function useSelectedTool(): InteractiveTool | null {
  const id = useGizmoLabStore((s) => s.selectedToolId);
  if (!id) return null;
  return getAllTools().find((t) => t.id === id) ?? null;
}
