/**
 * Authoring Completeness Types
 *
 * Shared types for entity completeness checks across the authoring package.
 * These are framework-agnostic — no React, no API calls.
 */

/**
 * Individual completeness check result.
 *
 * Each check tests one aspect of an entity's readiness for play
 * (e.g., "has at least one expression" for an NPC).
 */
export interface CompletenessCheck {
  /** Stable identifier for this check (e.g., 'npc.hasExpressions') */
  id: string;
  /** Human-readable label */
  label: string;
  /** Whether the check passed, failed, or raised a warning */
  status: 'complete' | 'incomplete' | 'warning';
  /** Optional explanation */
  detail?: string;
}

/**
 * Completeness report for a single entity.
 *
 * The `score` is the fraction of checks that passed (0–1).
 * A score of 1.0 means the entity is fully ready for play.
 */
export interface EntityCompleteness {
  entityType: 'npc' | 'location' | 'scene';
  entityId: number | string;
  entityName: string;
  checks: CompletenessCheck[];
  /** 0–1 ratio of complete checks to total checks */
  score: number;
}

/**
 * Aggregate completeness across many entities.
 */
export interface AggregateCompleteness {
  totalEntities: number;
  /** Entities where every check passed */
  fullyComplete: number;
  /** Entities where at least one check failed */
  incomplete: number;
  /** Average score across all entities (0–1) */
  averageScore: number;
}

// ---------------------------------------------------------------------------
// Lightweight input shapes
// ---------------------------------------------------------------------------
// The authoring package accepts these minimal shapes so it stays decoupled
// from the full API DTO types.  Callers map their API responses into these.
// ---------------------------------------------------------------------------

/** Minimal NPC data needed for completeness checks */
export interface NpcAuthoringInput {
  id: number | string;
  name: string;
  /** NPC meta bag — may contain preferences, traits, brain, etc. */
  meta?: Record<string, unknown> | null;
  /** Portrait asset reference */
  portraitAssetId?: number | null;
  /** Home location FK */
  homeLocationId?: number | null;
  /** Expression states mapped to this NPC */
  expressions?: Array<{ state: string; asset_id?: number | null }>;
  /** Schedule entries (routine slots or NpcSchedule rows) */
  scheduleEntries?: Array<{ location_id?: number | null }>;
  /** Routine graph nodes (from routine-graph feature) */
  routineNodes?: Array<{ id: string; nodeType: string }>;
}

/** Minimal location data needed for completeness checks */
export interface LocationAuthoringInput {
  id: number | string;
  name: string;
  /** Background asset reference */
  assetId?: number | null;
  /** Hotspot list */
  hotspots?: Array<{
    hotspot_id: string;
    action?: { type: string; [key: string]: unknown } | null;
  }>;
  /** 2D NPC slot definitions */
  npcSlots2d?: Array<{ id: string }>;
  meta?: Record<string, unknown> | null;
}

/** Minimal scene data needed for completeness checks */
export interface SceneAuthoringInput {
  id: number | string;
  title: string;
  /** ID of the entry/start node */
  startNodeId?: number | string | null;
  /** All nodes in the scene */
  nodes?: Array<{
    id: number | string;
    /** Node type hint from meta (e.g., 'video', 'choice', 'end', 'condition') */
    nodeType?: string;
    /** Whether this node has at least one outgoing edge */
    hasOutgoingEdge?: boolean;
    /** Whether this node has an asset or generation config */
    hasContent?: boolean;
  }>;
  /** All edges in the scene */
  edges?: Array<{
    from_node_id: number | string;
    to_node_id: number | string;
  }>;
}
