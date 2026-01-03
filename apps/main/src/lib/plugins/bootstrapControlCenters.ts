/**
 * Control Center Plugin Bootstrap
 *
 * Loads and registers all control center plugins on app startup.
 */

import type { PluginRegistration } from './registration';

/**
 * Bootstrap control center plugins
 * This registers all available control center implementations
 */
export async function bootstrapControlCenters(): Promise<void> {
  console.info('dYZ>‹,? Bootstrapping control center plugins...');

  const registrations = await discoverControlCenterRegistrations();
  for (const registration of registrations) {
    await registration.register();
  }

  const { controlCenterRegistry } = await import('./controlCenterPlugin');
  controlCenterRegistry.loadPreference();

  const active = controlCenterRegistry.getActiveId();
  const available = controlCenterRegistry.getAll();

  console.info(`dYZ>‹,? Control Center: Active = "${active}", Available = ${available.length}`);
  console.info('Control center bootstrap complete');
}

export async function discoverControlCenterRegistrations(): Promise<PluginRegistration[]> {
  const registrations: PluginRegistration[] = [];

  // NOTE: Cube Formation V1 has been extracted to @features/cubes as CubeWidgetOverlay.
  // It now works as a standalone overlay alongside Dock, not as a control center mode.
  // See: features/cubes/CubeWidgetOverlay.tsx

  // NOTE: Cube System V2 (3D WebGL) is deprecated and no longer loaded.
  // It was an experimental full-screen 3D interface that didn't fit the workflow.
  // See: plugins/ui/cube-system-v2/plugin.tsx for the deprecated code.

  try {
    const module = await import('../../plugins/ui/dock-control-center/plugin');
    const manifest = module.manifest;
    const register = module.registerDockControlCenter;

    if (manifest && typeof register === 'function') {
      registrations.push({
        id: manifest.id,
        family: 'control-center',
        origin: 'builtin',
        source: 'source',
        label: manifest.name,
        register,
      });
    } else {
      console.warn('[ControlCenter] Dock control center plugin missing manifest or register function');
    }
  } catch (error) {
    console.error('[ControlCenter] Failed to discover dock control center plugin', error);
  }

  return registrations;
}
