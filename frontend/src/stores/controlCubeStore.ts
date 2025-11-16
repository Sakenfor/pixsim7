// Re-export types and store from pixcubes module
import { createPixsimCubeStore } from 'pixcubes';

// Re-export types that the rest of the application may need
export type {
  CubeType,
  CubeFace,
  CubeState,
  CubeConnection,
  MinimizedPanelData,
  SavedPosition,
  Formation,
  ControlCubeStoreState,
  ControlCubeActions,
  CubeMessage,
} from 'pixcubes';

// Create and export the store instance
export const useControlCubeStore = createPixsimCubeStore();
