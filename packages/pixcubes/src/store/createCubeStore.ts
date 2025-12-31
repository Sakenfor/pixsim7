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
} from '../types';

let cubeCounter = 0;

function generateCubeId(): string {
  return `cube-${Date.now()}-${++cubeCounter}`;
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
      size: { width: number; height: number }
    ) => {
      const cube: ControlCube = {
        id: generateCubeId(),
        type: 'panel',
        position,
        rotation: { x: 0, y: 0 },
        zIndex: 100,
        visible: true,
        minimizedPanel: {
          panelId,
          originalPosition: position,
          originalSize: size,
        },
      };
      set((state) => ({
        cubes: { ...state.cubes, [cube.id]: cube },
      }));
      return cube.id;
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
      }
    },
  };

  return create<ExtendedCubeStore>()(persist(storeCreator, persistOptions));
}
