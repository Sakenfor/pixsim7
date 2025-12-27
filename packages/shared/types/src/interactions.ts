/**
 * Canonical NPC Interaction Model
 *
 * Phase 17.2: Unified interaction types that bridge:
 * - Hotspot actions (scene-centric)
 * - Plugin interactions (NPC-centric)
 * - Dialogue flows (narrative-centric)
 * - Action blocks (visual generation-centric)
 *
 * Design Principles:
 * - Build ON TOP of existing plugin system
 * - Extend BaseInteractionConfig with gating/outcome metadata
 * - Align with action block BranchIntent concept
 * - Store definitions in GameWorld.meta (no new DB tables)
 */

import type { RelationshipDelta } from './game';

// ===================
// Core Enums
// ===================

/**
 * Interaction surface - where/how the interaction is presented
 * Aligns with existing plugin uiMode concept
 */
export type NpcInteractionSurface =
  | 'inline'        // Small text/choice UI (e.g. 2D HUD notification)
  | 'dialogue'      // Dialogue box / chat window (opens conversation)
  | 'scene'         // Full scene transition (launches scene graph)
  | 'notification'  // Off-screen ping, message queue
  | 'menu'          // Context menu / action list
  | 'ambient';      // Background/passive interaction

/**
 * Branch intent - narrative direction control
 * Reused from action blocks system
 */
export type NpcInteractionBranchIntent =
  | 'escalate'      // Increase intimacy/intensity
  | 'cool_down'     // Reduce tension/intensity
  | 'side_branch'   // Divergent event (interruption, etc.)
  | 'maintain'      // Keep current intensity level
  | 'resolve';      // Resolve tension/conflict

/**
 * Interaction availability reason codes
 */
export type InteractionDisabledReason =
  | 'relationship_too_low'
  | 'relationship_too_high'
  | 'mood_incompatible'
  | 'npc_unavailable'      // Based on behavior/schedule
  | 'npc_busy'             // Based on current activity
  | 'time_incompatible'
  | 'flag_required'
  | 'flag_forbidden'
  | 'cooldown_active'
  | 'location_incompatible'
  | 'custom';

// ===================
// Gating Schema
// ===================

/**
 * Time of day constraint
 */
export interface TimeOfDayConstraint {
  /** Periods when this interaction is available */
  periods?: Array<'morning' | 'afternoon' | 'evening' | 'night'>;

  /** Specific hour ranges (24-hour format) */
  hourRanges?: Array<{ start: number; end: number }>;

  /** @deprecated Use hourRanges */
  minHour?: number;
  /** @deprecated Use hourRanges */
  maxHour?: number;
}

/**
 * Relationship gating constraints
 * Uses world-defined tier IDs and metric thresholds
 */
export interface RelationshipGating {
  /** Minimum relationship tier (from world's tier schema) */
  minTierId?: string;
  /** @deprecated Use minTierId */
  minTier?: string;

  /** Maximum relationship tier (interaction disabled if exceeded) */
  maxTierId?: string;
  /** @deprecated Use maxTierId */
  maxTier?: string;

  /** Minimum affinity value (0-100) */
  minAffinity?: number;

  /** Minimum trust value (0-100) */
  minTrust?: number;

  /** Minimum chemistry value (0-100) */
  minChemistry?: number;

  /** Maximum tension value (0-100, interaction disabled if exceeded) */
  maxTension?: number;

  /** Minimum intimacy level (from world's intimacy schema) */
  minIntimacyLevel?: string;
}

/**
 * NPC behavior/state gating constraints
 * Integrates with Task 13 behavior system
 */
export interface BehaviorGating {
  /** NPC must be in one of these states (from behavior system) */
  allowedStates?: string[];

  /** NPC must NOT be in any of these states */
  forbiddenStates?: string[];

  /** NPC must be performing one of these activities */
  allowedActivities?: string[];

  /** NPC must NOT be performing any of these activities */
  forbiddenActivities?: string[];

  /** NPC's simulation tier must be at least this level */
  minSimulationTier?: 'dormant' | 'ambient' | 'active' | 'detailed';
}

/**
 * Mood/emotion gating constraints
 */
export interface MoodGating {
  /** Compatible mood tags */
  allowedMoods?: string[];

  /** Incompatible mood tags */
  forbiddenMoods?: string[];

  /** Maximum emotion intensity (0-1, interaction disabled if any emotion exceeds) */
  maxEmotionIntensity?: number;
}

/**
 * Unified gating configuration for an interaction
 */
export interface InteractionGating {
  /** Relationship constraints */
  relationship?: RelationshipGating;

  /** Time of day constraints */
  timeOfDay?: TimeOfDayConstraint;

  /** NPC behavior/state constraints */
  behavior?: BehaviorGating;

  /** Mood/emotion constraints */
  mood?: MoodGating;

  /** Required session flags (arc progress, quest states, events) */
  requiredFlags?: string[];

  /** Forbidden session flags */
  forbiddenFlags?: string[];

  /** Cooldown duration in seconds */
  cooldownSeconds?: number;

  /** Custom gating logic reference (plugin-specific) */
  customGatingId?: string;
}

// ===================
// Outcome Schema
// ===================

// RelationshipDelta is exported from game.ts to avoid duplicate

/**
 * Flag changes to apply to session
 */
export interface FlagChanges {
  /** Flags to set (key → value) */
  set?: Record<string, unknown>;

  /** Flags to delete */
  delete?: string[];

  /** Flags to increment (numerical flags) */
  increment?: Record<string, number>;

  /** Arc stage updates (stage ID can be string or numeric index) */
  arcStages?: Record<string, string | number>;

  /** Quest status updates */
  questUpdates?: Record<string, 'pending' | 'active' | 'completed' | 'failed'>;

  /** Event triggers */
  triggerEvents?: string[];

  /** Event ends */
  endEvents?: string[];
}

/**
 * Inventory changes as a result of interaction
 */
export interface InventoryChanges {
  /** Items to add */
  add?: Array<{ itemId: string; quantity?: number }>;

  /** Items to remove */
  remove?: Array<{ itemId: string; quantity?: number }>;
}

/**
 * NPC memory/emotion effects
 */
export interface NpcEffects {
  /** Create a memory record */
  createMemory?: {
    topic: string;
    summary: string;
    importance?: 'trivial' | 'normal' | 'important' | 'critical';
    memoryType?: 'short_term' | 'long_term' | 'core';
    tags?: string[];
  };

  /** Trigger an emotion */
  triggerEmotion?: {
    emotion: string;
    intensity: number;
    durationSeconds?: number;
  };

  /** Register a world event */
  registerWorldEvent?: {
    eventType: string;
    eventName: string;
    description: string;
    relevanceScore?: number;
  };
}

/**
 * Scene/generation launch configuration
 */
export interface SceneLaunch {
  /** Scene intent ID (world maps intent → specific scene) */
  sceneIntentId?: string;

  /** Direct scene ID (overrides intent mapping) */
  sceneId?: number;

  /** Role bindings for scene (e.g., { "speaker": "npc:123" }) */
  roleBindings?: Record<string, string>;

  /** Branch intent to pass to scene */
  branchIntent?: NpcInteractionBranchIntent;
}

/**
 * Generation/action block configuration
 */
export interface GenerationLaunch {
  /** Action block IDs to queue */
  actionBlockIds?: string[];

  /** Dialogue generation request */
  dialogueRequest?: {
    programId?: string;
    systemPrompt?: string;
  };

  /** Branch intent for generation context */
  branchIntent?: NpcInteractionBranchIntent;
}

/**
 * Unified outcome configuration for an interaction
 */
export interface InteractionOutcome {
  /** Relationship metric changes */
  relationshipDeltas?: RelationshipDelta;

  /** Session flag changes */
  flagChanges?: FlagChanges;

  /** Inventory changes */
  inventoryChanges?: InventoryChanges;

  /** NPC memory/emotion effects */
  npcEffects?: NpcEffects;

  /** Scene to launch */
  sceneLaunch?: SceneLaunch;

  /** Generation to trigger */
  generationLaunch?: GenerationLaunch;

  /** Narrative program to launch (unified runtime) */
  narrativeProgramId?: string;

  /** Success message to display */
  successMessage?: string;

  /** Failure message to display */
  failureMessage?: string;

  /** Custom outcome handler (plugin-specific) */
  customOutcomeId?: string;
}

// ===================
// Core Interaction Types
// ===================

/**
 * Interaction definition - what designers author in data
 * Stored in GameWorld.meta.interactions.definitions
 */
export interface NpcInteractionDefinition {
  /** Unique interaction ID (e.g., "interaction:talk_basic") */
  id: string;

  /** Display label ("Talk", "Give Flowers") */
  label: string;

  /** Detailed description */
  description?: string;

  /** Icon/emoji for UI */
  icon?: string;

  /** Category for organization */
  category?: string;

  /** Tags for filtering */
  tags?: string[];

  /** Target NPC IDs or role patterns */
  targetRolesOrIds?: string[];
  /** @deprecated Use targetRolesOrIds */
  targetNpcIds?: number[];

  /** Template/Link target references (additive, backward compatible)
   * Allows interactions to target template entities that resolve to runtime entities via ObjectLink
   */
  targetTemplateKind?: string;  // e.g., 'characterInstance', 'itemTemplate'
  targetTemplateId?: string;    // Template entity ID (usually UUID)
  targetLinkId?: string;        // Optional explicit link ID

  /** Which surface this interaction uses */
  surface: NpcInteractionSurface;

  /** Branch intent (narrative direction) */
  branchIntent?: NpcInteractionBranchIntent;

  /** Gating rules */
  gating?: InteractionGating;

  /** Outcome effects */
  outcome?: InteractionOutcome;

  /** Plugin-specific configuration */
  pluginConfig?: Record<string, unknown>;

  /** Underlying plugin ID (if this wraps an existing plugin) */
  underlyingPluginId?: string;

  /** Priority/sort order (higher = shown first) */
  priority?: number;

  /** Whether this interaction can be initiated by the NPC */
  npcCanInitiate?: boolean;

  /** Designer metadata */
  meta?: Record<string, unknown>;
}

/**
 * Interaction instance - concrete available interaction at runtime
 * Returned by availability API
 */
export interface NpcInteractionInstance {
  /** Unique instance ID (ephemeral, for this request) */
  id: string;

  /** Reference to the definition */
  definitionId: string;

  /** Concrete NPC this is for */
  npcId: number;

  /** World ID */
  worldId: number;

  /** Session ID */
  sessionId: number;

  /** Surface to use */
  surface: NpcInteractionSurface;

  /** Display label (may be customized) */
  label: string;

  /** Icon (may be customized) */
  icon?: string;

  /** Whether this interaction is currently available */
  available: boolean;

  /** If unavailable, why? */
  disabledReason?: InteractionDisabledReason;

  /** Human-readable disabled reason message */
  disabledMessage?: string;

  /** Context snapshot used for gating */
  context?: InteractionContext;

  /** Priority/sort order */
  priority?: number;

  /** Gating rules (copied from definition for convenience) */
  gating?: InteractionGating;

  /** Outcome effects (copied from definition for convenience) */
  outcome?: InteractionOutcome;
}

/**
 * Context snapshot attached to an instance
 * Includes all state used for gating checks
 */
export interface InteractionContext {
  /** Location ID */
  locationId?: number;

  /** NPC's current activity ID (from behavior system) */
  currentActivityId?: string;

  /** NPC's current state tags */
  stateTags?: string[];

  /** Mood tags */
  moodTags?: string[];

  /** Relationship snapshot */
  relationshipSnapshot?: {
    affinity?: number;
    trust?: number;
    chemistry?: number;
    tension?: number;
    tierId?: string;
    intimacyLevelId?: string;
  };

  /** Current world time (seconds) */
  worldTime?: number;

  /** Session flags snapshot */
  sessionFlags?: Record<string, unknown>;

  /** Last used timestamps (for cooldown) */
  lastUsedAt?: Record<string, number>;
}

// ===================
// Request/Response Types
// ===================

/**
 * Request to list available interactions for an NPC
 */
export interface ListInteractionsRequest {
  worldId: number;
  sessionId: number;
  npcId: number;
  locationId?: number;
  includeUnavailable?: boolean;
}

/**
 * Response with available interactions
 */
export interface ListInteractionsResponse {
  interactions: NpcInteractionInstance[];
  npcId: number;
  worldId: number;
  sessionId: number;
  timestamp: number;
}

/**
 * Request to execute an interaction
 */
export interface ExecuteInteractionRequest {
  worldId: number;
  sessionId: number;
  npcId: number;
  interactionId: string;

  /** Optional player input (for dialogue, etc.) */
  playerInput?: string;

  /** Optional additional context */
  context?: Record<string, unknown>;
}

/**
 * Response from interaction execution
 */
export interface ExecuteInteractionResponse {
  success: boolean;

  /** Result message */
  message?: string;

  /** Relationship deltas applied */
  relationshipDeltas?: RelationshipDelta;

  /** Flag changes applied */
  flagChanges?: string[];

  /** Inventory changes applied */
  inventoryChanges?: { added?: string[]; removed?: string[] };

  /** Scene launched (if any) */
  launchedSceneId?: number;

  /** Generation request ID (if any) */
  generationRequestId?: string;

  /** Updated session state */
  updatedSession?: unknown;

  /** Timestamp */
  timestamp: number;
}

// ===================
// Storage Schema
// ===================

/**
 * World-level interaction definitions storage
 * Stored in GameWorld.meta.interactions
 */
export interface WorldInteractionsMetadata {
  /** Interaction definitions */
  definitions: Record<string, NpcInteractionDefinition>;

  /** Default interactions by role */
  roleDefaults?: Record<string, string[]>;  // role → interaction IDs

  /** Scene intent → scene ID mappings */
  sceneIntentMappings?: Record<string, number>;
}

/**
 * NPC-level interaction overrides
 * Stored in GameNPC.meta.interactions
 */
export interface NpcInteractionsMetadata {
  /** Override specific interaction definitions */
  definitionOverrides?: Record<string, Partial<NpcInteractionDefinition>>;

  /** Disable specific interactions */
  disabledInteractions?: string[];

  /** Add NPC-specific interactions */
  additionalInteractions?: NpcInteractionDefinition[];
}

/**
 * Session-level interaction state
 * Stored in GameSession.flags.npcs["npc:<id>"].interactions
 */
export interface SessionInteractionState {
  /** Last used timestamps (for cooldown) */
  lastUsedAt?: Record<string, number>;

  /** Interaction-specific state */
  interactionState?: Record<string, unknown>;

  /** Pending NPC-initiated interactions */
  pendingFromNpc?: Array<{
    interactionId: string;
    createdAt: number;
    expiresAt?: number;
  }>;
}

// ===================
// NPC-Initiated Interactions
// ===================

/**
 * NPC-initiated interaction intent
 * Emitted by behavior system, queued in session
 */
export interface NpcInteractionIntent {
  /** Unique intent ID */
  id: string;

  /** NPC initiating the interaction */
  npcId: number;

  /** Interaction definition ID */
  definitionId: string;

  /** When this intent was created */
  createdAt: number;

  /** When this intent expires */
  expiresAt?: number;

  /** Priority (higher = more urgent) */
  priority?: number;

  /** Preferred surface (can be overridden by player) */
  preferredSurface?: NpcInteractionSurface;

  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Interaction inbox in session flags
 * Stored in GameSession.flags.interactionInbox
 */
export type InteractionInbox = NpcInteractionIntent[];

// ===================
// Backwards Compatibility Aliases
// ===================

/** @deprecated Use NpcInteractionSurface */
export type InteractionSurface = NpcInteractionSurface;
