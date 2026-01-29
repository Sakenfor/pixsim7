/**
 * Control Center Plugin Auto-Discovery
 *
 * Uses Vite's import.meta.glob for build-time discovery of control center plugins.
 * Replaces hardcoded plugin imports with file-based auto-discovery.
 *
 * Convention:
 * - Control center plugins live in `src/plugins/ui/` with `controlCenter` in manifest
 * - Each plugin exports:
 *   - `manifest: ControlCenterPluginManifest`
 *   - `plugin: ControlCenterPlugin`
 *   - `registerXxx(): Promise<void>` (optional, for manual registration)
 *
 * Directory structure:
 * ```
 * src/plugins/ui/
 * ├── dock-control-center/
 * │   └── plugin.tsx          # exports manifest, plugin
 * └── cube-control-center/    # (future)
 *     └── plugin.tsx
 * ```
 */

import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';
import type {
  ControlCenterPlugin,
  ControlCenterPluginManifest,
} from '@lib/plugins/controlCenterPlugin';

import type { PluginRegistration } from './registration';

/**
 * Control center plugin module shape.
 */
interface ControlCenterPluginModule {
  manifest: ControlCenterPluginManifest;
  plugin: ControlCenterPlugin;
}

/**
 * Discovered control center with metadata.
 */
export interface DiscoveredControlCenter {
  manifest: ControlCenterPluginManifest;
  plugin: ControlCenterPlugin;
  sourcePath: string;
}

/**
 * Import all control center plugin modules using Vite's glob import.
 * This is evaluated at build time.
 *
 * We look for plugin.tsx files in ui/ subdirectories that have controlCenter in their manifest.
 */
const controlCenterModules = import.meta.glob<ControlCenterPluginModule>(
  ['../../plugins/ui/*/plugin.tsx'],
  { eager: true }
);

/**
 * Check if a module is a control center plugin.
 */
function isControlCenterPlugin(module: unknown): module is ControlCenterPluginModule {
  const m = module as Record<string, unknown>;
  return (
    m &&
    typeof m === 'object' &&
    'manifest' in m &&
    'plugin' in m &&
    typeof m.manifest === 'object' &&
    m.manifest !== null &&
    'controlCenter' in (m.manifest as Record<string, unknown>)
  );
}

/**
 * Discover all control center plugins from the plugins directory.
 */
export function discoverControlCenters(): DiscoveredControlCenter[] {
  const discovered: DiscoveredControlCenter[] = [];

  for (const [path, module] of Object.entries(controlCenterModules)) {
    if (isControlCenterPlugin(module)) {
      discovered.push({
        manifest: module.manifest,
        plugin: module.plugin,
        sourcePath: path,
      });
    }
    // Skip non-control-center plugins silently (they're other UI plugins)
  }

  return discovered;
}

/**
 * Build plugin registrations for all discovered control centers.
 * Returns PluginRegistration objects that can be merged with bundle registrations.
 */
export async function discoverControlCenterRegistrations(): Promise<PluginRegistration[]> {
  const discovered = discoverControlCenters();
  const registrations: PluginRegistration[] = [];

  for (const { manifest, plugin, sourcePath } of discovered) {
    registrations.push({
      id: manifest.id,
      family: 'control-center',
      origin: 'builtin',
      source: 'source',
      label: manifest.name,
      register: async () => {
        await registerPluginDefinition({
          id: manifest.id,
          family: 'control-center',
          origin: 'builtin',
          source: 'source',
          plugin: { manifest, plugin },
          canDisable: false,
        });
        console.debug(`[ControlCenter] Registered ${manifest.id} from ${sourcePath}`);
      },
    });
  }

  return registrations;
}

/**
 * Bootstrap all control center plugins.
 * Discovers and registers all plugins, then loads user preference.
 */
export async function bootstrapControlCenters(): Promise<void> {
  console.info('[ControlCenter] Bootstrapping control center plugins...');

  const registrations = await discoverControlCenterRegistrations();
  for (const registration of registrations) {
    try {
      await registration.register();
    } catch (error) {
      console.error(`[ControlCenter] Failed to register ${registration.id}:`, error);
    }
  }

  // Load user preference after all plugins are registered
  const { controlCenterRegistry } = await import('./controlCenterPlugin');
  controlCenterRegistry.loadPreference();

  const active = controlCenterRegistry.getActiveId();
  const available = controlCenterRegistry.getAll();

  console.info(`[ControlCenter] Active = "${active}", Available = ${available.length}`);
  console.info(`[ControlCenter] Loaded ${registrations.length} control center plugin(s)`);
}
