/**
 * Brain Tool Registry with Auto-Registration
 *
 * This module re-exports the brain tool registry and automatically
 * registers all built-in brain tools when imported.
 */

import { brainToolRegistry } from './types';
import { builtInBrainTools } from '../plugins';

// Auto-register all built-in brain tools
builtInBrainTools.forEach(tool => {
  brainToolRegistry.register(tool);
});

// Re-export registry and types
export { brainToolRegistry };
export type { BrainToolPlugin, BrainToolContext, BrainToolCategory } from './types';
