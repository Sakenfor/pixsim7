/**
 * Control Center Feature
 *
 * Consolidated Control Center domain with expandable control cubes,
 * docking panels, and workspace UI components.
 *
 * @barrel-export
 * This barrel exports the public surface of the Control Center feature.
 * Internal utilities and implementation details remain unexported to reduce coupling.
 */

// ============================================================================
// Components - Main UI Components
// ============================================================================

export { ControlCenterManager } from './components/ControlCenterManager';
export { ControlCenterDock } from './components/ControlCenterDock';
export { CubeFormationControlCenter } from './components/CubeFormationControlCenter';
export { CubeSpawnDock } from './components/CubeSpawnDock';
export { ControlCube } from './components/ControlCube';
export type { ControlCubeProps } from './components/ControlCube';

// Generation-related components moved to @lib/generation-ui
// Import from @lib/generation-ui instead

// ============================================================================
// Stores - State Management
// ============================================================================

export {
  useControlCenterStore,
  type ControlCenterState,
  type ControlModule,
  type DockPosition,
  type LayoutBehavior,
} from './stores/controlCenterStore';

export {
  useControlCubeStore,
  type CubeState,
  type CubeFace,
  type CubeType,
} from './stores/controlCubeStore';

export {
  useCubeSettingsStore,
  type LinkingGesture,
} from './stores/cubeSettingsStore';

// ============================================================================
// Hooks - Feature Hooks
// ============================================================================

export {
  useControlCenterLayout,
  type ControlCenterLayoutConfig,
} from './hooks/useControlCenterLayout';

export {
  useCubeDocking,
  usePanelRects,
} from './hooks/useCubeDocking';

// ============================================================================
// Lib - API & Utilities
// ============================================================================

// API wrappers
export {
  generateAsset,
  type GenerateAssetRequest,
  type GenerateAssetResponse,
} from './lib/api';

// Control center panel registry (new - uses SmartDockview)
export {
  ccPanelRegistry,
  registerCCPanel,
  getCCPanelDefinition,
  getCCPanelDefinitions,
  getEnabledCCPanels,
  type CCPanelId,
  type CCPanelDefinition,
} from './lib/ccPanelRegistry';

// Control center module registry (deprecated - use ccPanelRegistry instead)
export {
  controlCenterModuleRegistry,
  type ControlCenterModule,
  type ModuleCategory,
} from './lib/controlCenterModuleRegistry';
