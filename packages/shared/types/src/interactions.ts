/**
 * Canonical Interaction Model
 *
 * Phase 17.2: Unified interaction types that bridge:
 * - Hotspot actions (scene-centric)
 * - Plugin interactions (NPC-centric today, target-agnostic in schema)
 * - Dialogue flows (narrative-centric)
 * - Action blocks (visual generation-centric)
 *
 * Design Principles:
 * - Build ON TOP of existing plugin system
 * - Extend BaseInteractionConfig with gating/outcome metadata
 * - Align with action block BranchIntent concept
 * - Store definitions in GameWorld.meta (no new DB tables)
 *
 * Type Alignment:
 * - Backend source: pixsim7/backend/main/domain/game/interactions/interactions.py
 * - These types mirror the Python Pydantic models for API compatibility
 * - OpenAPI types (ApiComponents['schemas']['InteractionSurface'] etc.) are auto-generated
 *   but may be stale. Run `pnpm openapi:gen` to regenerate after backend changes.
 * - Frontend extends backend types with 'ambient' surface (frontend-only)
 */

import type { components } from './openapi.generated';
import type { EntityRef } from './ids';
import type { GizmoConfig, GizmoSessionResult } from './gizmos';

// ===================
// Core Enums
// ===================

/**
 * Backend interaction surface enum - from OpenAPI.
 * Values: 'inline' | 'dialogue' | 'scene' | 'notification' | 'menu'
 */
export type InteractionSurface = components['schemas']['InteractionSurface'];

/**
 * Extended interaction surface - includes frontend-only values.
 * Use this type in frontend code that may need extended surfaces.
 */
export type InteractionSurfaceExtended =
  | InteractionSurface
  | 'ambient'       // Background/passive interaction (frontend-only)
  | 'gizmo';        // Interactive gizmo surface (generic surface interaction system)

/**
 * Branch intent - narrative direction control.
 * Canonical IDs aligned with ontology.yaml branch_intents.
 * Values use ontology prefix format: branch:<id>
 */
export type BranchIntent =
  | 'branch:escalate'      // Increase intimacy/intensity
  | 'branch:cool_down'     // Reduce tension/intensity
  | 'branch:side_branch'   // Divergent event (interruption, etc.)
  | 'branch:maintain'      // Keep current intensity level
  | 'branch:resolve';      // Resolve tension/conflict

/**
 * Branch intent alias for interactions.
 */
export type InteractionBranchIntent = BranchIntent;

/**
 * Interaction availability reason codes - from OpenAPI.
 * NOTE: OpenAPI may be stale. Backend source has: mood_incompatible, npc_unavailable,
 * npc_busy, time_incompatible, flag_required, flag_forbidden, cooldown_active,
 * location_incompatible, stat_gating_failed, custom
 */
export type InteractionDisabledReason = components['schemas']['DisabledReason'];

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
 * Generic stat gating constraint
 */
export interface StatAxisGate {
  /** Stat definition ID (e.g., "relationships") */
  definitionId: string;
  /** Stat axis name (e.g., "affinity") */
  axis?: string;
  /** Minimum numeric threshold */
  minValue?: number;
  /** Maximum numeric threshold */
  maxValue?: number;
  /** Minimum tier ID */
  minTierId?: string;
  /** Maximum tier ID */
  maxTierId?: string;
  /** Minimum level ID */
  minLevelId?: string;
  /** Entity scope */
  entityType?: 'npc' | 'session' | 'world';
  /** Canonical entity reference (e.g., "npc:123") */
  entityRef?: EntityRef;
  /** NPC ID when entityType is "npc" */
  npcId?: number;
}

/**
 * Stat-based gating constraints
 */
export interface StatGating {
  allOf?: StatAxisGate[];
  anyOf?: StatAxisGate[];
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
  /** Stat-based constraints */
  statGating?: StatGating;

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

/**
 * Generic stat delta applied by interactions
 */
export interface StatDelta {
  /** Stat package ID (e.g., "core.relationships") */
  packageId: string;
  /** Stat definition ID within the package */
  definitionId?: string;
  /** Map of axis_name -> delta_value */
  axes: Record<string, number>;
  /** Entity scope for this stat delta */
  entityType?: 'npc' | 'session' | 'world';
  /** Canonical entity reference (e.g., "npc:123") */
  entityRef?: EntityRef;
  /** NPC ID when entityType is "npc" */
  npcId?: number;
}

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
 * Target memory/emotion effects (currently NPC-only)
 */
export interface TargetEffects {
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
  branchIntent?: InteractionBranchIntent;
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
  branchIntent?: InteractionBranchIntent;
}

/**
 * Unified outcome configuration for an interaction
 */
export interface InteractionOutcome {
  /** Stat metric changes */
  statDeltas?: StatDelta[];

  /** Session flag changes */
  flagChanges?: FlagChanges;

  /** Inventory changes */
  inventoryChanges?: InventoryChanges;

  /** NPC memory/emotion effects */
  targetEffects?: TargetEffects;

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
 * Target reference for an interaction
 */
export interface InteractionTarget {
  /** Canonical entity reference (e.g., "npc:123") */
  ref?: EntityRef;
  /** Target kind (e.g., "npc") */
  kind?: string;

  /** Runtime target ID */
  id?: number | string;

  /** Template kind for resolving via ObjectLink */
  templateKind?: string;

  /** Template entity ID */
  templateId?: string;

  /** Optional explicit link ID */
  linkId?: string;
}

/**
 * Interaction participant with a role label
 */
export interface InteractionParticipant extends InteractionTarget {
  /** Participant role (e.g., "actor", "item", "location") */
  role: string;
}

/**
 * Interaction definition - what designers author in data
 * Stored in GameWorld.meta.interactions.definitions
 */
export interface InteractionDefinition {
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

  /** Target refs or role patterns (e.g., "npc:123", "role:shopkeeper") */
  targetRolesOrIds?: string[];
  /** Explicit target IDs (runtime IDs) */
  targetIds?: Array<number | string>;

  /** Template/Link target references (additive, backward compatible)
   * Allows interactions to target template entities that resolve to runtime entities via ObjectLink
   */
  targetTemplateKind?: string;  // e.g., 'characterInstance', 'itemTemplate'
  targetTemplateId?: string;    // Template entity ID (usually UUID)
  targetLinkId?: string;        // Optional explicit link ID

  /** Participants required by this interaction */
  participants?: InteractionParticipant[];

  /** Primary participant role */
  primaryRole?: string;

  /** Which surface this interaction uses */
  surface: InteractionSurfaceExtended;

  /** Branch intent (narrative direction) */
  branchIntent?: InteractionBranchIntent;

  /** Gating rules */
  gating?: InteractionGating;

  /** Outcome effects */
  outcome?: InteractionOutcome;

  /** Plugin-specific configuration */
  pluginConfig?: Record<string, unknown>;

  /**
   * Gizmo configuration (when surface === 'gizmo').
   * Specifies which profile to load and any overrides.
   */
  gizmoConfig?: GizmoConfig;

  /** Underlying plugin ID (if this wraps an existing plugin) */
  underlyingPluginId?: string;

  /** Priority/sort order (higher = shown first) */
  priority?: number;

  /** Whether this interaction can be initiated by the target */
  targetCanInitiate?: boolean;

  /** Designer metadata */
  meta?: Record<string, unknown>;
}

/**
 * Interaction instance - concrete available interaction at runtime
 * Returned by availability API
 */
export interface InteractionInstance {
  /** Unique instance ID (ephemeral, for this request) */
  id: string;

  /** Reference to the definition */
  definitionId: string;

  /** Concrete target this is for */
  target: InteractionTarget;

  /** All participants included with the interaction */
  participants?: InteractionParticipant[];

  /** Primary participant role */
  primaryRole?: string;

  /** World ID */
  worldId: number;

  /** Session ID */
  sessionId: number;

  /** Surface to use */
  surface: InteractionSurfaceExtended;

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

  /** Target's current activity ID (from behavior system) */
  currentActivityId?: string;

  /** Target's current state tags */
  stateTags?: string[];

  /** Mood tags */
  moodTags?: string[];

  /** Stat snapshot (definitionId -> entityKey -> stats) */
  statsSnapshot?: Record<string, Record<string, unknown>>;

  /** Current world time (seconds) */
  worldTime?: number;

  /** Session flags snapshot */
  sessionFlags?: Record<string, unknown>;

  /** Last used timestamps (for cooldown) */
  lastUsedAt?: Record<string, number>;

  /** Participants included in this interaction */
  participants?: InteractionParticipant[];

  /** Primary participant role */
  primaryRole?: string;
}

// ===================
// Request/Response Types
// ===================

/**
 * Request to list available interactions for a target
 */
export interface ListInteractionsRequest {
  worldId: number;
  sessionId: number;
  target?: InteractionTarget;
  participants?: InteractionParticipant[];
  primaryRole?: string;
  locationId?: number;
  includeUnavailable?: boolean;
}

/**
 * Response with available interactions
 */
export interface ListInteractionsResponse {
  interactions: InteractionInstance[];
  target?: InteractionTarget;
  participants?: InteractionParticipant[];
  primaryRole?: string;
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
  target?: InteractionTarget;
  participants?: InteractionParticipant[];
  primaryRole?: string;
  interactionId: string;

  /** Optional player input (for dialogue, etc.) */
  playerInput?: string;

  /** Gizmo session result (when surface === 'gizmo') */
  gizmoResult?: GizmoSessionResult;

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

  /** Stat deltas applied */
  statDeltas?: StatDelta[];

  /** Flag changes applied */
  flagChanges?: string[];

  /** Inventory changes applied */
  inventoryChanges?: { added?: string[]; removed?: string[] };

  /** Scene launched (if any) */
  launchedSceneId?: number;

  /** Generation request ID (if any) */
  generationRequestId?: string;

  /** Gizmo session result (when surface === 'gizmo') */
  gizmoResult?: GizmoSessionResult;

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
  definitions: Record<string, InteractionDefinition>;

  /** Default interactions by role */
  roleDefaults?: Record<string, string[]>;  // role → interaction IDs

  /** Scene intent → scene ID mappings */
  sceneIntentMappings?: Record<string, number>;
}

/**
 * Target-level interaction overrides
 * Stored in target meta.interactions (e.g., GameNPC.meta.interactions)
 */
export interface TargetInteractionsMetadata {
  /** Override specific interaction definitions */
  definitionOverrides?: Record<string, Partial<InteractionDefinition>>;

  /** Disable specific interactions */
  disabledInteractions?: string[];

  /** Add target-specific interactions */
  additionalInteractions?: InteractionDefinition[];
}

/**
 * Session-level interaction state
 * Stored in GameSession.flags.npcs["npc:<id>"].interactions (npc targets)
 */
export interface SessionInteractionState {
  /** Last used timestamps (for cooldown) */
  lastUsedAt?: Record<string, number>;

  /** Interaction-specific state */
  interactionState?: Record<string, unknown>;

  /** Pending target-initiated interactions */
  pendingFromTarget?: Array<{
    interactionId: string;
    createdAt: number;
    expiresAt?: number;
  }>;
}

// ===================
// Target-Initiated Interactions
// ===================

/**
 * Target-initiated interaction intent
 * Emitted by behavior system, queued in session
 */
export interface InteractionIntent {
  /** Unique intent ID */
  id: string;

  /** Target initiating the interaction */
  target: InteractionTarget;

  /** Interaction definition ID */
  definitionId: string;

  /** When this intent was created */
  createdAt: number;

  /** When this intent expires */
  expiresAt?: number;

  /** Priority (higher = more urgent) */
  priority?: number;

  /** Preferred surface (can be overridden by player) */
  preferredSurface?: InteractionSurfaceExtended;

  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Interaction inbox in session flags
 * Stored in GameSession.flags.interactionInbox
 */
export type InteractionInbox = InteractionIntent[];

// ===================
// Backwards Compatibility Notes
// ===================
//
// InteractionSurface is now the base OpenAPI type (backend values only).
// InteractionSurfaceExtended extends it with frontend-only 'ambient' value.
// Use InteractionSurfaceExtended when you need the full set including ambient.
