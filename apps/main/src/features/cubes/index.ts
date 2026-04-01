/**
 * Cubes Feature
 *
 * 3D cube widget overlay system using @pixsim7/pixcubes.
 * Standalone feature - not tied to control center.
 */

// Module
export { cubesModule } from './module';

// Main overlay component
export { CubeWidgetOverlay } from './CubeWidgetOverlay';

// Stores
export { useCubeStore } from './useCubeStore';
export { useCubeSettingsStore, type CubeFaceMode, type CubeDockPosition } from './stores/cubeSettingsStore';
export { useCubeInstanceStore, selectOrderedInstances, CUBE_PRESETS, type CubePreset, type CubeInstanceMeta } from './stores/cubeInstanceStore';
export { useCubeHighlightStore } from './stores/cubeHighlightStore';

// Components
export { DraggableCube } from './components/DraggableCube';
export { getCubeFaceContent, getMinimizedPanelFaceContent } from './components/CubeFaceContent';
export { CubeHeaderChips } from './components/CubeHeaderChips';
export { CreateCubePopup } from './components/CreateCubePopup';

// Lib - Expansion registry
export {
  cubeExpansionRegistry,
  getExpansionSize,
  DEFAULT_EXPANSION_SIZES,
  registerCubeExpansions,
  type ExpansionType,
  type ExpansionComponentProps,
  type ExpansionProvider,
} from './lib';

// Lib - Face registry
export {
  CubeFaceRegistry,
  cubeFaceRegistry,
  registerDefaultCubeFaces,
  type CubeFacePosition,
  type CubeFaceComponentProps,
  type CubeFaceDefinition,
} from './lib';

// Integration - Widget, Capabilities, Context Hub
export {
  // Initialization
  initializeCubesIntegration,
  cleanupCubesIntegration,
  // Capabilities
  registerCubesCapabilities,
  unregisterCubesCapabilities,
  toggleCubesVisibility,
  setCubesVisibility,
  getCubesVisibility,
  cycleFormation,
  setFormation,
  getFormation,
  // Widget
  registerCubeWidget,
  cubeOverlayWidget,
  // Context Hub
  CAP_CUBE_CONTEXT,
  getCubeContext,
  useCubeContext,
  useCubeAssetBinding,
  cubeContextDescriptor,
  type CubeContext,
} from './integration';

// Re-export types from pixcubes
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
} from './useCubeStore';
