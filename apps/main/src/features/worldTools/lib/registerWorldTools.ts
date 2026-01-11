/**
 * World Tools Registration
 *
 * Registers all available world tools with the registry.
 * Called once at application startup.
 *
 * This follows the same explicit registration pattern as Gallery tools,
 * which provides better control over initialization timing and testability.
 */

import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';
import { debugFlags } from '@lib/utils/debugFlags';

import { builtInWorldTools } from '../plugins';

import { worldToolRegistry } from './types';

/**
 * Register all world tools
 *
 * This should be called once during application initialization.
 */
export async function registerWorldTools(): Promise<void> {
  // Register built-in tools from the plugins folder
  for (const tool of builtInWorldTools) {
    if (!worldToolRegistry.has(tool.id)) {
      await registerPluginDefinition({
        id: tool.id,
        family: 'world-tool',
        origin: 'builtin',
        source: 'source',
        plugin: tool,
        canDisable: false,
      });
    }
  }

  debugFlags.log('registry', `[WorldTools] Registered ${worldToolRegistry.size} world tool(s)`);
}
