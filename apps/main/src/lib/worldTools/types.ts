/**
 * World Tool Plugin Types
 *
 * Provides an extension point for new world tools (like RelationshipDashboard, QuestLog, etc.)
 * without modifying core Game2D code.
 * Tools can add features like:
 * - Relationship visualizations
 * - Quest tracking and management
 * - Inventory management
 * - Custom world state analyzers
 * - Character sheets and stats
 */

import type { ReactNode } from 'react';
import { debugFlags } from '@/lib/debugFlags';
import type {
  GameSessionDTO,
  GameWorldDetail,
  GameLocationDetail,
  NpcPresenceDTO,
} from '../api/game';
import type { NpcSlotAssignment } from '@pixsim7/game.engine';

/**
 * Re-export context types from separate file to avoid circular dependencies
 */

export type { WorldTime, WorldToolContext } from './context';

/**
 * World tool plugin definition
 */
export interface WorldToolPlugin {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** Short description */
  description: string;

  /** Icon (emoji or icon name) */
  icon?: string;

  /** Category for grouping tools */
  category?: 'character' | 'world' | 'quest' | 'inventory' | 'debug' | 'utility';

  /**
   * Predicate to determine when this tool should be visible
   * @returns true if the tool should be shown
   */
  whenVisible?: (context: WorldToolContext) => boolean;

  /**
   * Render the tool UI
   * @param context - Current world context
   */
  render: (context: WorldToolContext) => ReactNode;

  /** Optional: Initialize the tool when mounted */
  onMount?: (context: WorldToolContext) => void | Promise<void>;

  /** Optional: Cleanup when tool is unmounted */
  onUnmount?: () => void | Promise<void>;
}

/**
 * World tool registry
 */
export class WorldToolRegistry {
  private tools = new Map<string, WorldToolPlugin>();

  /**
   * Register a world tool plugin
   */
  register(tool: WorldToolPlugin): void {
    if (this.tools.has(tool.id)) {
      console.warn(`World tool "${tool.id}" is already registered. Overwriting.`);
    }

    // Validate
    if (!tool.id || !tool.name || !tool.render) {
      throw new Error('World tool must have id, name, and render properties');
    }

    this.tools.set(tool.id, tool);
    debugFlags.log('registry', `✓ Registered world tool: ${tool.id}`);
  }

  /**
   * Unregister a tool
   */
  unregister(id: string): boolean {
    return this.tools.delete(id);
  }

  /**
   * Get a specific tool by ID
   */
  get(id: string): WorldToolPlugin | undefined {
    return this.tools.get(id);
  }

  /**
   * Get all registered tools
   */
  getAll(): WorldToolPlugin[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getByCategory(category: WorldToolPlugin['category']): WorldToolPlugin[] {
    return this.getAll().filter(tool => tool.category === category);
  }

  /**
   * Get visible tools for current context
   */
  getVisible(context: WorldToolContext): WorldToolPlugin[] {
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

  /**
   * Clear all tools (useful for testing)
   */
  clear(): void {
    this.tools.clear();
  }
}

/**
 * Singleton instance
 */
export const worldToolRegistry = new WorldToolRegistry();

// ===================
// HUD Layout Configuration Types
// ===================

/**
 * Re-export HudVisibilityCondition from gameplay-ui-core (circular dependency now resolved)
 */

export type { HudVisibilityCondition } from '../gameplay-ui-core/hudVisibility';

/**
 * Region where a tool can be placed in the HUD
 */
export type HudRegion = 'left' | 'right' | 'top' | 'bottom' | 'overlay';

/**
 * Tool size variants for layout control
 */
export type HudToolSize = 'compact' | 'normal' | 'expanded';

/**
 * Configuration for placing a world tool in the HUD
 */
export interface HudToolPlacement {
  /** World tool plugin ID */
  toolId: string;
  /** Region where the tool should appear */
  region: HudRegion;
  /** Display order within the region (lower numbers first) */
  order?: number;
  /** Optional visibility condition */
  visibleWhen?: HudVisibilityCondition;

  // Phase 6: Enhanced Layout Controls
  /** Tool size variant (default: 'normal') */
  size?: HudToolSize;
  /** Start collapsed/minimized (default: false) */
  defaultCollapsed?: boolean;
  /** Z-index for overlay region (higher values appear on top) */
  zIndex?: number;
  /** Group ID for visually grouping related tools */
  groupId?: string;
  /** Custom CSS class name for advanced styling */
  customClassName?: string;
}

/**
 * World UI configuration stored in GameWorld.meta.ui
 */
export interface WorldUiConfig {
  /** HUD tool layout configuration (default layout) */
  hud?: HudToolPlacement[];

  // Phase 10: Template & Inheritance System
  /** Named layout variants (e.g., 'combat', 'dialogue', 'exploration') */
  hudLayouts?: Record<string, HudToolPlacement[]>;
  /** Currently active layout variant name */
  activeLayout?: string;
  /** Preset ID to inherit base layout from */
  inheritFrom?: string;
  /** Only tools that differ from inherited layout (when using inheritance) */
  overrides?: HudToolPlacement[];

  // Phase 6: Per-profile layouts
  /** Profile-specific layouts - key format: "profileId:viewMode" or "profileId" */
  profileLayouts?: Record<string, HudToolPlacement[]>;

  // Phase 7: Shared world-scoped presets
  /** World-scoped HUD presets that can be shared across all users of this world */
  worldPresets?: Array<{
    id: string;
    name: string;
    description?: string;
    placements: HudToolPlacement[];
    createdAt: number;
    updatedAt: number;
  }>;

  /** Additional UI configuration */
  [key: string]: unknown;
}

/**
 * Phase 6: HUD Profile definition
 * Represents a named HUD configuration profile (e.g., 'default', 'minimal', 'streamer')
 */
export interface HudProfile {
  /** Unique profile ID */
  id: string;
  /** Display name */
  name: string;
  /** Optional description */
  description?: string;
  /** Icon or emoji */
  icon?: string;
}

/**
 * Player-specific HUD preferences (stored separately from world config)
 * Stored in localStorage per player/user
 */
export interface PlayerHudPreferences {
  /** Player/user identifier */
  userId?: string;
  /** World ID these preferences apply to */
  worldId: number;
  /** Tools manually hidden by player */
  hiddenTools?: string[];
  /** Player's preferred view mode override */
  viewModeOverride?: 'cinematic' | 'hud-heavy' | 'debug';
  /** Tool-specific overrides (size, position adjustments) */
  toolOverrides?: Record<string, Partial<HudToolPlacement>>;
  /** Phase 6: Active HUD profile ID (e.g., 'default', 'minimal', 'streamer') */
  activeProfileId?: string;
  /** Timestamp when preferences were last updated */
  lastUpdated: number;
}
