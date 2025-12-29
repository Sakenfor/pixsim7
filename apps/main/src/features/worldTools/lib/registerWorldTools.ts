/**
 * World Tools Registration
 *
 * Registers all available world tools with the registry.
 * Called once at application startup.
 *
 * This follows the same explicit registration pattern as Gallery tools,
 * which provides better control over initialization timing and testability.
 */

import { debugFlags } from '@lib/utils/debugFlags';
import { worldToolRegistry } from './types';
import { builtInWorldTools } from '../plugins';

/**
 * Register all world tools
 *
 * This should be called once during application initialization.
 */
export function registerWorldTools(): void {
  // Register built-in tools from the plugins folder
  builtInWorldTools.forEach(tool => {
    if (!worldToolRegistry.has(tool.id)) {
      worldToolRegistry.register(tool);
    }
  });

  debugFlags.log('registry', `✓ Registered ${worldToolRegistry.size} world tool(s)`);
}
