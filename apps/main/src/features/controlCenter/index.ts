/**
 * Control Center Feature
 *
 * Control Center domain with dock-based UI.
 * Cube functionality has been moved to @features/cubes.
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

// Generation-related components moved to @lib/generation-ui
// Import from @lib/generation-ui instead

// ============================================================================
// Stores - State Management
// ============================================================================

export {
  useControlCenterStore,
  type ControlCenterState,
  type ControlModule,
} from './stores/controlCenterStore';

export type {
  DockPosition,
  LayoutBehavior,
  RetractedMode,
} from '@features/docks/stores';

// ============================================================================
// Hooks - Feature Hooks
// ============================================================================

export {
  useControlCenterLayout,
} from './hooks/useControlCenterLayout';

// Note: Control Center panels are registered in the plugin catalog
// with the 'control-center' tag. Use panelSelectors.getByTag('control-center')
// to get CC panels. See @features/panels for panel registration.
