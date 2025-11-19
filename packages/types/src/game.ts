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

// ===================
// Relationship Tier / Intimacy ID Types
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
// Unified Mood Types
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

// ===================
// NPC Behavior System Types (Task 13)
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

/**
 * Relationship delta for activity effects
 */
export interface RelationshipDelta {
  affinity?: number;
  trust?: number;
  chemistry?: number;
  tension?: number;
}

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
// ECS Component Types (Task 19)
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
 * Stealth state component
 * Manages stealth-related interactions and reputation
 * Component key: "stealth"
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
