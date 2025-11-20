// Re-export types and store from pixcubes module
import { createExtendedCubeStore } from '@pixsim7/scene.cubes';

// Re-export types that the rest of the application may need
export type {
  CubeType,
  CubeFace,
  CubeState,
  CubeConnection,
  MinimizedPanelData,
  SavedPosition,
  Formation,
  CubeMessage,
  CubeStore,
  ExtendedCubeStore,
} from '@pixsim7/scene.cubes';

// Create and export the store instance using the extended store
// (includes panel docking, minimization, and asset pinning features)
export const useControlCubeStore = createExtendedCubeStore();

// Type alias for the store
export type ControlCubeStore = ReturnType<typeof createExtendedCubeStore>;
