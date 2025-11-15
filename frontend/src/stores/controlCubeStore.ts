import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  createCubeManagementSlice,
  syncCubeCounter,
  type CubeManagementSlice,
} from './cubeSlices/cubeManagementSlice';
import {
  createConnectionSlice,
  syncConnectionCounter,
  type ConnectionSlice,
} from './cubeSlices/connectionSlice';
import {
  createFormationSlice,
  syncFormationCounter,
  type FormationSlice,
} from './cubeSlices/formationSlice';
import {
  createPanelSlice,
  type PanelSlice,
} from './cubeSlices/panelSlice';

// Re-export types for convenience
export type {
  CubeMode,
  CubeFace,
  CubeType,
  CubeState,
  CubePosition,
  CubeRotation,
  CubeConnection,
  CubeMessage,
  Formation,
  SavedPosition,
  MinimizedPanelData,
} from './cubeSlices/types';

export { FACE_ROTATIONS } from './cubeSlices/types';

// Combined store type
export type ControlCubeStore = CubeManagementSlice &
  ConnectionSlice &
  FormationSlice &
  PanelSlice;

const STORAGE_KEY = 'control_cubes_v1';

export const useControlCubeStore = create<ControlCubeStore>()(
  persist(
    (...args) => ({
      ...createCubeManagementSlice(...args),
      ...createConnectionSlice(...args),
      ...createFormationSlice(...args),
      ...createPanelSlice(...args),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        cubes: state.cubes,
        summoned: state.summoned,
        hydrated: state.hydrated,
        connections: state.connections,
        formations: state.formations,
      }),
      version: 1,
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Sync counters from persisted state to prevent ID collisions
          syncCubeCounter(Object.keys(state.cubes ?? {}));
          syncConnectionCounter(Object.keys(state.connections ?? {}));
          syncFormationCounter(Object.keys(state.formations ?? {}));

          // Mark store as hydrated
          (state as any).hydrated = true;
        }
      },
    }
  )
);
