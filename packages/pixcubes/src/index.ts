/**
 * PixCubes
 *
 * Reusable 3D cube UI system with formations, drag behavior, and panel minimization.
 *
 * @example
 * ```tsx
 * import {
 *   createExtendedCubeStore,
 *   calculateFormation,
 *   type ControlCube,
 * } from '@pixsim7/pixcubes';
 *
 * const useCubeStore = createExtendedCubeStore();
 *
 * function MyComponent() {
 *   const positions = calculateFormation({
 *     pattern: 'arc',
 *     cubeCount: 4,
 *     radius: 200,
 *   });
 *   // ...
 * }
 * ```
 */

// Types
export type {
  // Core types
  CubeType,
  CubeFace,
  CubePosition,
  CubePosition3D,
  CubeRotation,
  // State types
  ControlCube,
  CubeConnection,
  MinimizedPanelData,
  SavedPosition,
  Formation,
  // Formation types
  FormationPattern,
  FormationOptions,
  // Component props
  CubeFaceContentMap,
  DraggableCubeProps,
  ControlCubeProps,
  // Store types
  CubeStore,
  ExtendedCubeStore,
  // Expansion types
  CubeExpansion,
  CubeExpansionRenderer,
  // Message types
  CubeMessage,
  LinkingGesture,
} from './types';

// Constants
export {
  DEFAULT_CUBE_SIZE,
  BASE_CUBE_SIZE,
  MIN_CUBE_SIZE,
  MAX_CUBE_SIZE,
  DOCK_SNAP_DISTANCE,
  CUBE_SPACING,
  FORMATION_RADIUS,
  CUBE_TRANSITION_DURATION,
  FORMATION_TRANSITION_DURATION,
  CUBE_HOVER_TILT,
  CUBE_BASE_Z_INDEX,
  MAX_CUBE_Z_INDEX,
  CUBE_FOCUS_Z_INCREMENT,
  DRAG_THRESHOLD,
  EXPAND_EDGE_DISTANCE,
} from './constants';

// Formations
export {
  calculateFormation,
  calculateDockFormation,
  calculateGridFormation,
  calculateCircleFormation,
  calculateArcFormation,
  calculateConstellationFormation,
  calculateScatteredFormation,
  interpolatePosition,
  easeInOutCubic,
  easeOutCubic,
  easeInCubic,
  type FormationConfig,
} from './formations';

// Store
export { createCubeStore, createExtendedCubeStore } from './store';
