/**
 * Brain Tools Feature Module
 *
 * NPC brain inspection tools (NPC Brain Lab route, brain tools plugins, registry/types).
 *
 * @example
 * ```typescript
 * // Import from barrel
 * import { NpcBrainLab, brainToolRegistry } from '@features/brainTools';
 *
 * // Or import specific modules
 * import { traitsTool } from '@features/brainTools/plugins/traits';
 * import type { BrainToolPlugin } from '@features/brainTools/lib/types';
 * ```
 */

// ============================================================================
// Components
// ============================================================================

export { NpcBrainLab, type NpcBrainLabProps } from './components/NpcBrainLab';

// ============================================================================
// Lib - Registry and Types
// ============================================================================

export { brainToolRegistry } from './lib/registry';
export type { BrainToolPlugin, BrainToolContext, BrainToolCategory } from './lib/types';

// ============================================================================
// Plugins
// ============================================================================

export {
  traitsTool,
  moodTool,
  behaviorTool,
  socialTool,
  memoriesTool,
  logicTool,
  instinctTool,
  builtInBrainTools,
} from './plugins';
