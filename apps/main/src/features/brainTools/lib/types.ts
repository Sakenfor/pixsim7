/**
 * Brain Tool Plugin Types
 *
 * Provides an extension point for new brain lab tools without modifying core NpcBrainLab code.
 * Tools can add features like:
 * - Trait visualization
 * - Mood timeline
 * - Memory browser
 * - Social relationship analysis
 * - Custom brain state analyzers
 *
 * Uses data-driven BrainState that adapts to whatever stat packages a world uses.
 *
 * Extends ToolRegistryBase for shared tool registry functionality.
 */

import type { BrainToolContext, BrainToolPlugin } from '@pixsim7/shared.ui.tools';

import { ToolRegistryBase } from '@lib/core/ToolRegistryBase';

// Re-export shared contracts for backwards compatibility
export type {
  BrainToolContext,
  BrainToolCategory,
  BrainToolPlugin,
} from '@pixsim7/shared.ui.tools';

/**
 * Brain tool registry
 *
 * Extends ToolRegistryBase with brain-specific functionality.
 *
 * Inherits from ToolRegistryBase:
 * - Tool validation on register
 * - Category filtering
 * - Visibility predicates with error isolation
 */
export class BrainToolRegistry extends ToolRegistryBase<BrainToolPlugin, BrainToolContext> {
  protected readonly toolTypeName = 'Brain';
}

/**
 * Singleton instance
 */
export const brainToolRegistry = new BrainToolRegistry();
