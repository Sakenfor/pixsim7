import type { StateCreator } from 'zustand';
import type { CubeState, CubeType, CubePosition, CubeRotation, CubeMode, CubeFace } from './types';
import { FACE_ROTATIONS } from './types';

export interface CubeManagementSlice {
  cubes: Record<string, CubeState>;
  activeCubeId?: string;
  combinedCubeIds: string[];
  summoned: boolean;
  hydrated: boolean;

  // Cube management
  addCube: (type: CubeType, position?: CubePosition) => string;
  removeCube: (id: string) => void;
  updateCube: (id: string, updates: Partial<CubeState>) => void;

  // Position & rotation
  setCubePosition: (id: string, pos: CubePosition) => void;
  setCubeRotation: (id: string, rot: Partial<CubeRotation>) => void;
  rotateCubeFace: (id: string, face: CubeFace) => void;

  // Mode & state
  setCubeMode: (id: string, mode: CubeMode) => void;
  setActiveCube: (id?: string) => void;
  toggleCubeVisibility: (id: string) => void;

  // Combining
  combineCubes: (cubeIds: string[]) => void;
  separateCubes: () => void;

  // Summoning
  summonCubes: () => void;
  dismissCubes: () => void;

  // Docking (basic)
  dockCubeToPanel: (cubeId: string, panelId: string) => void;
  undockCube: (cubeId: string) => void;

  // Utility
  reset: () => void;
}

let cubeIdCounter = 0;

export const createCubeManagementSlice: StateCreator<CubeManagementSlice> = (set, get) => ({
  cubes: {},
  activeCubeId: undefined,
  combinedCubeIds: [],
  summoned: false,
  hydrated: false,

  addCube: (type, position = { x: window.innerWidth / 2 - 50, y: window.innerHeight / 2 - 50 }) => {
    const id = `cube-${type}-${cubeIdCounter++}`;
    const cube: CubeState = {
      id,
      type,
      position,
      rotation: { x: 0, y: 0, z: 0 },
      scale: 1,
      mode: 'idle',
      visible: true,
      activeFace: 'front',
      zIndex: Object.keys(get().cubes).length,
    };
    set((state) => ({
      cubes: { ...state.cubes, [id]: cube },
    }));
    return id;
  },

  removeCube: (id) => {
    set((state) => {
      const { [id]: removed, ...rest } = state.cubes;
      return {
        cubes: rest,
        activeCubeId: state.activeCubeId === id ? undefined : state.activeCubeId,
        combinedCubeIds: state.combinedCubeIds.filter((cid) => cid !== id),
      };
    });
  },

  updateCube: (id, updates) => {
    set((state) => {
      if (!state.cubes[id]) return state;
      return {
        cubes: {
          ...state.cubes,
          [id]: { ...state.cubes[id], ...updates },
        },
      };
    });
  },

  setCubePosition: (id, pos) => {
    get().updateCube(id, { position: pos });
  },

  setCubeRotation: (id, rot) => {
    const cube = get().cubes[id];
    if (!cube) return;
    get().updateCube(id, {
      rotation: { ...cube.rotation, ...rot },
    });
  },

  rotateCubeFace: (id, face) => {
    const rotation = FACE_ROTATIONS[face];
    get().updateCube(id, {
      activeFace: face,
      rotation,
    });
  },

  setCubeMode: (id, mode) => {
    get().updateCube(id, { mode });
  },

  setActiveCube: (id) => {
    if (id && !get().cubes[id]) return;

    if (id) {
      const maxZ = Math.max(...Object.values(get().cubes).map((c) => c.zIndex));
      get().updateCube(id, { zIndex: maxZ + 1 });
    }

    set({ activeCubeId: id });
  },

  toggleCubeVisibility: (id) => {
    const cube = get().cubes[id];
    if (!cube) return;
    get().updateCube(id, { visible: !cube.visible });
  },

  dockCubeToPanel: (cubeId, panelId) => {
    get().updateCube(cubeId, {
      mode: 'docked',
      dockedToPanelId: panelId,
    });
  },

  undockCube: (cubeId) => {
    get().updateCube(cubeId, {
      mode: 'idle',
      dockedToPanelId: undefined,
    });
  },

  combineCubes: (cubeIds) => {
    if (cubeIds.length < 2) return;

    set({ combinedCubeIds: cubeIds });

    cubeIds.forEach((id) => {
      get().setCubeMode(id, 'combined');
    });
  },

  separateCubes: () => {
    const { combinedCubeIds } = get();

    combinedCubeIds.forEach((id) => {
      get().setCubeMode(id, 'idle');
    });

    set({ combinedCubeIds: [] });
  },

  summonCubes: () => {
    set({ summoned: true });
    Object.keys(get().cubes).forEach((id) => {
      get().updateCube(id, { visible: true });
    });
  },

  dismissCubes: () => {
    set({ summoned: false });
    Object.entries(get().cubes).forEach(([id, cube]) => {
      if (cube.mode !== 'docked') {
        get().updateCube(id, { visible: false });
      }
    });
  },

  reset: () => {
    set({
      cubes: {},
      activeCubeId: undefined,
      combinedCubeIds: [],
      summoned: false,
      hydrated: false,
    });
  },
});

export const syncCubeCounter = (cubeIds: string[]) => {
  const getNextNumericSuffix = (ids: string[]) => {
    return ids.reduce((max, id) => {
      const match = id.match(/-(\d+)$/);
      if (!match) return max;
      return Math.max(max, Number.parseInt(match[1], 10));
    }, -1);
  };

  const cubeSuffix = getNextNumericSuffix(cubeIds);
  if (cubeSuffix >= cubeIdCounter) {
    cubeIdCounter = cubeSuffix + 1;
  }
};
