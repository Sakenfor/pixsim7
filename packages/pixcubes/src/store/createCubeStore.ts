/**
 * Cube Store Factory
 *
 * Creates a zustand store for managing cube state.
 */

import { create, type StateCreator } from 'zustand';
import { persist, type PersistOptions } from 'zustand/middleware';
import type {
  ControlCube,
  CubeType,
  CubePosition,
  CubeStore,
  ExtendedCubeStore,
  MinimizedPanelData,
  Formation,
  FormationPattern,
} from '../types';
import { calculateFormation } from '../formations/cubeFormations';

let cubeCounter = 0;

function generateCubeId(): string {
  return `cube-${Date.now()}-${++cubeCounter}`;
}

/**
 * Strip instance suffix (e.g. "panel::1" → "panel") for dedup comparisons.
 * Floating panels use `::N` suffixes for multi-instance IDs.
 */
function stripInstanceSuffix(id: string): string {
  const sep = id.lastIndexOf('::');
  return sep === -1 ? id : id.slice(0, sep);
}

function createDefaultCube(type: CubeType, position?: CubePosition): ControlCube {
  return {
    id: generateCubeId(),
    type,
    position: position ?? { x: 100, y: 100 },
    rotation: { x: 0, y: 0 },
    zIndex: 1,
    visible: true,
  };
}

/**
 * Create a basic cube store
 */
export function createCubeStore() {
  return create<CubeStore>((set, get) => ({
    cubes: {},
    hydrated: true,

    addCube: (type: CubeType, position?: CubePosition) => {
      const cube = createDefaultCube(type, position);
      set((state) => ({
        cubes: { ...state.cubes, [cube.id]: cube },
      }));
      return cube.id;
    },

    removeCube: (id: string) => {
      set((state) => {
        const { [id]: removed, ...rest } = state.cubes;
        return { cubes: rest };
      });
    },

    updateCube: (id: string, updates: Partial<ControlCube>) => {
      set((state) => {
        const cube = state.cubes[id];
        if (!cube) return state;
        return {
          cubes: {
            ...state.cubes,
            [id]: { ...cube, ...updates },
          },
        };
      });
    },

    getCube: (id: string) => get().cubes[id],

    clearCubes: () => set({ cubes: {} }),

    setCubes: (cubes: Record<string, ControlCube>) => set({ cubes }),
  }));
}

type ExtendedCubeStoreCreator = StateCreator<
  ExtendedCubeStore,
  [['zustand/persist', unknown]],
  [],
  ExtendedCubeStore
>;

/**
 * Create an extended cube store with persistence and additional features
 */
export function createExtendedCubeStore(storageKey = 'pixcubes-store') {
  const storeCreator: ExtendedCubeStoreCreator = (set, get) => ({
    cubes: {},
    hydrated: false,
    pinnedAssets: [],
    formations: [],

    addCube: (type: CubeType, position?: CubePosition) => {
      const cube = createDefaultCube(type, position);
      set((state) => ({
        cubes: { ...state.cubes, [cube.id]: cube },
      }));
      return cube.id;
    },

    removeCube: (id: string) => {
      set((state) => {
        const { [id]: removed, ...rest } = state.cubes;
        return { cubes: rest };
      });
    },

    updateCube: (id: string, updates: Partial<ControlCube>) => {
      set((state) => {
        const cube = state.cubes[id];
        if (!cube) return state;
        return {
          cubes: {
            ...state.cubes,
            [id]: { ...cube, ...updates },
          },
        };
      });
    },

    getCube: (id: string) => get().cubes[id],

    clearCubes: () => set({ cubes: {} }),

    setCubes: (cubes: Record<string, ControlCube>) => set({ cubes }),

    // Panel minimization
    minimizePanelToCube: (
      panelId: string,
      position: CubePosition,
      size: { width: number; height: number },
      context?: Record<string, any>,
      cubeInstanceId?: string,
    ) => {
      // Deduplicate: if a cube for this panel definition already exists within
      // the same cube instance, update it. Compare by stripped definition ID so
      // legacy instance-suffixed IDs (e.g. "settings::1") still match ("settings").
      const normalizedId = stripInstanceSuffix(panelId);
      const instId = cubeInstanceId ?? 'default';
      const existing = Object.values(get().cubes).find(
        (c) =>
          c.minimizedPanel &&
          stripInstanceSuffix(c.minimizedPanel.panelId) === normalizedId &&
          (c.cubeInstanceId ?? 'default') === instId,
      );
      if (existing) {
        set((state) => ({
          cubes: {
            ...state.cubes,
            [existing.id]: {
              ...existing,
              position,
              cubeInstanceId: instId,
              minimizedPanel: {
                panelId: normalizedId,
                originalPosition: position,
                originalSize: size,
                context,
              },
            },
          },
        }));
        return existing.id;
      }

      const cube: ControlCube = {
        id: generateCubeId(),
        type: 'panel',
        position,
        rotation: { x: 0, y: 0 },
        zIndex: 100,
        visible: true,
        cubeInstanceId: instId,
        minimizedPanel: {
          panelId: normalizedId,
          originalPosition: position,
          originalSize: size,
          context,
        },
      };
      set((state) => ({
        cubes: { ...state.cubes, [cube.id]: cube },
      }));
      return cube.id;
    },

    arrangeMinimizedPanels: (pattern: FormationPattern = 'dock') => {
      const cubes = get().cubes;
      const panelCubeIds = Object.keys(cubes).filter(
        (id) => cubes[id].minimizedPanel != null,
      );

      if (panelCubeIds.length < 2) return;

      const positions = calculateFormation({
        pattern,
        cubeCount: panelCubeIds.length,
        spacing: 100,
      });

      set((state) => {
        const updatedCubes = { ...state.cubes };
        panelCubeIds.forEach((id, i) => {
          if (positions[i]) {
            updatedCubes[id] = {
              ...updatedCubes[id],
              position: positions[i],
            };
          }
        });
        return { cubes: updatedCubes };
      });
    },

    restorePanelFromCube: (cubeId: string): MinimizedPanelData | null => {
      const cube = get().cubes[cubeId];
      if (!cube?.minimizedPanel) return null;

      const panelData = cube.minimizedPanel;
      set((state) => {
        const { [cubeId]: removed, ...rest } = state.cubes;
        return { cubes: rest };
      });
      return panelData;
    },

    // Pinned assets
    pinAsset: (assetId: string) => {
      set((state) => ({
        pinnedAssets: [...state.pinnedAssets, assetId],
      }));
    },

    unpinAsset: (assetId: string) => {
      set((state) => ({
        pinnedAssets: state.pinnedAssets.filter((id) => id !== assetId),
      }));
    },

    // Formations
    saveFormation: (name: string) => {
      const cubes = get().cubes;
      const cubePositions: Record<string, { x: number; y: number }> = {};
      Object.values(cubes).forEach((cube) => {
        cubePositions[cube.id] = { x: cube.position.x, y: cube.position.y };
      });

      const formation: Formation = {
        id: `formation-${Date.now()}`,
        name,
        cubePositions,
      };

      set((state) => ({
        formations: [...state.formations, formation],
      }));
    },

    loadFormation: (formationId: string) => {
      const formation = get().formations.find((f) => f.id === formationId);
      if (!formation) return;

      set((state) => {
        const updatedCubes = { ...state.cubes };
        Object.entries(formation.cubePositions).forEach(([cubeId, pos]) => {
          if (updatedCubes[cubeId]) {
            updatedCubes[cubeId] = {
              ...updatedCubes[cubeId],
              position: { x: pos.x, y: pos.y },
            };
          }
        });
        return { cubes: updatedCubes };
      });
    },
  });

  const persistOptions: PersistOptions<ExtendedCubeStore> = {
    name: storageKey,
    onRehydrateStorage: () => (state) => {
      if (state) {
        state.hydrated = true;

        // Deduplicate minimized panel cubes — keep only the latest per panel definition.
        // Panel IDs may carry an instance suffix (e.g. "panel::1") — strip it so
        // different instances of the same definition are treated as duplicates.
        // Also normalize stored panelIds to definition-only form.
        const cubes = state.cubes;
        const seenDefIds = new Set<string>();
        const duplicateIds: string[] = [];
        // Iterate in reverse insertion order so the latest cube wins
        const cubeEntries = Object.entries(cubes).reverse();
        for (const [cubeId, cube] of cubeEntries) {
          const panelId = cube.minimizedPanel?.panelId;
          if (panelId) {
            const defId = stripInstanceSuffix(panelId);
            // Normalize legacy instance IDs to definition-only form
            if (defId !== panelId) {
              cube.minimizedPanel!.panelId = defId;
            }
            if (seenDefIds.has(defId)) {
              duplicateIds.push(cubeId);
            } else {
              seenDefIds.add(defId);
            }
          }
        }
        if (duplicateIds.length > 0) {
          for (const id of duplicateIds) {
            delete cubes[id];
          }
        }
      }
    },
  };

  return create<ExtendedCubeStore>()(persist(storeCreator, persistOptions));
}
