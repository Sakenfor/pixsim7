/**
 * Plugin Bootstrap
 *
 * Auto-enables previously enabled plugins on startup.
 */

import { pluginManager } from './PluginManager';

let bootstrapped = false;

/**
 * Bootstrap plugins
 * This re-enables plugins that were enabled in the previous session
 */
export async function bootstrapExamplePlugins(force = false): Promise<void> {
  if (bootstrapped && !force) {
    if (import.meta.env?.DEV) {
      console.warn(
        '[Plugins] bootstrapExamplePlugins called more than once',
        new Error('Duplicate bootstrapExamplePlugins call').stack
      );
    }
    return;
  }
  bootstrapped = true;
  try {
    console.info('Bootstrapping plugins...');

    // Get all plugins from registry
    const plugins = pluginManager.getPlugins();

    // Re-enable plugins that were previously enabled
    for (const plugin of plugins) {
      if (plugin.state === 'enabled') {
        try {
          console.info(`Re-enabling plugin: ${plugin.manifest.id}`);
          await pluginManager.enablePlugin(plugin.manifest.id);
        } catch (error) {
          console.error(`Failed to re-enable plugin ${plugin.manifest.id}:`, error);
        }
      }
    }

    console.info('Plugin bootstrap complete');
  } catch (error) {
    console.error('Failed to bootstrap plugins:', error);
  }
}
