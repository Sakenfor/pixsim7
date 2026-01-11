/**
 * Brain Tools Registration
 *
 * Registers all available brain tools with the registry.
 * Called once at application startup.
 *
 * This follows the same explicit registration pattern as Gallery tools,
 * which provides better control over initialization timing and testability.
 */

import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';

import { builtInBrainTools } from '../plugins';

import { brainToolRegistry } from './types';

/**
 * Register all brain tools
 *
 * This should be called once during application initialization.
 */
export async function registerBrainTools(): Promise<void> {
  // Register built-in tools from the plugins folder
  for (const tool of builtInBrainTools) {
    if (!brainToolRegistry.has(tool.id)) {
      await registerPluginDefinition({
        id: tool.id,
        family: 'brain-tool',
        origin: 'builtin',
        source: 'source',
        plugin: tool,
        canDisable: false,
      });
    }
  }

  console.log(`[BrainTools] Registered ${brainToolRegistry.size} brain tool(s)`);
}
