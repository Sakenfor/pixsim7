/**
 * Shared UI Tool Plugin Contracts
 *
 * Defines interfaces for UI tool plugins (panels/widgets) that render in the
 * application interface. Domain-specific registries extend these with
 * additional properties.
 *
 * NOT to be confused with:
 * - InteractiveTool (scene gizmos) - physical interaction tools in 3D scenes
 * - RegionDrawer (viewer/overlay) - drawing tools for image annotation
 */

import type { ReactNode } from 'react';
import type {
  BrainState,
  GameSessionDTO,
  GameWorldDetail,
  GameLocationDetail,
  NpcPresenceDTO,
} from '@pixsim7/shared.types';
import type { MinimalAsset } from '@pixsim7/shared.assets.core';

// ============================================================================
// Base Tool Plugin Contract
// ============================================================================

/**
 * Identifiable interface for registry items.
 */
export interface Identifiable {
  id: string;
}

/**
 * Base interface for UI tool plugins.
 *
 * UI tools are panels/widgets that render in the application interface.
 * Domain-specific registries extend this with additional properties
 * (e.g., GalleryToolPlugin adds `supportedSurfaces`).
 *
 * @typeParam TContext - The context type passed to render/whenVisible/onMount
 */
export interface ToolPlugin<TContext = unknown> extends Identifiable {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** Short description */
  description?: string;

  /** Icon (emoji or icon name) */
  icon?: string;

  /** Category for grouping tools (type varies by registry) */
  category?: string;

  /**
   * Predicate to determine when this tool should be visible.
   * @returns true if the tool should be shown
   */
  whenVisible?: (context: TContext) => boolean;

  /**
   * Render the tool UI.
   * @param context - Current context (type varies by registry)
   */
  render: (context: TContext) => ReactNode;

  /** Optional: Initialize the tool when mounted */
  onMount?: (context: TContext) => void | Promise<void>;

  /** Optional: Cleanup when tool is unmounted */
  onUnmount?: () => void | Promise<void>;
}

/**
 * Preferred alias for ToolPlugin.
 * Use this in new code to distinguish from scene gizmos and other "tool" types.
 */
export type UiToolPlugin<TContext = unknown> = ToolPlugin<TContext>;

// ============================================================================
// Brain Tool Contracts
// ============================================================================

/**
 * Brain tool context available to plugins.
 *
 * brainState is data-driven - access stats via brain.stats[statDefId]
 * and derived values via brain.derived[key].
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
 * Brain tool category for grouping tools.
 */
export type BrainToolCategory =
  | 'traits'
  | 'mood'
  | 'social'
  | 'memories'
  | 'debug'
  | 'custom';

/**
 * Brain tool plugin definition.
 *
 * Extends the base ToolPlugin with brain-specific properties.
 */
export interface BrainToolPlugin extends ToolPlugin<BrainToolContext> {
  /** Category for grouping tools */
  category?: BrainToolCategory;
}

// ============================================================================
// Gallery Tool Contracts
// ============================================================================

/**
 * Gallery context available to tools.
 *
 * Generic over asset type to allow app-specific asset models.
 */
export interface GalleryToolContext<TAsset extends MinimalAsset = MinimalAsset> {
  /** Currently visible assets in the gallery */
  assets: TAsset[];

  /** Currently selected assets (if any) */
  selectedAssets: TAsset[];

  /** Current filter state */
  filters: {
    q?: string;
    tag?: string;
    provider_id?: string;
    sort?: 'new' | 'old' | 'alpha';
    media_type?: string;
  };

  /** Trigger a refresh of the asset list */
  refresh: () => void;

  /** Update filters */
  updateFilters: (filters: Record<string, unknown>) => void;

  /** Asset picker mode */
  isSelectionMode: boolean;
}

/**
 * Gallery tool category for grouping tools.
 */
export type GalleryToolCategory = 'visualization' | 'automation' | 'analysis' | 'utility';

/**
 * Gallery UI tool plugin definition.
 *
 * Extends the base ToolPlugin with gallery-specific properties.
 * Generic over asset type to allow app-specific asset models.
 */
export interface GalleryToolPlugin<TAsset extends MinimalAsset = MinimalAsset>
  extends ToolPlugin<GalleryToolContext<TAsset>> {
  /** Short description (required for gallery tools) */
  description: string;

  /** Category for grouping tools */
  category?: GalleryToolCategory;

  /**
   * Gallery surfaces this tool supports.
   * If undefined, defaults to ['assets-default'] for backwards compatibility.
   */
  supportedSurfaces?: string[];
}

/**
 * Preferred alias for GalleryToolPlugin.
 */
export type GalleryUiToolPlugin<TAsset extends MinimalAsset = MinimalAsset> = GalleryToolPlugin<TAsset>;

// ============================================================================
// World Tool Contracts
// ============================================================================

/**
 * World time representation.
 */
export interface WorldTime {
  day: number;
  hour: number;
}

/**
 * World tool context available to plugins.
 *
 * Generic over slot assignment type to allow app-specific NPC assignment models.
 */
export interface WorldToolContext<TSlotAssignment = unknown> {
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
  npcSlotAssignments: TSlotAssignment[];

  /** Selected world ID */
  selectedWorldId: number | null;

  /** Selected location ID */
  selectedLocationId: number | null;

  /** Active NPC ID */
  activeNpcId: number | null;
}

/**
 * World tool category for grouping tools.
 */
export type WorldToolCategory = 'character' | 'world' | 'quest' | 'inventory' | 'debug' | 'utility';

/**
 * World UI tool plugin definition.
 *
 * Extends the base ToolPlugin with world-specific properties.
 * Generic over slot assignment type to allow app-specific NPC assignment models.
 */
export interface WorldToolPlugin<TSlotAssignment = unknown>
  extends ToolPlugin<WorldToolContext<TSlotAssignment>> {
  /** Short description (required for world tools) */
  description: string;

  /** Category for grouping tools */
  category?: WorldToolCategory;
}

/**
 * Preferred alias for WorldToolPlugin.
 */
export type WorldUiToolPlugin<TSlotAssignment = unknown> = WorldToolPlugin<TSlotAssignment>;
