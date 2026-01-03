/**
 * Cubes Integration
 *
 * Integrates cubes with the widget system, capabilities system, and context hub.
 */

import { registerCubesCapabilities, unregisterCubesCapabilities } from './capabilities';
import { registerCubeWidget } from './widget';
import { registerCubeContextHub, unregisterCubeContextHub } from './contextHub';

// Capabilities
export {
  registerCubesCapabilities,
  unregisterCubesCapabilities,
  toggleCubesVisibility,
  setCubesVisibility,
  getCubesVisibility,
  subscribeToVisibility,
  cycleFormation,
  setFormation,
  getFormation,
  subscribeToFormation,
} from './capabilities';

// Widget
export { registerCubeWidget, cubeOverlayWidget } from './widget';

// Context Hub
export {
  CAP_CUBE_CONTEXT,
  getCubeContext,
  subscribeToCubeContext,
  useCubeContext,
  useCubeAssetBinding,
  cubeContextDescriptor,
  registerCubeContextHub,
  unregisterCubeContextHub,
  type CubeContext,
} from './contextHub';

/**
 * Initialize all cube integrations
 * Call this once during app startup
 */
export function initializeCubesIntegration(): void {
  registerCubesCapabilities();

  registerCubeWidget();

  registerCubeContextHub();

  console.log('[cubes] All integrations initialized');
}

/**
 * Cleanup all cube integrations
 * Call this during app shutdown if needed
 */
export function cleanupCubesIntegration(): void {
  unregisterCubesCapabilities();

  unregisterCubeContextHub();
}
