/**
 * Game DTO types for PixSim7 game systems
 * Shared between frontend and game-core
 *
 * ## Type Sources
 *
 * This file contains two categories of types:
 *
 * 1. **API DTOs (aliased from OpenAPI)**: Types that match backend Pydantic models.
 *    These are aliased from `openapi.generated.ts` to avoid duplication.
 *    Look for: `export type Foo = ApiComponents['schemas']['Foo']`
 *
 * 2. **Frontend-only types**: Types used only in frontend/game-core that have no
 *    backend equivalent. These are defined directly here.
 *    Look for: `// [frontend-only]` comments
 *
 * ## Avoiding Drift
 *
 * When adding new types, check if they exist in OpenAPI first:
 *   grep "readonly YourTypeName:" packages/shared/types/src/openapi.generated.ts
 *
 * If they do, alias them instead of duplicating.
 *
 * TODO: Add a lint rule or test to detect when a manually-defined interface
 * shares a name with an OpenAPI schema (drift detection).
 */

import type { NpcId, WorldId, SessionId, LocationId, SceneId } from './ids';
import type { components as ApiComponents } from './openapi.generated';

// ===================
// Spatial Model Types [frontend-only]
// ===================

/**
 * 3D position coordinates
 * z is optional to support 2D-first workflows
 */
export interface Position3D {
  x: number;
  y: number;
  z?: number;
}

/**
 * 3D orientation using Euler angles (in degrees)
 * All fields optional to support 2D (yaw-only) and partial rotations
 */
export interface Orientation {
  /** Rotation around Y axis (heading) - primary rotation for 2D */
  yaw?: number;
  /** Rotation around X axis (elevation) */
  pitch?: number;
  /** Rotation around Z axis (tilt/bank) */
  roll?: number;
}

/**
 * 3D scale factors
 * Defaults to uniform scale of 1.0 if not specified
 */
export interface Scale {
  x?: number;
  y?: number;
  z?: number;
}

/**
 * Coordinate space identifier
 * Helps renderers and editors treat transforms differently
 * - 'world_2d': 2D top-down or side-view (z=0 or ignored)
 * - 'world_3d': Full 3D space with all axes
 * - 'ui_2d': UI overlay coordinates (screen space)
 */
export type CoordinateSpace = 'world_2d' | 'world_3d' | 'ui_2d';

/**
 * Transform - generic spatial component
 *
 * Represents position, orientation, and scale of an object in space.
 * Designed to be 2D-first (just x, y, yaw) but 3D-capable (add z, pitch, roll).
 *
 * Design notes:
 * - 2D workflows: use x, y, and optionally yaw; leave z, pitch, roll undefined
 * - 3D workflows: use x, y, z and full orientation
 * - Location context: worldId or locationId determines which space we're in
 * - Future: could add parentId for hierarchical transforms (relative positioning)
 *
 * @example
 * // 2D NPC placement
 * const transform2d: Transform = {
 *   worldId: WorldId(1),
 *   locationId: LocationId(42),
 *   position: { x: 100, y: 50 },
 *   orientation: { yaw: 90 }, // facing right
 *   space: 'world_2d'
 * };
 *
 * @example
 * // 3D prop placement
 * const transform3d: Transform = {
 *   worldId: WorldId(1),
 *   locationId: LocationId(42),
 *   position: { x: 10, y: 2, z: 5 },
 *   orientation: { yaw: 45, pitch: -15, roll: 0 },
 *   scale: { x: 1.5, y: 1.5, z: 1.5 },
 *   space: 'world_3d'
 * };
 */
export interface Transform {
  /** World this transform belongs to */
  worldId: WorldId;
  /** Location within the world (optional - use for local coordinates) */
  locationId?: LocationId;
  /** Position in 3D space (z optional for 2D) */
  position: Position3D;
  /** Orientation in 3D space (all optional) */
  orientation?: Orientation;
  /** Scale factors (all optional, default 1.0) */
  scale?: Scale;
  /** Coordinate space hint for renderers */
  space?: CoordinateSpace;
}

/**
 * Entity kind discriminator for spatial objects
 * Extensible - add new kinds as needed without schema changes
 */
export type SpatialObjectKind =
  | 'npc'
  | 'player'
  | 'item'
  | 'prop'
  | 'trigger'
  | 'spawn'
  | 'camera'
  | 'light'
  | (string & {}); // Allow custom kinds

/**
 * SpatialObject - base shape for placeable objects
 *
 * Not a runtime class - just a shared shape/interface that NPCs, items, props, etc.
 * can embed or map to. Think of it as a "spatial component" pattern.
 *
 * Design notes:
 * - This is NOT inheritance - it's a component/shape that entities can adopt
 * - NPC/Item/Prop DTOs can include a `spatial: SpatialObject` field
 * - Or they can directly embed these fields in their own structure
 * - Tags help editors filter and categorize objects (e.g., ["interactive", "decoration"])
 *
 * Future: Could extend with physics properties (collider, rigidbody, etc.)
 *
 * @example
 * // NPC with spatial data
 * interface NpcWithSpatial extends GameNpcDetail {
 *   spatial: SpatialObject;
 * }
 *
 * @example
 * // Item as spatial object
 * const coin: SpatialObject = {
 *   id: 123,
 *   kind: 'item',
 *   transform: { worldId: WorldId(1), position: { x: 50, y: 30 } },
 *   tags: ['collectible', 'treasure']
 * };
 */
export interface SpatialObject {
  /** Entity ID (use branded IDs like NpcId, ItemId, etc.) */
  id: number;
  /** Kind of object for filtering and behavior */
  kind: SpatialObjectKind;
  /** Spatial transform (position, rotation, scale) */
  transform: Transform;
  /** Optional tags for editor filtering and categorization */
  tags?: string[];
  /** Optional metadata for extensions */
  meta?: Record<string, unknown>;
}

// ===================
// Generic GameObject Types [frontend-only]
// ===================

/**
 * GameObjectBase - shared composition shape for all game entities
 *
 * This is the foundation for a data-driven, entity-agnostic object system.
 * All game entities (NPCs, items, props, players, triggers) compose this shape.
 *
 * Design principles:
 * - Composition, not inheritance
 * - Discriminated unions for type safety
 * - Entity-agnostic mapping and services
 * - 2D-first, 3D-ready via Transform
 *
 * @example
 * // NPC object
 * const npc: NpcObject = {
 *   kind: 'npc',
 *   id: 123,
 *   name: 'Alex',
 *   transform: { worldId: 1, position: { x: 50, y: 100 } },
 *   tags: ['friendly', 'shopkeeper'],
 *   npcData: { personaId: 'alex', expressionState: 'idle' }
 * };
 *
 * @example
 * // Item object
 * const item: ItemObject = {
 *   kind: 'item',
 *   id: 456,
 *   name: 'Health Potion',
 *   transform: { worldId: 1, position: { x: 10, y: 20 } },
 *   tags: ['consumable', 'healing'],
 *   itemData: { itemDefId: 'potion_health', quantity: 1 }
 * };
 */
export interface GameObjectBase {
  /** Discriminator for type narrowing */
  kind: 'npc' | 'item' | 'prop' | 'player' | 'trigger' | (string & {});
  /** Entity ID (use branded IDs like NpcId, ItemId, etc.) */
  id: number;
  /** Display name */
  name: string;
  /** Spatial transform (position, rotation, scale) */
  transform: Transform;
  /** Optional tags for filtering and categorization */
  tags?: string[];
  /** Optional metadata for extensions */
  meta?: Record<string, unknown>;
}

/**
 * NPC-specific fields
 * Extends GameObjectBase with NPC-related data
 */
export interface NpcObjectData {
  /** Persona ID for brain/dialogue system */
  personaId?: string;
  /** Schedule/routine graph ID */
  scheduleId?: string;
  /** Current expression/emotion state */
  expressionState?: string;
  /** Default portrait asset ID */
  portraitAssetId?: number;
  /** Role in the world (shopkeeper, guard, etc.) */
  role?: string;
  /** Current brain state snapshot */
  brainState?: Record<string, unknown>;
}

/**
 * NpcObject - GameObject variant for NPCs
 */
export interface NpcObject extends GameObjectBase {
  kind: 'npc';
  id: NpcId;
  /** NPC-specific data */
  npcData?: NpcObjectData;
}

/**
 * Item-specific fields
 * Extends GameObjectBase with item-related data
 */
export interface ItemObjectData {
  /** Item definition ID (from content/templates) */
  itemDefId: string;
  /** Stack quantity */
  quantity: number;
  /** Durability (0-1, optional) */
  durability?: number;
  /** Item-specific state (enchantments, modifications, etc.) */
  state?: Record<string, unknown>;
}

/**
 * ItemObject - GameObject variant for items
 */
export interface ItemObject extends GameObjectBase {
  kind: 'item';
  /** Item-specific data */
  itemData: ItemObjectData;
}

/**
 * Prop-specific fields
 * Extends GameObjectBase with prop-related data
 */
export interface PropObjectData {
  /** Prop definition ID (from content/templates) */
  propDefId: string;
  /** Asset ID for visual representation */
  assetId?: number;
  /** Interactive state (open/closed, on/off, etc.) */
  interactionState?: string;
  /** Prop-specific configuration */
  config?: Record<string, unknown>;
}

/**
 * PropObject - GameObject variant for props (furniture, decorations, etc.)
 */
export interface PropObject extends GameObjectBase {
  kind: 'prop';
  /** Prop-specific data */
  propData: PropObjectData;
}

/**
 * Player-specific fields
 * Extends GameObjectBase with player-related data
 */
export interface PlayerObjectData {
  /** User ID (from auth system) */
  userId: string;
  /** Control type */
  controlType: 'local' | 'remote';
  /** Multiplayer session ID (for remote players) */
  multiplayerSessionId?: string;
  /** Connection status (for remote players) */
  connectionStatus?: 'connected' | 'disconnected' | 'reconnecting';
  /** Camera target/focus */
  cameraTarget?: {
    type: 'actor' | 'location' | 'position';
    targetId?: number | string;
    position?: Position3D;
  };
  /** Current input state (for multiplayer sync) */
  inputState?: Record<string, unknown>;
}

/**
 * PlayerObject - GameObject variant for players
 */
export interface PlayerObject extends GameObjectBase {
  kind: 'player';
  /** Player-specific data */
  playerData: PlayerObjectData;
}

/**
 * Trigger-specific fields
 * Extends GameObjectBase with trigger-related data
 */
export interface TriggerObjectData {
  /** Trigger type (zone, proximity, interaction, etc.) */
  triggerType: 'zone' | 'proximity' | 'interaction' | 'event';
  /** Event ID to fire when triggered */
  eventId?: string;
  /** Trigger bounds/shape */
  bounds?: {
    type: 'circle' | 'rect' | 'polygon';
    radius?: number;
    width?: number;
    height?: number;
    points?: Position3D[];
  };
  /** Trigger conditions */
  conditions?: Record<string, unknown>;
  /** Whether trigger can fire multiple times */
  repeatable?: boolean;
  /** Cooldown in seconds */
  cooldownSeconds?: number;
}

/**
 * TriggerObject - GameObject variant for triggers
 */
export interface TriggerObject extends GameObjectBase {
  kind: 'trigger';
  /** Trigger-specific data */
  triggerData: TriggerObjectData;
}

/**
 * GameObject - discriminated union of all game object variants
 *
 * Use this for functions/services that work with any game object type.
 * TypeScript will narrow the type based on the 'kind' discriminator.
 *
 * @example
 * function renderObject(obj: GameObject) {
 *   // Common rendering for all types
 *   renderTransform(obj.transform);
 *
 *   // Type-specific rendering
 *   switch (obj.kind) {
 *     case 'npc':
 *       renderNpcSprite(obj); // obj is narrowed to NpcObject
 *       break;
 *     case 'item':
 *       renderItemIcon(obj); // obj is narrowed to ItemObject
 *       break;
 *     case 'prop':
 *       renderPropModel(obj); // obj is narrowed to PropObject
 *       break;
 *     case 'player':
 *       renderPlayerAvatar(obj); // obj is narrowed to PlayerObject
 *       break;
 *     case 'trigger':
 *       if (DEBUG_MODE) renderTriggerBounds(obj); // obj is narrowed to TriggerObject
 *       break;
 *   }
 * }
 */
export type GameObject =
  | NpcObject
  | ItemObject
  | PropObject
  | PlayerObject
  | TriggerObject;

/**
 * Type guard to check if a GameObject is an NpcObject
 */
export function isNpcObject(obj: GameObject): obj is NpcObject {
  return obj.kind === 'npc';
}

/**
 * Type guard to check if a GameObject is an ItemObject
 */
export function isItemObject(obj: GameObject): obj is ItemObject {
  return obj.kind === 'item';
}

/**
 * Type guard to check if a GameObject is a PropObject
 */
export function isPropObject(obj: GameObject): obj is PropObject {
  return obj.kind === 'prop';
}

/**
 * Type guard to check if a GameObject is a PlayerObject
 */
export function isPlayerObject(obj: GameObject): obj is PlayerObject {
  return obj.kind === 'player';
}

/**
 * Type guard to check if a GameObject is a TriggerObject
 */
export function isTriggerObject(obj: GameObject): obj is TriggerObject {
  return obj.kind === 'trigger';
}

// ===================
// Location Types (API DTOs aliased from OpenAPI)
// ===================

type EntityRef = ApiComponents['schemas']['EntityRef'];

export interface GameLocationSummary {
  id: number;
  name: string;
  asset?: EntityRef | null;
  default_spawn?: string | null;
}

export type HotspotActionType = 'play_scene' | 'change_location' | 'npc_talk';

export interface PlaySceneAction {
  type: 'play_scene';
  scene_id?: number | string | null;
}

export interface ChangeLocationAction {
  type: 'change_location';
  target_location_id?: number | string | null;
}

export interface NpcTalkAction {
  type: 'npc_talk';
  npc_id?: number | string | null;
}

export type HotspotAction = PlaySceneAction | ChangeLocationAction | NpcTalkAction;

export interface GameHotspotDTO {
  id?: number | null;
  object_name: string;
  hotspot_id: string;
  action?: HotspotAction | null;
  meta?: Record<string, unknown> | null;
}

export interface GameLocationDetail {
  id: number;
  name: string;
  asset?: EntityRef | null;
  default_spawn?: string | null;
  meta?: Record<string, unknown> | null;
  hotspots: GameHotspotDTO[];
}

// ----- Frontend-only interaction config types -----

/** [frontend-only] NPC talk interaction configuration */
export interface NpcTalkConfig {
  npcId?: number | null; // Optional override; else use assigned NPC
  preferredSceneId?: number | null;
}

/**
 * [frontend-only] NPC slot interactions using plugin-based format
 * Each key is an interaction plugin ID (e.g., 'talk', 'pickpocket', 'persuade')
 * Each value is the plugin's config with an 'enabled' flag
 *
 * Note: Plugin-specific types (like PickpocketConfig) are defined in their
 * respective plugin packages (e.g., @pixsim7/plugin-stealth/types).
 */
export interface NpcSlotInteractions {
  talk?: { enabled: boolean; preferredSceneId?: number | null } & Partial<NpcTalkConfig>;
  [interactionId: string]: { enabled: boolean; [key: string]: unknown } | undefined;
}

/** [frontend-only] 2D NPC slot for location editor */
export interface NpcSlot2d {
  id: string;
  x: number; // Normalized 0-1 position
  y: number; // Normalized 0-1 position
  roles?: string[];
  fixedNpcId?: number | null;
  interactions?: NpcSlotInteractions;
}

// ===================
// NPC Types (API DTOs aliased from OpenAPI)
// ===================

// Aliased from OpenAPI - matches backend NpcSummary
export type GameNpcSummary = ApiComponents['schemas']['NpcSummary'];

/**
 * [frontend-only] NPC detail for single NPC views
 *
 * Note: This extends GameNpcSummary with additional frontend fields.
 * For the unified actor system, see NpcActor which extends Actor.
 */
export interface GameNpcDetail extends GameNpcSummary {
  /** NPC metadata including preferences, traits, etc. */
  meta?: Record<string, unknown> | null;
  /** Bio/description */
  bio?: string | null;
  /** Current relationship level with player (0-100) */
  relationshipLevel?: number;
}

// Aliased from OpenAPI
export type NpcExpressionDTO = ApiComponents['schemas']['NpcExpressionDTO'];
export type NpcPresenceDTO = ApiComponents['schemas']['NpcPresenceDTO'];
export type NpcSurfacePackage = ApiComponents['schemas']['NpcSurfacePackageDTO'];

// ===================
// World Types (API DTOs aliased from OpenAPI)
// ===================

export type GameWorldSummary = ApiComponents['schemas']['GameWorldSummary'];
export type GameWorldDetail = ApiComponents['schemas']['GameWorldDetail'];

// ===================
// Relationship Tier / Intimacy ID Types [frontend-only]
// ===================

export type DefaultRelationshipTier =
  | 'stranger'
  | 'acquaintance'
  | 'friend'
  | 'close_friend'
  | 'lover';

export type DefaultIntimacyLevel =
  | 'platonic'
  | 'light_flirt'
  | 'deep_flirt'
  | 'intimate'
  | 'very_intimate';

/**
 * Relationship tier identifier.
 *
 * Uses a set of well-known defaults but allows custom strings so that
 * individual worlds can introduce their own tiers without schema changes.
 */
export type RelationshipTierId = DefaultRelationshipTier | string;

/**
 * Intimacy level identifier.
 *
 * Uses a set of well-known defaults but allows custom strings so that
 * individual worlds can introduce their own intimacy levels without
 * database schema changes.
 */
export type IntimacyLevelId = DefaultIntimacyLevel | string;

/**
 * World Manifest structure stored in GameWorld.meta.manifest
 * Defines per-world configuration for gameplay features
 *
 * Example:
 * ```typescript
 * world.meta = {
 *   manifest: {
 *     turn_preset: "ONE_HOUR",
 *     enabled_arc_graphs: ["main_romance", "side_heist"],
 *     enabled_plugins: ["quest-trigger"]
 *   },
 *   npcRoles: { ... }  // Other meta fields preserved
 * }
 * ```
 */
export interface WorldManifest {
  /** Default turn preset for turn-based mode (e.g., "ONE_HOUR") */
  turn_preset?: string;
  /** List of arc graph IDs enabled in this world (deprecated - use campaigns) */
  enabled_arc_graphs?: string[];
  /** List of campaign IDs enabled in this world */
  enabled_campaigns?: string[];
  /** Campaign progression state */
  campaign_progression?: Record<string, {
    campaignId: string;
    status: 'not_started' | 'in_progress' | 'completed';
    currentArcId?: string;
    completedArcIds: string[];
    startedAt?: string;
    completedAt?: string;
  }>;
  /** List of plugin IDs enabled in this world */
  enabled_plugins?: string[];
  /** Additional custom configuration */
  [key: string]: unknown;
}

/**
 * Motion/animation preset names
 * - 'none': No animations, instant transitions (accessibility-friendly)
 * - 'calm': Slow, gentle animations (400ms)
 * - 'comfortable': Balanced animations (250ms, default)
 * - 'snappy': Fast, punchy animations (150ms)
 */
export type MotionPreset = 'none' | 'calm' | 'comfortable' | 'snappy';

/**
 * Custom motion configuration for UI animations
 */
export interface MotionConfig {
  /** Transition duration in milliseconds */
  duration?: number;
  /** CSS timing function (e.g., 'ease', 'ease-in-out', 'cubic-bezier(...)') */
  easing?: string;
  /** Whether to respect prefers-reduced-motion */
  respectReducedMotion?: boolean;
}

/**
 * Per-world UI theme configuration stored in GameWorld.meta.ui.theme
 * Defines visual styling and density preferences for a specific world
 *
 * Example:
 * ```typescript
 * world.meta = {
 *   ui: {
 *     theme: {
 *       id: 'neo-noir',
 *       colors: {
 *         primary: '#00f3ff',
 *         secondary: '#ff00e5',
 *         background: '#0a0a0f'
 *       },
 *       density: 'compact',
 *       motion: 'snappy'
 *     },
 *     viewMode: 'cinematic'
 *   }
 * }
 * ```
 */
export interface WorldUiTheme {
  /** Theme identifier (e.g., 'neo-noir', 'bright-minimal', 'fantasy-rpg') */
  id: string;
  /** CSS variable overrides for colors */
  colors?: Record<string, string>;
  /** UI density preference */
  density?: 'compact' | 'comfortable' | 'spacious';
  /** Motion/animation preset or custom configuration */
  motion?: MotionPreset | MotionConfig;
}

/**
 * View mode determines which UI tools and panels are visible by default
 * - 'cinematic': Minimal HUD, emphasize immersion and story
 * - 'hud-heavy': Show all available world tools and panels
 * - 'debug': Show debug tools and world info for development
 */
export type ViewMode = 'cinematic' | 'hud-heavy' | 'debug';

/**
 * Per-world UI configuration stored in GameWorld.meta.ui
 * Controls theming, view mode, and future UI customization
 */
export interface WorldUiConfig {
  /** Visual theme configuration */
  theme?: WorldUiTheme;
  /** View mode for tool visibility */
  viewMode?: ViewMode;
  /** Future: HUD layout, preferred tools, etc. */
  [key: string]: unknown;
}

/**
 * Temporary UI theme override for sessions/arcs
 * Applied at runtime without modifying world meta
 * Used for special moments like dream sequences, flashbacks, etc.
 */
export interface SessionUiOverride {
  /** Unique identifier for this override (e.g., 'dream-sequence', 'flashback') */
  id: string;
  /** Partial theme to merge with world theme */
  themeOverride?: Partial<WorldUiTheme>;
  /** When this override was applied (timestamp) */
  appliedAt?: number;
  /** Optional metadata for tracking */
  metadata?: {
    /** Reason for override (for debugging/logging) */
    reason?: string;
    /** Source that applied the override (scene, plugin, etc.) */
    source?: string;
    [key: string]: unknown;
  };
}

/**
 * Per-world generation configuration stored in GameWorld.meta.generation
 * Controls content generation behavior and rating constraints
 *
 * Example:
 * ```typescript
 * world.meta = {
 *   generation: {
 *     stylePresetId: "soft_romance",
 *     maxContentRating: "romantic"
 *   }
 * }
 * ```
 */
export interface WorldGenerationConfig {
  /**
   * Style preset ID for generation
   * Can reference a template/style configuration for content generation
   * (e.g., 'soft_romance', 'action_focused', 'mystery_thriller')
   */
  stylePresetId?: string;

  /**
   * Maximum content rating allowed for this world
   * Clamps all generation requests to this rating or lower
   * - 'sfw': Safe for work, no romantic content
   * - 'romantic': Light romance, hand-holding, kissing
   * - 'mature_implied': Mature themes implied but not explicit
   * - 'restricted': Restricted content (requires explicit user consent)
   */
  maxContentRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';

  /**
   * Default generation strategy for this world
   * Can be overridden per generation node
   */
  defaultStrategy?: 'once' | 'per_playthrough' | 'per_player' | 'always';

  /**
   * Additional custom configuration
   * Allows world-specific generation parameters without schema changes
   */
  [key: string]: unknown;
}

// ===================
// GameProfile Types [frontend-only]
// ===================

/**
 * Core game style identifiers (built-in styles)
 * Defines the high-level gameplay approach for the world
 */
export type CoreGameStyle = 'life_sim' | 'visual_novel' | 'hybrid';

/**
 * Game style identifier
 * Supports both built-in styles and custom plugin-defined styles
 *
 * Note: This type allows string extensions for maximum flexibility.
 * Built-in styles get autocomplete, but custom styles are also allowed.
 */
export type GameStyle = CoreGameStyle | (string & {});

/**
 * Simulation mode identifier
 * Determines how time and simulation progress
 */
export type SimulationMode = 'real_time' | 'turn_based' | 'paused';

/**
 * Behavior profile identifier
 * Influences default behavior scoring weights
 */
export type BehaviorProfile = 'work_focused' | 'relationship_focused' | 'balanced';

/**
 * Narrative profile identifier
 * Determines how much to emphasize narrative programs vs free play
 */
export type NarrativeProfile = 'light' | 'moderate' | 'heavy';

/**
 * Turn-based configuration
 * Defines turn length and limits for turn-based simulation
 */
export interface TurnConfig {
  /** Default turn length in game seconds (e.g., 3600 = 1 hour) */
  turnDeltaSeconds: number;
  /** Maximum turns allowed per session (optional limit) */
  maxTurnsPerSession?: number;
}

/**
 * Game profile configuration stored in GameWorld.meta.gameProfile
 * Defines the high-level style and simulation mode for a world
 *
 * This allows the same engine to support both life-sim and visual novel
 * game styles through configuration rather than divergent code paths.
 *
 * Example:
 * ```typescript
 * world.meta = {
 *   gameProfile: {
 *     style: "life_sim",
 *     simulationMode: "turn_based",
 *     turnConfig: { turnDeltaSeconds: 3600 },
 *     behaviorProfile: "work_focused",
 *     narrativeProfile: "light"
 *   }
 * }
 * ```
 */
export interface GameProfile {
  /**
   * Game style - determines overall gameplay emphasis
   * - 'life_sim': Focus on NPC schedules, behavior, daily routines
   * - 'visual_novel': Focus on narrative programs, scenes, choices
   * - 'hybrid': Balanced approach between both styles
   */
  style: GameStyle;

  /**
   * Simulation mode - determines how time progresses
   * - 'real_time': Continuous time progression with ticks
   * - 'turn_based': Discrete turns advanced by player action
   * - 'paused': Time frozen until manually advanced
   */
  simulationMode: SimulationMode;

  /**
   * Turn configuration (required for turn_based mode)
   */
  turnConfig?: TurnConfig;

  /**
   * Behavior profile - influences default behavior scoring
   * - 'work_focused': Higher weights for work activities, urgency
   * - 'relationship_focused': Higher relationship bonuses, social emphasis
   * - 'balanced': Middle-of-the-road defaults
   */
  behaviorProfile?: BehaviorProfile;

  /**
   * Narrative profile - determines narrative emphasis
   * - 'light': Sparse narrative programs, everyday interactions
   * - 'moderate': Balanced narrative and free play
   * - 'heavy': Frequent narrative programs, branching sequences
   */
  narrativeProfile?: NarrativeProfile;
}

// ===================
// Actor System Types [frontend-only]
// ===================

/**
 * Actor type discriminator
 * - 'npc': AI-controlled entity (schedule, brain, persona)
 * - 'player': Human-controlled entity (local or remote)
 * - 'agent': Script/AI-controlled entity (bots, AI companions, test agents)
 */
export type ActorType = 'npc' | 'player' | 'agent';

/**
 * Control source for player actors
 */
export interface PlayerControlBinding {
  /** Control type */
  type: 'local' | 'remote';
  /** User ID (from auth system) */
  userId: string;
  /** Multiplayer session ID (for remote players) */
  multiplayerSessionId?: string;
  /** Connection status (for remote players) */
  connectionStatus?: 'connected' | 'disconnected' | 'reconnecting';
}

/**
 * Control source for agent actors (bots, AI companions)
 */
export interface AgentControlBinding {
  /** Agent script/behavior ID */
  agentId: string;
  /** Agent type */
  agentType: 'companion' | 'test' | 'bot';
  /** Configuration for the agent */
  config?: Record<string, unknown>;
}

/**
 * Inventory slot for actors
 */
export interface InventorySlot {
  /** Item ID */
  itemId: string;
  /** Stack quantity */
  quantity: number;
  /** Slot index (for ordered inventories) */
  slotIndex?: number;
  /** Item metadata (durability, enchantments, etc.) */
  metadata?: Record<string, unknown>;
}

/**
 * Actor - base entity type for all entities that can act in the world
 *
 * This is the foundation for NPCs, players, and agent-controlled entities.
 * All actors share common properties but differ in how they're controlled.
 *
 * Design notes:
 * - Supports multiplayer (multiple player actors per world)
 * - Genre-agnostic (stats/inventory are optional)
 * - Control source determines behavior (AI, human, script)
 */
export interface Actor {
  /** Unique actor ID */
  id: number;
  /** Actor type discriminator */
  type: ActorType;
  /** Display name */
  name: string;

  // ---- Location ----
  /** World this actor belongs to */
  worldId: number;
  /** Current location within the world (null = not placed) */
  locationId: number | null;

  // ---- Optional systems (enabled per-game/actor) ----
  /**
   * Dynamic stats (energy, hunger, health, etc.)
   * Schema is defined per-world in meta.statSchemas
   */
  stats?: Record<string, number>;

  /**
   * Inventory slots
   * Only present if the game uses inventory system
   */
  inventory?: InventorySlot[];

  /**
   * Relationships to other actors (by actor ref, e.g., "npc:123")
   * Uses the same RelationshipCoreComponent structure
   * Keyed by NpcRef for consistency with session relationship storage
   */
  relationships?: Record<string, RelationshipCoreComponent>;

  // ---- Generic flags ----
  /**
   * Arbitrary flags for game-specific state
   * Can store unlocks, story progress, preferences, etc.
   */
  flags: Record<string, unknown>;

  // ---- Metadata ----
  /** Creation timestamp */
  createdAt?: string;
  /** Last update timestamp */
  updatedAt?: string;
  /** Additional metadata */
  meta?: Record<string, unknown>;
}

/**
 * NPC Actor - AI-controlled entity
 *
 * Extends Actor with NPC-specific fields for AI control,
 * scheduling, and brain/persona integration.
 */
export interface NpcActor extends Actor {
  type: 'npc';

  // ---- AI Control ----
  /** Persona ID for brain/dialogue system */
  personaId?: string;
  /** Schedule/routine graph ID */
  scheduleId?: string;
  /** Current brain state snapshot */
  brainState?: {
    currentActivity?: string;
    mood?: string;
    lastMemoryId?: string;
    [key: string]: unknown;
  };

  // ---- NPC-specific state ----
  /** Current expression/emotion state */
  expressionState?: string;
  /** Default portrait asset ID */
  portraitAssetId?: number;
  /** Role in the world (shopkeeper, guard, etc.) */
  role?: string;
  /** Tags for filtering/categorization */
  tags?: string[];
}

/**
 * Player Actor - human-controlled entity
 *
 * Extends Actor with player-specific fields for input handling,
 * camera control, and multiplayer support.
 */
export interface PlayerActor extends Actor {
  type: 'player';

  // ---- Control binding ----
  /** Who controls this actor */
  controlledBy: PlayerControlBinding;

  // ---- Player-specific state ----
  /**
   * Camera target/focus
   * Used by the renderer to position camera
   */
  cameraTarget?: {
    type: 'actor' | 'location' | 'position';
    targetId?: number | string;
    position?: { x: number; y: number; z?: number };
  };

  /**
   * Current input state (for multiplayer sync)
   * Tracks what inputs the player is currently giving
   */
  inputState?: {
    moveDirection?: { x: number; y: number };
    interactTarget?: number | string;
    [key: string]: unknown;
  };

  /**
   * Player preferences (keybindings, UI settings, etc.)
   * Synced from user profile but can be overridden per-session
   */
  preferences?: Record<string, unknown>;
}

/**
 * Agent Actor - script/AI-controlled entity (bots, companions)
 *
 * Extends Actor with agent-specific fields for automated control.
 * Useful for AI companions, test bots, or scripted entities.
 */
export interface AgentActor extends Actor {
  type: 'agent';

  // ---- Control binding ----
  /** Agent control configuration */
  controlledBy: AgentControlBinding;

  // ---- Agent-specific state ----
  /** Current objective/goal */
  currentObjective?: string;
  /** Agent behavior state */
  behaviorState?: Record<string, unknown>;
}

/**
 * Union type for any actor
 */
export type AnyActor = NpcActor | PlayerActor | AgentActor;

/**
 * Player slot for multiplayer sessions
 * Defines who can join and which actor they control
 */
export interface PlayerSlot {
  /** Unique slot ID */
  slotId: string;
  /** User ID occupying this slot (null = open) */
  userId: string | null;
  /** Actor ID this slot controls (null = not assigned) */
  actorId: number | null;
  /** Slot role */
  role: 'host' | 'guest';
  /** Slot status */
  status: 'open' | 'occupied' | 'reserved';
  /** Join permissions */
  permissions?: {
    canSpawn?: boolean;
    canPossess?: boolean;
    isSpectator?: boolean;
  };
}

/**
 * Actor presence - where an actor is at a given time
 * Extends NpcPresenceDTO concept to all actors
 */
export interface ActorPresence {
  actorId: number;
  actorType: ActorType;
  locationId: number;
  worldTimeSeconds: number;
  state: Record<string, unknown>;
}

// ===================
// Session Types
// ===================

// Aliased from OpenAPI (named GameSessionResponse in backend)
export type GameSessionDTO = ApiComponents['schemas']['GameSessionResponse'];

// ----- Frontend-only session flag types -----

/** [frontend-only] */
export type SessionKind = 'world' | 'scene';
/** [frontend-only] */
export type WorldMode = 'turn_based' | 'real_time';

/** [frontend-only] */
export interface TurnRecord {
  /** Turn number */
  turnNumber: number;
  /** World time at the start of this turn */
  worldTime: number;
  /** Real-world timestamp when turn was taken */
  timestamp: number;
  /** Location ID where turn was taken */
  locationId?: number;
}

/** [frontend-only] */
export interface WorldSessionFlags {
  /** Unique identifier for the conceptual world */
  id?: string;
  /** Turn-based or real-time mode */
  mode?: WorldMode;
  /** Current location ID in the world */
  currentLocationId?: number;
  /** For turn-based: delta seconds per turn (default: 3600 = 1 hour) */
  turnDeltaSeconds?: number;
  /** Current turn number (for turn-based mode) */
  turnNumber?: number;
  /** Turn history (limited to last N turns) */
  turnHistory?: TurnRecord[];
}

/** [frontend-only] */
export interface SessionFlags {
  /** Type of session: world (life-sim) or scene (story-based) */
  sessionKind?: SessionKind;
  /** World-specific configuration */
  world?: WorldSessionFlags;
  /** Temporary UI theme override for this session */
  ui?: SessionUiOverride;
  /** Additional custom flags */
  [key: string]: unknown;
}

/**
 * [frontend-only] Type-safe session update payload - only includes mutable fields
 * Prevents accidentally updating readonly fields like id, user_id, etc.
 */
export interface SessionUpdatePayload {
  world_time?: number;
  flags?: Record<string, unknown>;

  /**
   * Generic stats storage.
   * Use stats.relationships for relationship data.
   */
  stats?: Record<string, Record<string, unknown>>;

  expected_version?: number; // For optimistic locking
}

// ===================
// Stealth/Interaction Types (API DTOs aliased from OpenAPI)
// ===================

export type PickpocketRequest = ApiComponents['schemas']['PickpocketRequest'];
export type PickpocketResponse = ApiComponents['schemas']['PickpocketResponse'];
export type SensualTouchRequest = ApiComponents['schemas']['SensualTouchRequest'];
export type SensualTouchResponse = ApiComponents['schemas']['SensualTouchResponse'];

// ===================
// Quest Types (API DTOs aliased from OpenAPI)
// ===================

export type QuestObjectiveDTO = ApiComponents['schemas']['QuestObjective'];
export type QuestDTO = ApiComponents['schemas']['Quest'];

// ===================
// Inventory Types (API DTOs aliased from OpenAPI)
// ===================

export type InventoryItemDTO = ApiComponents['schemas']['InventoryItem'];

// ===================
// Relationship Preview Types [frontend-only]
// ===================

/**
 * Request payload for relationship tier preview
 */
export interface RelationshipTierPreviewRequest {
  worldId: number;
  affinity: number;
  schemaKey?: string;
}

/**
 * Response from relationship tier preview API
 */
export interface RelationshipTierPreviewResponse {
  tierId: RelationshipTierId | null;
  schemaKey: string;
  affinity: number;
}

/**
 * Relationship values for intimacy computation
 */
export interface RelationshipValues {
  affinity: number;
  trust: number;
  chemistry: number;
  tension: number;
}

/**
 * Request payload for intimacy level preview
 */
export interface RelationshipIntimacyPreviewRequest {
  worldId: number;
  relationshipValues: RelationshipValues;
}

/**
 * Response from intimacy level preview API
 */
export interface RelationshipIntimacyPreviewResponse {
  intimacyLevelId: IntimacyLevelId | null;
  relationshipValues: RelationshipValues;
}

// ===================
// Generic Metric System Types [frontend-only]
// ===================

/**
 * Supported metric types for preview/evaluation
 * Matches backend MetricType enum
 */
export type MetricId =
  | 'relationship_tier'
  | 'relationship_intimacy'
  | 'npc_mood'
  | 'reputation_band';

/**
 * Generic metric preview request
 * Type parameter M constrains the metric ID
 */
export interface MetricPreviewRequest<M extends MetricId = MetricId> {
  metric: M;
  worldId: number;
  payload: Record<string, unknown>;
}

/**
 * Generic metric preview response
 * Type parameter M constrains the metric ID
 */
export interface MetricPreviewResponse<M extends MetricId = MetricId> {
  metric: M;
  worldId: number;
  result: Record<string, unknown>;
}

// ===================
// NPC Mood Metric Types [frontend-only]
// ===================

/**
 * NPC mood metric payload
 */
export interface NpcMoodMetricPayload {
  npcId: number;
  sessionId?: number;
  /** Optional relationship values override (if not reading from session) */
  relationshipValues?: {
    affinity: number;
    trust: number;
    chemistry: number;
    tension: number;
  };
  /** Optional emotional state override */
  emotionalState?: {
    emotion: string;
    intensity: number;
  };
}

/**
 * NPC mood metric result
 */
export interface NpcMoodMetricResult {
  moodId: string;
  valence: number;
  arousal: number;
  emotionType?: string;
  emotionIntensity?: number;
}

/**
 * Request payload for NPC mood preview
 */
export interface NpcMoodPreviewRequest {
  worldId: number;
  npcId: number;
  sessionId?: number;
  relationshipValues?: {
    affinity: number;
    trust: number;
    chemistry: number;
    tension: number;
  };
  emotionalState?: {
    emotion: string;
    intensity: number;
  };
}

/**
 * Response from NPC mood preview API
 */
export interface NpcMoodPreviewResponse {
  moodId: string;
  valence: number;
  arousal: number;
  emotionType?: string;
  emotionIntensity?: number;
  npcId: number;
}

// ===================
// Unified Mood Types [frontend-only]
// ===================

export type MoodDomain = 'general' | 'intimate' | 'social';

export type GeneralMoodId = 'excited' | 'content' | 'anxious' | 'calm';

export type IntimacyMoodId =
  | 'playful'
  | 'tender'
  | 'passionate'
  | 'conflicted'
  | 'shy'
  | 'eager';

export interface UnifiedMoodState {
  generalMood: {
    moodId: GeneralMoodId;
    valence: number;
    arousal: number;
  };
  intimacyMood?: {
    moodId: IntimacyMoodId;
    intensity: number;
  };
  activeEmotion?: {
    emotionType: string;
    intensity: number;
    trigger?: string;
    expiresAt?: string;
  };
}

// ===================
// Reputation Metric Types [frontend-only]
// ===================

/**
 * Reputation metric payload
 */
export interface ReputationMetricPayload {
  subjectId: number;
  subjectType: 'player' | 'npc';
  targetId?: number;
  targetType?: 'npc' | 'faction' | 'group';
  /** Optional reputation score override (if not reading from session) */
  reputationScore?: number;
  /** Optional faction membership data */
  factionMembership?: Record<string, number>;
}

/**
 * Reputation metric result
 */
export interface ReputationMetricResult {
  reputationBand: string;
  reputationScore: number;
  targetId?: number;
  targetType?: string;
}

/**
 * Request payload for reputation band preview
 */
export interface ReputationBandPreviewRequest {
  worldId: number;
  subjectId: number;
  subjectType: 'player' | 'npc';
  targetId?: number;
  targetType?: 'npc' | 'faction' | 'group';
  reputationScore?: number;
  sessionId?: number;
  factionMembership?: Record<string, number>;
}

/**
 * Response from reputation band preview API
 */
export interface ReputationBandPreviewResponse {
  reputationBand: string;
  reputationScore: number;
  targetId?: number;
  targetType?: string;
  subjectId: number;
}

// ===================
// NPC Behavior System Types [frontend-only]
// ===================

/**
 * Condition DSL for behavior system
 * Reusable across routine graphs, activity requirements, and simulation prioritization
 *
 * Supports built-in condition types and extensible custom conditions
 */
export type Condition =
  // Built-in conditions
  | {
      type: 'relationship_gt';
      npcIdOrRole: string;
      metric: 'affinity' | 'trust' | 'chemistry' | 'tension';
      threshold: number;
    }
  | {
      type: 'relationship_lt';
      npcIdOrRole: string;
      metric: 'affinity' | 'trust' | 'chemistry' | 'tension';
      threshold: number;
    }
  | { type: 'flag_equals'; key: string; value: unknown }
  | { type: 'flag_exists'; key: string }
  | { type: 'mood_in'; moodTags: string[] }
  | { type: 'energy_between'; min: number; max: number }
  | { type: 'random_chance'; probability: number } // 0-1
  | {
      type: 'time_of_day_in';
      times: Array<'morning' | 'afternoon' | 'evening' | 'night'>;
    }
  | { type: 'location_type_in'; locationTypes: string[] }
  // Extensible custom conditions
  | {
      type: 'custom';
      evaluatorId: string; // e.g., "evaluator:is_raining", "evaluator:quest_active"
      params: Record<string, unknown>;
    }
  // Expression-based conditions (advanced, optional)
  | {
      type: 'expression';
      expression: string; // e.g., "relationship.affinity > 60 && flags.arc_stage == 2"
    };

/**
 * User-defined activity category configuration
 * Stored in GameWorld.meta.behavior.activityCategories
 */
export interface ActivityCategoryConfig {
  id: string; // "work", "combat", "magic", "crafting", etc.
  label: string; // Display name
  icon?: string; // Optional icon (emoji or icon name)
  defaultWeight?: number; // 0-1, default preference weight
  description?: string;
  meta?: Record<string, unknown>;
}

/** Relationship delta for activity effects (aliased from OpenAPI) */
export type RelationshipDelta = ApiComponents['schemas']['RelationshipDelta'];

/**
 * Custom effect for extensibility
 * Allows worlds to define custom effect types without code changes
 */
export interface CustomEffect {
  type: string; // "effect:give_item", "effect:grant_xp", "effect:spawn_event"
  params: Record<string, unknown>;
}

/**
 * Activity effects applied when NPC performs an activity
 */
export interface ActivityEffects {
  // Core effects (always available)
  energyDeltaPerHour?: number; // -100 to 100
  moodImpact?: { valence: number; arousal: number }; // -100 to 100
  relationshipChanges?: Record<string, RelationshipDelta>; // key: "npc:<id>" or "role:<key>"
  flagsSet?: Record<string, unknown>; // e.g., { "arc:job_promotion.completed": true }

  // Extensible custom effects
  customEffects?: CustomEffect[];
}

/**
 * Activity requirements (gates for when activity is available)
 */
export interface ActivityRequirements {
  locationTypes?: string[]; // e.g., ["office", "shop"]
  requiredNpcRolesOrIds?: string[]; // e.g., ["role:friend", "npc:alex"]
  minEnergy?: number; // 0-100
  maxEnergy?: number; // 0-100
  moodTags?: string[]; // e.g., ["playful", "focused"]
  timeOfDay?: Array<'morning' | 'afternoon' | 'evening' | 'night'>;
  conditions?: Condition[]; // Additional condition gates
}

/**
 * Visual/presentation metadata for activities
 */
export interface ActivityVisualMeta {
  animationId?: string;
  dialogueContext?: string; // "at_work", "eating", "flirting"
  actionBlocks?: string[]; // IDs passed to generation / action block system
  sceneIntent?: string; // high-level label, not hard scene IDs
  icon?: string;
  color?: string;
}

/**
 * Activity template definition
 * Describes a reusable "thing NPCs can do"
 */
export interface Activity {
  version: number; // Schema version (start at 1, increment on breaking changes)
  id: string; // "activity:work_office"
  name: string;
  category: string; // User-defined category (not enum!)

  requirements?: ActivityRequirements;
  effects?: ActivityEffects;
  visual?: ActivityVisualMeta;

  // Simulation tuning
  minDurationSeconds?: number; // Avoid rapid thrashing
  cooldownSeconds?: number; // Avoid repeating too often
  priority?: number; // Base priority (higher = more preferred by default)

  meta?: Record<string, unknown>;
}

/**
 * NPC personality trait modifiers (0-100 scale)
 */
export interface NpcTraitModifiers {
  extraversion?: number; // 0 = introverted, 100 = extraverted
  conscientiousness?: number; // 0 = spontaneous, 100 = organized
  openness?: number; // 0 = traditional, 100 = experimental
  agreeableness?: number; // 0 = competitive, 100 = cooperative
  neuroticism?: number; // 0 = calm, 100 = anxious
}

/**
 * NPC preferences configuration
 * Defines what an NPC likes/dislikes
 */
export interface NpcPreferences {
  // Per-activity weights (0-1, default 0.5 if missing)
  activityWeights?: Record<string, number>;

  // Category weights (0-1, default 0.5 if missing)
  categoryWeights?: Record<string, number>; // e.g., { "work": 0.7, "social": 0.9 }

  // Relationship / location preferences
  preferredNpcIdsOrRoles?: string[]; // e.g., ["npc:alex", "role:best_friend"]
  avoidedNpcIdsOrRoles?: string[];
  favoriteLocations?: string[]; // e.g., ["location:cafe", "location:park"]

  // Time-of-day preferences
  morningPerson?: boolean;
  nightOwl?: boolean;

  // Personality traits
  traitModifiers?: NpcTraitModifiers;

  meta?: Record<string, unknown>;
}

/**
 * Routine graph node types
 */
export type RoutineNodeType = 'time_slot' | 'decision' | 'activity';

/**
 * Routine graph node
 */
export interface RoutineNode {
  id: string;
  nodeType: RoutineNodeType;

  // Time window (for time_slot nodes)
  timeRangeSeconds?: { start: number; end: number }; // seconds in game day

  // Activity candidates (for time_slot or activity nodes)
  preferredActivities?: Array<{
    activityId: string;
    weight: number; // base weight before preferences
    conditions?: Condition[];
  }>;

  // Decision logic (for decision nodes)
  decisionConditions?: Condition[]; // used with edges; node-level default conditions

  meta?: {
    label?: string;
    position?: { x: number; y: number }; // editor layout only
    [key: string]: unknown;
  };
}

/**
 * Routine graph edge
 */
export interface RoutineEdge {
  fromNodeId: string;
  toNodeId: string;
  conditions?: Condition[];
  weight?: number; // for weighted transitions
  transitionEffects?: ActivityEffects; // optional side-effects on transition
  meta?: Record<string, unknown>;
}

/**
 * Routine graph definition
 * Describes when and under which conditions certain activities are considered
 */
export interface RoutineGraph {
  version: number; // Schema version
  id: string; // "routine:shopkeeper_daily"
  name: string;
  nodes: RoutineNode[];
  edges: RoutineEdge[];

  // Optional defaults applied when this routine is used
  defaultPreferences?: Partial<NpcPreferences>;

  meta?: {
    description?: string;
    tags?: string[]; // "work", "casual", "romantic"
    [key: string]: unknown;
  };
}

/**
 * Scoring system configuration
 * Defines how activity choices are weighted
 */
export interface ScoringConfig {
  version: number; // Schema version

  // Multiplier weights for each scoring factor
  weights: {
    baseWeight: number; // 1.0 default
    activityPreference: number; // 1.0 default
    categoryPreference: number; // 0.8 default
    traitModifier: number; // 0.6 default
    moodCompatibility: number; // 0.7 default
    relationshipBonus: number; // 0.5 default
    urgency: number; // 1.2 default (low energy → boost rest)
    inertia: number; // 0.3 default (bias toward current activity)
  };

  // Advanced: custom scoring function ID
  customScoringId?: string; // "scoring:romantic_heavy", "scoring:work_focused"

  meta?: Record<string, unknown>;
}

/**
 * Simulation tier configuration (game-agnostic)
 */
export interface SimulationTier {
  id: string; // "high_priority", "medium_priority", "background"
  tickFrequencySeconds: number; // How often to update
  detailLevel: 'full' | 'simplified' | 'schedule_only';
  meta?: Record<string, unknown>;
}

/**
 * Priority rule for NPC simulation
 * Determines which tier an NPC belongs to based on conditions
 */
export interface SimulationPriorityRule {
  condition: Condition; // Use existing Condition DSL
  tier: string; // Which tier to assign
  priority: number; // Higher priority wins
}

/**
 * Simulation configuration (game-agnostic)
 * Supports different game types: 2D, 3D, text, visual novel, etc.
 */
export interface SimulationConfig {
  version: number; // Schema version

  // Simulation tiers (not distance-based!)
  tiers: SimulationTier[];

  // How to determine NPC priority (flexible, not just distance!)
  priorityRules: SimulationPriorityRule[];

  // Defaults
  defaultTier: string; // "background"
  maxNpcsPerTick?: number; // Hard limit (e.g., 50)

  meta?: Record<string, unknown>;
}

/**
 * Custom condition evaluator configuration
 * Allows worlds to define custom condition types
 */
export interface CustomConditionEvaluator {
  id: string; // "evaluator:is_raining"
  description?: string;
  implementation?: 'lua' | 'python' | 'expr'; // Different execution strategies
  code?: string; // The actual evaluator code (if applicable)
  meta?: Record<string, unknown>;
}

/**
 * Custom effect handler configuration
 * Allows worlds to define custom effect types
 */
export interface CustomEffectHandler {
  id: string; // "effect:give_item"
  description?: string;
  implementation?: 'lua' | 'python' | 'expr';
  code?: string; // The actual handler code (if applicable)
  meta?: Record<string, unknown>;
}

/**
 * NPC behavior configuration presets
 * Reusable preset configurations for NPC preferences
 */
export interface NpcPreferencePreset {
  id: string;
  name: string;
  description?: string;
  preferences: NpcPreferences;
  tags?: string[]; // "workaholic", "social_butterfly", "night_owl", etc.
  meta?: Record<string, unknown>;
}

/**
 * Complete behavior configuration for a world
 * Stored in GameWorld.meta.behavior
 */
export interface BehaviorConfig {
  version: number; // Schema version (start at 1)

  // Activity catalog
  activityCategories?: Record<string, ActivityCategoryConfig>;
  activities?: Record<string, Activity>;

  // Routine graphs
  routines?: Record<string, RoutineGraph>;

  // Scoring configuration
  scoringConfig?: ScoringConfig;

  // Simulation configuration
  simulationConfig?: SimulationConfig;

  // Extensibility
  customConditionEvaluators?: Record<string, CustomConditionEvaluator>;
  customEffectHandlers?: Record<string, CustomEffectHandler>;

  // Presets
  presets?: {
    npcPreferences?: Record<string, NpcPreferencePreset>;
    [key: string]: unknown;
  };

  meta?: Record<string, unknown>;
}

/**
 * Per-session NPC state
 * Stored in GameSession.flags.npcs["npc:<id>"].state
 */
export interface NpcSessionState {
  energy?: number; // 0-100
  currentActivityId?: string; // "activity:work_office"
  activityStartedAtSeconds?: number; // world_time when activity started
  nextDecisionAtSeconds?: number; // world_time when to re-evaluate
  currentLocationId?: string; // "location:office"
  moodState?: {
    valence: number;
    arousal: number;
    tags?: string[];
  };
  lastActivities?: Array<{
    // Activity history for cooldown checks
    activityId: string;
    endedAtSeconds: number;
  }>;
  meta?: Record<string, unknown>;
}

/**
 * Per-session NPC data
 * Stored in GameSession.flags.npcs["npc:<id>"]
 */
export interface SessionNpcData {
  state?: NpcSessionState;
  preferences?: NpcPreferences; // Session-specific overrides
  meta?: Record<string, unknown>;
}

// ===================
// ECS Component Types [frontend-only]
// ===================

/**
 * Relationship core component
 * Contains the fundamental relationship metrics between player and NPC
 * Component key: "core"
 */
export interface RelationshipCoreComponent {
  /** Affinity (0-100): how much the NPC likes the player */
  affinity: number;
  /** Trust (0-100): how much the NPC trusts the player */
  trust: number;
  /** Chemistry (0-100): romantic/physical attraction */
  chemistry: number;
  /** Tension (0-100): conflict or unresolved issues */
  tension: number;
  /** Computed relationship tier ID (e.g., "friend", "lover") */
  tierId?: RelationshipTierId;
  /** Computed intimacy level ID (e.g., "light_flirt", "intimate") */
  intimacyLevelId?: IntimacyLevelId | null;
}

/**
 * Romance state component
 * Manages romance-specific state and progression
 * Component key: "romance"
 * Source: Typically owned by plugin:game-romance
 */
export interface RomanceComponent {
  /** Arousal level (0-1) */
  arousal?: number;
  /** Consent level (0-1) */
  consentLevel?: number;
  /** Romance stage identifier */
  stage?: string;
  /** Romance-specific flags */
  flags?: Record<string, unknown>;
  /** Custom romance stats */
  customStats?: Record<string, number>;
}

/**
 * Stealth state component (generic shape)
 * Generic ECS component shape for stealth-related state.
 * Component key: "stealth"
 *
 * Note: For the pickpocket-specific implementation, see
 * @pixsim7/plugin-stealth/types which defines a more detailed
 * StealthComponent with pickpocket attempt history.
 *
 * Source: Typically owned by plugin:game-stealth
 */
export interface StealthComponent {
  /** Suspicion level (0-1) */
  suspicion?: number;
  /** Timestamp when player was last caught */
  lastCaught?: number;
  /** Reputation with guards/authorities */
  guardReputation?: number;
  /** Stealth-specific flags */
  flags?: Record<string, unknown>;
}

/**
 * Unified mood state component
 * Combines general mood, intimacy mood, and active emotions
 * Component key: "mood"
 */
export interface MoodStateComponent {
  /** General mood (valence/arousal based) */
  general?: {
    moodId: string;
    valence: number;
    arousal: number;
  };
  /** Intimacy mood (romance context) */
  intimacy?: {
    moodId: string;
    intensity: number;
  };
  /** Active discrete emotion from events */
  activeEmotion?: {
    emotionType: string;
    intensity: number;
    trigger?: string;
    expiresAt?: number;
  };
}

/**
 * Quest participation component
 * Tracks NPC involvement in quests/arcs
 * Component key: "quests"
 */
export interface QuestParticipationComponent {
  /** Active quests this NPC is involved in */
  activeQuests?: string[];
  /** Completed quests */
  completedQuests?: string[];
  /** Quest-specific progress flags */
  questFlags?: Record<string, unknown>;
}

/**
 * Behavior state component
 * Tracks NPC's current activity and simulation tier
 * Component key: "behavior"
 */
export interface BehaviorStateComponent {
  /** Current activity ID */
  currentActivity?: string;
  /** Activity started timestamp */
  activityStartedAt?: number;
  /** Next decision time */
  nextDecisionAt?: number;
  /** Simulation tier (high_priority, medium_priority, background) */
  simulationTier?: string;
  /** Behavior tags */
  tags?: string[];
  /** Current location */
  locationId?: string;
}

/**
 * Interaction state component
 * Tracks interaction cooldowns and chain progress
 * Component key: "interactions"
 */
export interface InteractionStateComponent {
  /** Timestamps when interactions were last used */
  lastUsedAt?: Record<string, number>;
  /** Interaction chain progress */
  chainProgress?: Record<string, {
    currentStep: number;
    startedAt: number;
    data?: Record<string, unknown>;
  }>;
  /** Interaction-specific flags */
  flags?: Record<string, unknown>;
}

/**
 * Plugin component
 * Arbitrary plugin-owned component data
 * Component key: "plugin:{pluginId}" or "plugin:{pluginId}:{componentName}"
 */
export interface PluginComponent {
  [key: string]: unknown;
}

/**
 * NPC Entity State (ECS model)
 * Authoritative per-NPC state stored in GameSession.flags.npcs["npc:{id}"]
 *
 * This replaces the ad-hoc SessionNpcData structure with a component-based model.
 * Components are keyed by standard names:
 * - "core" - RelationshipCoreComponent
 * - "romance" - RomanceComponent
 * - "stealth" - StealthComponent
 * - "mood" - MoodStateComponent
 * - "quests" - QuestParticipationComponent
 * - "behavior" - BehaviorStateComponent
 * - "interactions" - InteractionStateComponent
 * - "plugin:{id}" - PluginComponent
 */
export interface NpcEntityState {
  /** Component data indexed by component name */
  components: Record<string, unknown>;
  /** Entity tags for quick filtering */
  tags?: string[];
  /** Additional metadata */
  metadata?: {
    /** Last seen location/scene */
    lastSeenAt?: string;
    /** Last interaction timestamp */
    lastInteractionAt?: number;
    /** Custom metadata */
    [key: string]: unknown;
  };
}

/**
 * Metric definition for the metric registry
 * Defines how to find and interpret a metric value
 */
export interface MetricDefinition {
  /** Metric ID (e.g., "npcRelationship.affinity") */
  id: string;
  /** Metric type (float, int, enum, boolean) */
  type: 'float' | 'int' | 'enum' | 'boolean';
  /** Minimum value (for numeric types) */
  min?: number;
  /** Maximum value (for numeric types) */
  max?: number;
  /** Allowed values (for enum types) */
  values?: string[];
  /** Component where this metric lives */
  component: string;
  /** Path within component (dot notation, optional) */
  path?: string;
  /** Source plugin ID (optional) */
  source?: string;
  /** Human-readable label */
  label?: string;
  /** Description */
  description?: string;
}

/**
 * Metric registry configuration
 * Stored in GameWorld.meta.metrics
 */
export interface MetricRegistry {
  /** NPC relationship metrics */
  npcRelationship?: Record<string, MetricDefinition>;
  /** NPC behavior metrics */
  npcBehavior?: Record<string, MetricDefinition>;
  /** Player state metrics */
  playerState?: Record<string, MetricDefinition>;
  /** World state metrics */
  worldState?: Record<string, MetricDefinition>;
  /** Custom metric categories */
  [category: string]: Record<string, MetricDefinition> | undefined;
}

// ===================
// Game Mode & View State Types [frontend-only]
// ===================

/**
 * Game mode represents the high-level state of what the player is currently doing
 * - 'map': Browsing world/region map overview
 * - 'room': In a specific location/room
 * - 'scene': Running a scene graph / cutscene
 * - 'conversation': In a narrative program / chat/dialogue view
 * - 'menu': Global menu / settings
 */
export type GameMode =
  | 'map'
  | 'room'
  | 'scene'
  | 'conversation'
  | 'menu';

/**
 * Game context provides a unified view of the current game state
 * Shared between frontend and backend to ensure consistent mode transitions
 */
export interface GameContext {
  /** Current game mode */
  mode: GameMode;
  /** Current world ID */
  worldId: WorldId;
  /** Current session ID */
  sessionId: SessionId;
  /** Current location ID (game_locations.id) when in room mode */
  locationId?: LocationId;
  /** Active scene ID when in scene mode */
  sceneId?: SceneId;
  /** Focused NPC ID (in conversation/room) */
  npcId?: NpcId;
  /** Active narrative program ID, if any */
  narrativeProgramId?: string;
}
