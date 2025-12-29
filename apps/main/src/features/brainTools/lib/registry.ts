/**
 * Brain Tool Registry
 *
 * Central registry for brain tools used in NpcBrainLab.
 *
 * NOTE: This module no longer auto-registers tools on import.
 * Call registerBrainTools() explicitly during app initialization.
 *
 * @example
 * // In main.tsx or app initialization:
 * import { registerBrainTools } from '@features/brainTools/lib';
 * registerBrainTools();
 */

// Re-export registry and types
export { brainToolRegistry } from './types';
export type { BrainToolPlugin, BrainToolContext, BrainToolCategory } from './types';

// Export registration function
export { registerBrainTools } from './registerBrainTools';
