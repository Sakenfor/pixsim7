/**
 * Routine Graph Types
 *
 * TypeScript types matching the backend RoutineGraphSchema.
 * Uses shared graph utility conventions (from/to for edges).
 */

import type { NodeWithId, EdgeWithFromTo } from '@pixsim7/shared.graph.utilities';

// ============================================================================
// Condition Types (shared with backend)
// ============================================================================

export interface ConditionSchema {
  type: string;
  npcIdOrRole?: string;
  metric?: string;
  threshold?: number;
  key?: string;
  value?: unknown;
  moodTags?: string[];
  min?: number;
  max?: number;
  probability?: number;
  times?: string[];
  locationTypes?: string[];
  evaluatorId?: string;
  params?: Record<string, unknown>;
  expression?: string;
}

// ============================================================================
// Activity Types
// ============================================================================

export interface PreferredActivity {
  activityId: string;
  weight: number; // 0-10, >1 = strong preference
  conditions?: ConditionSchema[];
}

export interface ActivityEffects {
  energyDelta?: number;
  moodValenceDelta?: number;
  moodArousalDelta?: number;
  relationshipDeltas?: Record<string, RelationshipDelta>;
  flagChanges?: Record<string, unknown>;
}

export interface RelationshipDelta {
  affinity?: number;
  trust?: number;
  chemistry?: number;
  tension?: number;
}

// ============================================================================
// Routine Node Types
// ============================================================================

export type RoutineNodeType = 'time_slot' | 'decision' | 'activity';

export interface TimeRange {
  start: number; // Seconds from midnight (0-86400)
  end: number;   // Seconds from midnight (0-86400)
}

/**
 * Routine node - extends NodeWithId for shared utility compatibility
 */
export interface RoutineNode extends NodeWithId {
  id: string;
  nodeType: RoutineNodeType;
  position: { x: number; y: number };

  // For time_slot nodes
  timeRangeSeconds?: TimeRange;

  // For all nodes - activities available at this node
  preferredActivities?: PreferredActivity[];

  // For decision nodes
  decisionConditions?: ConditionSchema[];

  // Display
  label?: string;

  // Extension
  meta?: Record<string, unknown>;
}

// ============================================================================
// Routine Edge Types
// ============================================================================

/**
 * Routine edge - uses from/to for shared utility compatibility
 * Maps to backend's fromNodeId/toNodeId
 */
export interface RoutineEdge extends EdgeWithFromTo {
  id: string;
  from: string;  // Source node ID (backend: fromNodeId)
  to: string;    // Target node ID (backend: toNodeId)
  conditions?: ConditionSchema[];
  weight?: number; // Default 1.0
  transitionEffects?: ActivityEffects;
  label?: string;
  meta?: Record<string, unknown>;
}

// ============================================================================
// Routine Graph (Complete)
// ============================================================================

export interface RoutineGraph {
  id: string;
  version: number;
  name: string;
  nodes: RoutineNode[];
  edges: RoutineEdge[];
  startNodeId?: string;
  defaultPreferences?: NpcPreferences;
  updatedAt?: string;
  meta?: Record<string, unknown>;
}

export interface NpcPreferences {
  activityWeights?: Record<string, number>;
  categoryWeights?: Record<string, number>;
  preferredNpcIdsOrRoles?: string[];
  avoidedNpcIdsOrRoles?: string[];
  favoriteLocations?: string[];
  morningPerson?: boolean;
  nightOwl?: boolean;
  meta?: Record<string, unknown>;
}

// ============================================================================
// UI Helpers
// ============================================================================

export function formatTimeRange(range: TimeRange): string {
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;
  };
  return `${formatTime(range.start)} - ${formatTime(range.end)}`;
}

export function getNodeTypeLabel(type: RoutineNodeType): string {
  switch (type) {
    case 'time_slot': return 'Time Slot';
    case 'decision': return 'Decision';
    case 'activity': return 'Activity';
    default: return type;
  }
}

export function getNodeTypeColor(type: RoutineNodeType): string {
  switch (type) {
    case 'time_slot': return '#3b82f6'; // blue
    case 'decision': return '#f59e0b'; // amber
    case 'activity': return '#10b981'; // emerald
    default: return '#6b7280'; // gray
  }
}

// ============================================================================
// Backend Serialization Helpers
// ============================================================================

/**
 * Convert frontend edge (from/to) to backend format (fromNodeId/toNodeId)
 */
export function toBackendEdge(edge: RoutineEdge): {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  conditions?: ConditionSchema[];
  weight?: number;
  transitionEffects?: ActivityEffects;
  label?: string;
  meta?: Record<string, unknown>;
} {
  return {
    ...edge,
    fromNodeId: edge.from,
    toNodeId: edge.to,
  };
}

/**
 * Convert backend edge (fromNodeId/toNodeId) to frontend format (from/to)
 */
export function fromBackendEdge(edge: {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  conditions?: ConditionSchema[];
  weight?: number;
  transitionEffects?: ActivityEffects;
  label?: string;
  meta?: Record<string, unknown>;
}): RoutineEdge {
  return {
    id: edge.id,
    from: edge.fromNodeId,
    to: edge.toNodeId,
    conditions: edge.conditions,
    weight: edge.weight,
    transitionEffects: edge.transitionEffects,
    label: edge.label,
    meta: edge.meta,
  };
}
