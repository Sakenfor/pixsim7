/**
 * Scene View Plugin Auto-Discovery
 *
 * Uses Vite's import.meta.glob for build-time discovery of scene view plugins.
 * Replaces hardcoded plugin imports with file-based auto-discovery.
 *
 * Convention:
 * - Scene view plugins live in `src/plugins/scene/`
 * - Each plugin is a folder with an `index.tsx` that exports:
 *   - `manifest: SceneViewPluginManifest`
 *   - `plugin: SceneViewPlugin`
 *   - `registerXxx(): Promise<void>` (optional, for manual registration)
 *
 * Directory structure:
 * ```
 * src/plugins/scene/
 * ├── comic-panel-view/
 * │   ├── index.tsx           # exports manifest, plugin
 * │   ├── manifest.ts
 * │   └── PluginSceneView.tsx
 * └── visual-novel-view/      # (future)
 *     ├── index.tsx
 *     └── ...
 * ```
 */

import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';
import type { SceneViewPlugin, SceneViewPluginManifest } from '@lib/plugins/sceneViewPlugin';

import type { PluginRegistration } from './registration';

/**
 * Scene view plugin module shape.
 */
interface SceneViewPluginModule {
  manifest: SceneViewPluginManifest;
  plugin: SceneViewPlugin;
}

/**
 * Discovered scene view with metadata.
 */
export interface DiscoveredSceneView {
  manifest: SceneViewPluginManifest;
  plugin: SceneViewPlugin;
  sourcePath: string;
}

/**
 * Import all scene view plugin modules using Vite's glob import.
 * This is evaluated at build time.
 */
const sceneViewModules = import.meta.glob<SceneViewPluginModule>(
  ['../../plugins/scene/*/index.tsx'],
  { eager: true }
);

/**
 * Discover all scene view plugins from the plugins directory.
 */
export function discoverSceneViews(): DiscoveredSceneView[] {
  const discovered: DiscoveredSceneView[] = [];

  for (const [path, module] of Object.entries(sceneViewModules)) {
    if (module.manifest && module.plugin) {
      discovered.push({
        manifest: module.manifest,
        plugin: module.plugin,
        sourcePath: path,
      });
    } else {
      console.warn(`[SceneView] Plugin at ${path} missing manifest or plugin export`);
    }
  }

  return discovered;
}

/**
 * Build plugin registrations for all discovered scene views.
 * Returns PluginRegistration objects that can be merged with bundle registrations.
 */
export async function discoverSceneViewRegistrations(): Promise<PluginRegistration[]> {
  const discovered = discoverSceneViews();
  const registrations: PluginRegistration[] = [];

  for (const { manifest, plugin, sourcePath } of discovered) {
    registrations.push({
      id: manifest.id,
      family: 'scene-view',
      origin: 'builtin',
      source: 'source',
      label: manifest.name,
      register: async () => {
        await registerPluginDefinition({
          id: manifest.id,
          family: 'scene-view',
          origin: 'builtin',
          source: 'source',
          plugin: { manifest, plugin },
          canDisable: false,
        });
        console.debug(`[SceneView] Registered ${manifest.id} from ${sourcePath}`);
      },
    });
  }

  return registrations;
}

/**
 * Bootstrap all scene view plugins.
 * Discovers and registers all plugins from the scene directory.
 */
export async function bootstrapSceneViewPlugins(): Promise<void> {
  console.info('[SceneView] Bootstrapping scene view plugins...');

  const registrations = await discoverSceneViewRegistrations();
  for (const registration of registrations) {
    try {
      await registration.register();
    } catch (error) {
      console.error(`[SceneView] Failed to register ${registration.id}:`, error);
    }
  }

  console.info(`[SceneView] Loaded ${registrations.length} scene view plugin(s)`);
}
