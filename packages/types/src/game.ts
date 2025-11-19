/**
 * Game DTO types for PixSim7 game systems
 * Shared between frontend and game-core
 */

// ===================
// Location Types
// ===================

export interface GameLocationSummary {
  id: number;
  name: string;
  asset_id?: number | null;
  default_spawn?: string | null;
}

export interface GameHotspotDTO {
  id?: number;
  object_name: string;
  hotspot_id: string;
  linked_scene_id?: number | null;
  meta?: Record<string, unknown> | null;
}

export interface NpcTalkConfig {
  npcId?: number | null; // Optional override; else use assigned NPC
  preferredSceneId?: number | null;
}

export interface PickpocketConfig {
  baseSuccessChance: number;
  detectionChance: number;
  onSuccessFlags?: string[];
  onFailFlags?: string[];
}

export interface NpcSlotInteractions {
  canTalk?: boolean;
  npcTalk?: NpcTalkConfig;
  canPickpocket?: boolean;
  pickpocket?: PickpocketConfig;
}

export interface NpcSlot2d {
  id: string;
  x: number; // Normalized 0-1 position
  y: number; // Normalized 0-1 position
  roles?: string[];
  fixedNpcId?: number | null;
  interactions?: NpcSlotInteractions;
}

export interface GameLocationDetail {
  id: number;
  name: string;
  asset_id?: number | null;
  default_spawn?: string | null;
  meta?: Record<string, unknown> | null;
  hotspots: GameHotspotDTO[];
}

// ===================
// NPC Types
// ===================

export interface GameNpcSummary {
  id: number;
  name: string;
}

export interface GameNpcDetail extends GameNpcSummary {
  /** NPC metadata including preferences, traits, etc. */
  meta?: Record<string, unknown> | null;
  /** Bio/description */
  bio?: string | null;
  /** Current relationship level with player (0-100) */
  relationshipLevel?: number;
}

export interface NpcExpressionDTO {
  id?: number;
  state: string;
  asset_id: number;
  crop?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
}

export interface NpcPresenceDTO {
  npc_id: number;
  location_id: number;
  state: Record<string, unknown>;
}

// ===================
// World Types
// ===================

export interface GameWorldSummary {
  id: number;
  name: string;
}

export interface GameWorldDetail {
  id: number;
  name: string;
  meta?: Record<string, unknown> | null;
  world_time: number;
}

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
  /** List of arc graph IDs enabled in this world */
  enabled_arc_graphs?: string[];
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

// ===================
// Session Types
// ===================

export type SessionKind = 'world' | 'scene';
export type WorldMode = 'turn_based' | 'real_time';

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

export interface GameSessionDTO {
  id: number;
  user_id: number;
  scene_id: number;
  current_node_id: number;
  flags: Record<string, unknown>;
  relationships: Record<string, unknown>;
  world_time: number;
  version: number; // Optimistic locking version, incremented on each update
}

/**
 * Type-safe session update payload - only includes mutable fields
 * Prevents accidentally updating readonly fields like id, user_id, etc.
 */
export interface SessionUpdatePayload {
  world_time?: number;
  flags?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
  expected_version?: number; // For optimistic locking
}

// ===================
// Stealth/Interaction Types
// ===================

export interface PickpocketRequest {
  npc_id: number;
  slot_id: string;
  base_success_chance: number;
  detection_chance: number;
  world_id?: number | null;
  session_id: number;
}

export interface PickpocketResponse {
  success: boolean;
  detected: boolean;
  updated_flags: Record<string, unknown>;
  message: string;
}

// Romance/Sensual Touch Types
export interface SensualTouchRequest {
  npc_id: number;
  slot_id: string;
  tool_id: string; // 'touch', 'caress', 'feather', 'silk', etc.
  pattern: string; // 'circular', 'linear', 'spiral', 'wave', 'pulse'
  base_intensity: number; // 0-1
  duration: number; // seconds
  world_id?: number | null;
  session_id: number;
}

export interface SensualTouchResponse {
  success: boolean;
  pleasure_score: number; // 0-1, how much NPC enjoyed it
  arousal_change: number; // Change in arousal level
  affinity_change: number; // Change in relationship score
  tool_unlocked: string | null; // New tool unlocked, if any
  updated_flags: Record<string, unknown>;
  message: string;
}

// ===================
// Quest Types
// ===================

export interface QuestObjectiveDTO {
  id: string;
  description: string;
  completed: boolean;
  progress: number;
  target: number;
  optional: boolean;
}

export interface QuestDTO {
  id: string;
  title: string;
  description: string;
  status: string; // 'active' | 'completed' | 'failed' | 'hidden'
  objectives: QuestObjectiveDTO[];
  metadata: Record<string, unknown>;
}

// ===================
// Inventory Types
// ===================

export interface InventoryItemDTO {
  id: string;
  name: string;
  quantity: number;
  metadata: Record<string, unknown>;
}

// ===================
// Relationship Preview Types
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
  tierId: string | null;
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
  intimacyLevelId: string | null;
  relationshipValues: RelationshipValues;
}

// ===================
// Generic Metric System Types
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
// NPC Mood Metric Types
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
// Reputation Metric Types
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
