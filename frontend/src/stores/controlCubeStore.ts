import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CubeMode = 'idle' | 'rotating' | 'expanded' | 'combined' | 'docked';

export type CubeFace = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export type CubeType =
  | 'control'      // Main control cube (quick actions)
  | 'provider'     // Provider controls
  | 'preset'       // Preset management
  | 'panel'        // Panel controls
  | 'settings'     // Settings/options
  | 'viewer';      // Media viewer cube

export interface CubePosition {
  x: number;
  y: number;
}

export interface CubeRotation {
  x: number;  // degrees
  y: number;  // degrees
  z: number;  // degrees
}

export interface CubeState {
  id: string;
  type: CubeType;
  position: CubePosition;
  rotation: CubeRotation;
  scale: number;
  mode: CubeMode;
  visible: boolean;
  activeFace: CubeFace;
  dockedToPanelId?: string;  // If docked to a panel
  zIndex: number;
}

export interface ControlCubeStoreState {
  cubes: Record<string, CubeState>;
  activeCubeId?: string;
  combinedCubeIds: string[];  // Cubes currently combined into one
  summoned: boolean;          // Whether cube system is summoned (visible)
}

export interface ControlCubeActions {
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

  // Docking
  dockCubeToPanel: (cubeId: string, panelId: string) => void;
  undockCube: (cubeId: string) => void;

  // Combining
  combineCubes: (cubeIds: string[]) => void;
  separateCubes: () => void;

  // Summoning
  summonCubes: () => void;
  dismissCubes: () => void;

  // Utility
  reset: () => void;
}

// Rotation angles for each face
const FACE_ROTATIONS: Record<CubeFace, CubeRotation> = {
  front: { x: 0, y: 0, z: 0 },
  back: { x: 0, y: 180, z: 0 },
  right: { x: 0, y: 90, z: 0 },
  left: { x: 0, y: -90, z: 0 },
  top: { x: -90, y: 0, z: 0 },
  bottom: { x: 90, y: 0, z: 0 },
};

const STORAGE_KEY = 'control_cubes_v1';

let cubeIdCounter = 0;

export const useControlCubeStore = create<ControlCubeStoreState & ControlCubeActions>()(
  persist(
    (set, get) => ({
      cubes: {},
      activeCubeId: undefined,
      combinedCubeIds: [],
      summoned: false,

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

        // Update z-indices
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

        // Set all cubes to combined mode
        cubeIds.forEach((id) => {
          get().setCubeMode(id, 'combined');
        });
      },

      separateCubes: () => {
        const { combinedCubeIds } = get();

        // Reset all combined cubes to idle
        combinedCubeIds.forEach((id) => {
          get().setCubeMode(id, 'idle');
        });

        set({ combinedCubeIds: [] });
      },

      summonCubes: () => {
        set({ summoned: true });
        // Make all cubes visible
        Object.keys(get().cubes).forEach((id) => {
          get().updateCube(id, { visible: true });
        });
      },

      dismissCubes: () => {
        set({ summoned: false });
        // Hide all cubes that aren't docked
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
        });
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        cubes: state.cubes,
        summoned: state.summoned,
      }),
      version: 1,
    }
  )
);
