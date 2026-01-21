/**
 * World UI Tool Plugin Types
 *
 * Provides an extension point for world UI panels (like RelationshipDashboard, QuestLog, etc.)
 * without modifying core Game2D code.
 *
 * ## Domain Clarification
 *
 * These are **UI tool plugins** - panels/widgets in the world view interface.
 * NOT to be confused with:
 * - `InteractiveTool` (scene gizmos) - physical interaction tools in 3D scenes
 * - `RegionDrawer` (viewer/overlay) - drawing tools for image annotation
 *
 * Tools can add features like:
 * - Relationship visualizations
 * - Quest tracking and management
 * - Inventory management
 * - Custom world state analyzers
 * - Character sheets and stats
 *
 * Extends ToolRegistryBase for shared UI tool registry functionality.
 *
 * @alias WorldUiToolPlugin - Preferred name for new code
 */

import type { NpcSlotAssignment } from '@pixsim7/game.engine';
import type { WorldToolPlugin as SharedWorldToolPlugin } from '@pixsim7/shared.ui.tools';

import { ToolRegistryBase } from '@lib/core/ToolRegistryBase';
import type { HudVisibilityCondition } from '@lib/gameplay-ui-core/hudVisibility';
import { debugFlags } from '@lib/utils/debugFlags';

// Re-export shared contracts
export type { WorldToolCategory } from '@pixsim7/shared.ui.tools';
export type { ViewMode } from '@pixsim7/shared.types';

// Re-export context types from separate file
export type { WorldTime, WorldToolContext } from './context';
import type { WorldToolContext } from './context';

/**
 * World UI tool plugin definition.
 * Specialized with app's NpcSlotAssignment type.
 */
export type WorldToolPlugin = SharedWorldToolPlugin<NpcSlotAssignment>;

/**
 * Preferred alias for WorldToolPlugin.
 * Use this in new code to distinguish from scene gizmos and other "tool" types.
 */
export type WorldUiToolPlugin = WorldToolPlugin;

/**
 * World tool registry
 *
 * Extends ToolRegistryBase with world-specific functionality.
 * Uses debugFlags for conditional logging.
 *
 * Inherits from ToolRegistryBase:
 * - Tool validation on register
 * - Category filtering
 * - Visibility predicates with error isolation
 */
export class WorldToolRegistry extends ToolRegistryBase<WorldToolPlugin, WorldToolContext> {
  protected readonly toolTypeName = 'World';

  /**
   * Register a world tool plugin
   * Overrides base to use debugFlags for conditional logging.
   */
  register(tool: WorldToolPlugin): boolean {
    // Validate required fields
    if (!tool.id || !tool.name || !tool.render) {
      throw new Error(`${this.toolTypeName} tool must have id, name, and render properties`);
    }

    if (this.has(tool.id)) {
      console.warn(`${this.toolTypeName} tool "${tool.id}" is already registered. Overwriting.`);
    }

    this.forceRegister(tool);
    debugFlags.log('registry', `Registered world tool: ${tool.id}`);
    return true;
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
export type { HudVisibilityCondition } from '@lib/gameplay-ui-core/hudVisibility';

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
