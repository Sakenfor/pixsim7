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
import type {
  GameSessionDTO,
  GameWorldDetail,
  GameLocationDetail,
  NpcPresenceDTO,
} from '../api/game';
import type { NpcSlotAssignment } from '@pixsim7/game-core';

/**
 * World time representation
 */
export interface WorldTime {
  day: number;
  hour: number;
}

/**
 * World tool context available to plugins
 */
export interface WorldToolContext {
  /** Current game session (may be null if no session created yet) */
  session: GameSessionDTO | null;

  /** Session flags for gameplay customization */
  sessionFlags: Record<string, unknown>;

  /** NPC relationships state */
  relationships: Record<string, unknown>;

  /** Current world detail */
  worldDetail: GameWorldDetail | null;

  /** Current world time */
  worldTime: WorldTime;

  /** Current location detail */
  locationDetail: GameLocationDetail | null;

  /** NPCs present at current location */
  locationNpcs: NpcPresenceDTO[];

  /** NPC slot assignments for current location */
  npcSlotAssignments: NpcSlotAssignment[];

  /** Selected world ID */
  selectedWorldId: number | null;

  /** Selected location ID */
  selectedLocationId: number | null;

  /** Active NPC ID */
  activeNpcId: number | null;
}

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
    console.log(`✓ Registered world tool: ${tool.id}`);
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
 * Visibility condition for HUD tool placement
 */
export interface HudVisibilityCondition {
  /** Type of condition */
  kind: 'capability' | 'flag' | 'session' | 'location' | 'time' | 'quest' | 'relationship' | 'composite';
  /** Identifier for the condition (e.g., capability ID, flag path, location ID) */
  id: string;
  /** For 'time' condition: day of week (0-6) or 'any' */
  dayOfWeek?: number | 'any';
  /** For 'time' condition: hour range [start, end] (24-hour format) */
  hourRange?: [number, number];
  /** For 'relationship' condition: minimum relationship level (0-100) */
  minRelationship?: number;
  /** For 'composite' condition: logical operator */
  operator?: 'AND' | 'OR';
  /** For 'composite' condition: nested conditions */
  conditions?: HudVisibilityCondition[];
}

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

  /** Additional UI configuration */
  [key: string]: unknown;
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
  /** Timestamp when preferences were last updated */
  lastUpdated: number;
}
