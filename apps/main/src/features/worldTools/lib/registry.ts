/**
 * World Tool Plugin Registry
 *
 * Central registry for world tools used in Game2D.
 *
 * NOTE: This module no longer auto-registers tools on import.
 * Call registerWorldTools() explicitly during app initialization.
 *
 * @example
 * // In main.tsx or app initialization:
 * import { registerWorldTools } from '@features/worldTools/lib';
 * registerWorldTools();
 */

// Export the singleton registry
export { worldToolRegistry } from './types';
export type { WorldToolPlugin, WorldToolContext, WorldToolCategory } from './types';

// Export registration function
export { registerWorldTools } from './registerWorldTools';
