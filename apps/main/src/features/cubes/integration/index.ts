/**
 * Cubes Integration
 *
 * Integrates cubes with the widget system, capabilities system, and context hub.
 */

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
  // Register capabilities (features, actions, states)
  const { registerCubesCapabilities } = require('./capabilities');
  registerCubesCapabilities();

  // Register widget
  const { registerCubeWidget } = require('./widget');
  registerCubeWidget();

  // Register context hub descriptor
  const { registerCubeContextHub } = require('./contextHub');
  registerCubeContextHub();

  console.log('[cubes] All integrations initialized');
}

/**
 * Cleanup all cube integrations
 * Call this during app shutdown if needed
 */
export function cleanupCubesIntegration(): void {
  const { unregisterCubesCapabilities } = require('./capabilities');
  unregisterCubesCapabilities();

  const { unregisterCubeContextHub } = require('./contextHub');
  unregisterCubeContextHub();
}
