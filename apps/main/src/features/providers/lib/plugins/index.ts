/**
 * Provider-specific generation UI plugins
 *
 * This module auto-registers all provider-specific plugins.
 * Import this module early in your app to ensure plugins are available.
 */

import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';

import { pixversePlugin } from './PixversePlugin';
import { soraPlugin } from './SoraPlugin';

/**
 * Register all provider plugins
 */
export async function registerProviderPlugins(): Promise<void> {
  const plugins = [pixversePlugin, soraPlugin];

  for (const plugin of plugins) {
    await registerPluginDefinition({
      id: plugin.id,
      family: 'generation-ui',
      origin: 'builtin',
      source: 'source',
      plugin,
      canDisable: false,
    });
  }
}

/**
 * Export plugins for direct access if needed
 */
export { pixversePlugin, soraPlugin };
