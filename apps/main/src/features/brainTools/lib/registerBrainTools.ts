/**
 * Brain Tools Registration
 *
 * Registers all available brain tools with the registry.
 * Called once at application startup.
 *
 * This follows the same explicit registration pattern as Gallery tools,
 * which provides better control over initialization timing and testability.
 */

import { brainToolRegistry } from './types';
import { builtInBrainTools } from '../plugins';

/**
 * Register all brain tools
 *
 * This should be called once during application initialization.
 */
export function registerBrainTools(): void {
  // Register built-in tools from the plugins folder
  builtInBrainTools.forEach(tool => {
    if (!brainToolRegistry.has(tool.id)) {
      brainToolRegistry.register(tool);
    }
  });

  console.log(`✓ Registered ${brainToolRegistry.size} brain tool(s)`);
}
