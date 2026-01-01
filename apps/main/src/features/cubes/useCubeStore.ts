/**
 * Cube Store Instance
 *
 * Creates and exports the cube store using @pixsim7/pixcubes.
 */

import { createExtendedCubeStore } from '@pixsim7/pixcubes';

// Create the store instance with persistence
export const useCubeStore = createExtendedCubeStore('pixsim7-cubes');

// Re-export types from pixcubes for convenience
export type {
  CubeType,
  CubeFace,
  ControlCube,
  CubePosition,
  CubeRotation,
  MinimizedPanelData,
  Formation,
  FormationPattern,
  ExtendedCubeStore,
  CubeFaceContentMap,
} from '@pixsim7/pixcubes';
