/**
 * Plugin Bootstrap
 *
 * Hard-wires example plugins for initial testing.
 * In the future, this will be replaced with dynamic loading from bundles.
 */

import { pluginManager } from './PluginManager';
import { manifest, RelationshipTrackerPlugin } from './examples/RelationshipTracker.plugin';
import type { Plugin } from './types';

/**
 * Bootstrap example plugins
 * This installs and enables the RelationshipTracker plugin for demo purposes
 */
export async function bootstrapExamplePlugins(): Promise<void> {
  try {
    // Check if already installed
    const existing = pluginManager.getPlugin(manifest.id);
    if (existing) {
      console.info(`Plugin ${manifest.id} already installed, skipping bootstrap`);
      return;
    }

    console.info('Bootstrapping example plugins...');

    // Install the plugin
    await pluginManager.installPlugin(manifest, '// RelationshipTracker code');

    // Enable it by directly creating an instance (bypassing code loading)
    // This is a temporary hack until we implement proper code loading
    await bootstrapPluginInstance(manifest.id, new RelationshipTrackerPlugin());

    console.info('Example plugins bootstrapped successfully');
  } catch (error) {
    console.error('Failed to bootstrap example plugins:', error);
  }
}

/**
 * Temporary helper to enable a plugin with a pre-created instance
 * This bypasses the code loading system which is still TODO
 */
async function bootstrapPluginInstance(pluginId: string, instance: Plugin): Promise<void> {
  const entry = pluginManager['plugins'].get(pluginId);
  if (!entry) {
    throw new Error(`Plugin ${pluginId} not found`);
  }

  if (entry.state === 'enabled') {
    return; // Already enabled
  }

  try {
    // Create plugin API
    const api = pluginManager['createPluginAPI'](pluginId);

    // Call onEnable
    await instance.onEnable(api);

    // Store instance (access private field)
    pluginManager['instances'].set(pluginId, instance);

    // Update state
    entry.state = 'enabled';
    entry.enabledAt = Date.now();
    entry.error = undefined;

    // Save to localStorage
    pluginManager['savePluginRegistry']();

    console.info(`Plugin ${pluginId} enabled via bootstrap`);
  } catch (e: any) {
    entry.state = 'error';
    entry.error = String(e?.message ?? e);
    pluginManager['savePluginRegistry']();
    throw new Error(`Failed to enable plugin ${pluginId}: ${entry.error}`);
  }
}
