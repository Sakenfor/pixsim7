/**
 * Control Center Plugin Bootstrap
 *
 * Loads and registers all control center plugins on app startup.
 */

import { controlCenterRegistry } from './controlCenterPlugin';

/**
 * Bootstrap control center plugins
 * This registers all available control center implementations
 */
export async function bootstrapControlCenters(): Promise<void> {
  try {
    console.info('🎛️ Bootstrapping control center plugins...');

    // Import and register all control center plugins
    // They auto-register themselves when imported

    // 1. Dock Control Center (default)
    await import('../../plugins/ui/dock-control-center/plugin');
    console.info('✅ Loaded Dock Control Center');

    // 2. Cube Formation V1 (original floating cubes)
    await import('../../plugins/ui/cube-formation-v1/plugin');
    console.info('✅ Loaded Cube Formation V1');

    // NOTE: Cube System V2 (3D WebGL) is deprecated and no longer loaded.
    // It was an experimental full-screen 3D interface that didn't fit the workflow.
    // See: plugins/ui/cube-system-v2/plugin.tsx for the deprecated code.

    // Load user preference from storage
    controlCenterRegistry.loadPreference();

    const active = controlCenterRegistry.getActiveId();
    const available = controlCenterRegistry.getAll();

    console.info(`🎛️ Control Center: Active = "${active}", Available = ${available.length}`);
    console.info('Control center bootstrap complete');
  } catch (error) {
    console.error('Failed to bootstrap control centers:', error);
  }
}
