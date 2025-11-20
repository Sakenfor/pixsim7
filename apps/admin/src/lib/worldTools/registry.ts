/**
 * World Tool Plugin Registry
 *
 * Central registry for world tools used in Game2D.
 * Import and register your custom tools here.
 */

import { worldToolRegistry } from './types';
import { builtInWorldTools } from '../../plugins/worldTools';

// Export the singleton registry
export { worldToolRegistry };

// Register built-in world tools
builtInWorldTools.forEach(tool => {
  worldToolRegistry.register(tool);
});
