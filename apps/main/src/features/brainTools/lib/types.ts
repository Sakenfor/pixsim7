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
 * Extends BaseRegistry for standard CRUD operations and listener support.
 */

import type { ReactNode } from 'react';

import { BaseRegistry, type Identifiable } from '@lib/core/BaseRegistry';
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
 */
export interface BrainToolPlugin extends Identifiable {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** Short description */
  description?: string;

  /** Icon (emoji or icon name) */
  icon?: string;

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
 * Extends BaseRegistry with brain-specific functionality:
 * - Tool validation on register
 * - Category filtering
 * - Visibility predicates with error isolation
 */
export class BrainToolRegistry extends BaseRegistry<BrainToolPlugin> {
  /**
   * Register a brain tool plugin
   */
  register(tool: BrainToolPlugin): boolean {
    // Validate required fields
    if (!tool.id || !tool.name || !tool.render) {
      throw new Error('Brain tool must have id, name, and render properties');
    }

    if (this.has(tool.id)) {
      console.warn(`Brain tool "${tool.id}" is already registered. Overwriting.`);
    }

    this.forceRegister(tool);
    console.log(`✓ Registered brain tool: ${tool.id}`);
    return true;
  }

  /**
   * Get tools by category
   */
  getByCategory(category: BrainToolPlugin['category']): BrainToolPlugin[] {
    return this.getAll().filter(tool => tool.category === category);
  }

  /**
   * Get visible tools for current context
   */
  getVisible(context: BrainToolContext): BrainToolPlugin[] {
    return this.getAll().filter(tool => {
      if (!tool.whenVisible) return true;
      try {
        return tool.whenVisible(context);
      } catch (e) {
        console.error(`Error checking visibility for tool ${tool.id}:`, e);
        return false;
      }
    });
  }
}

/**
 * Singleton instance
 */
export const brainToolRegistry = new BrainToolRegistry();
