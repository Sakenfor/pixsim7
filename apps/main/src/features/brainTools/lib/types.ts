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

import type { ReactNode } from 'react';

import { ToolRegistryBase, type ToolPlugin } from '@lib/core/ToolRegistryBase';
import type { BrainState } from '@lib/core/types';
import type { GameSessionDTO } from '../api/game';

/**
 * Brain tool context available to plugins
 *
 * brainState is now data-driven - access stats via brain.stats[statDefId]
 * and derived values via brain.derived[key]
 */
export interface BrainToolContext {
  /** Selected NPC ID (may be null if no NPC selected) */
  npcId: number | null;

  /** Current game session (may be null if no session loaded) */
  session: GameSessionDTO | null;

  /** Data-driven brain state for selected NPC (may be null if not loaded) */
  brainState: BrainState | null;
}

/**
 * Brain tool category for grouping tools
 */
export type BrainToolCategory =
  | 'traits'
  | 'mood'
  | 'social'
  | 'memories'
  | 'debug'
  | 'custom';

/**
 * Brain tool plugin definition
 *
 * Extends the base ToolPlugin with brain-specific properties.
 */
export interface BrainToolPlugin extends ToolPlugin {
  /** Category for grouping tools */
  category?: BrainToolCategory;

  /**
   * Predicate to determine when this tool should be visible
   * @returns true if the tool should be shown
   */
  whenVisible?: (context: BrainToolContext) => boolean;

  /**
   * Render the tool UI
   * @param context - Current brain context
   */
  render: (context: BrainToolContext) => ReactNode;

  /** Optional: Initialize the tool when mounted */
  onMount?: (context: BrainToolContext) => void | Promise<void>;

  /** Optional: Cleanup when tool is unmounted */
  onUnmount?: () => void | Promise<void>;
}

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
