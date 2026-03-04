/**
 * Game Behavior API Client
 *
 * Thin wrappers around pixsimClient for the `/game/worlds/{worldId}/behavior` endpoints.
 * Used by the routine graph service to load/save NPC behavior routines.
 */
import { pixsimClient } from './client';

// ============================================================================
// Types
// ============================================================================

/** Raw backend behavior config as returned by GET /behavior */
export interface BehaviorConfigResponse {
  version: number;
  activities: Record<string, unknown>;
  routines: Record<string, BackendRoutineGraph>;
  activityCategories?: Record<string, unknown>;
  npcConfig?: Record<string, unknown>;
  scoringConfig?: Record<string, unknown>;
  simulationConfig?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

/** Backend routine graph shape (no position/label on nodes, no id/label on edges) */
export interface BackendRoutineGraph {
  id: string;
  version: number;
  name: string;
  nodes: BackendRoutineNode[];
  edges: BackendRoutineEdge[];
  startNodeId?: string;
  defaultPreferences?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface BackendRoutineNode {
  id: string;
  nodeType: string;
  timeRangeSeconds?: { start: number; end: number };
  preferredActivities?: Array<{
    activityId: string;
    weight: number;
    conditions?: unknown[];
  }>;
  decisionConditions?: unknown[];
  meta?: Record<string, unknown>;
}

export interface BackendRoutineEdge {
  fromNodeId: string;
  toNodeId: string;
  conditions?: unknown[];
  weight?: number;
  transitionEffects?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

// ============================================================================
// API Functions
// ============================================================================

/** Fetch the full behavior config for a world. */
export async function getWorldBehavior(worldId: number): Promise<BehaviorConfigResponse> {
  return pixsimClient.get<BehaviorConfigResponse>(`/game/worlds/${worldId}/behavior`);
}

/** Create a new routine graph in a world's behavior config. */
export async function createWorldRoutine(
  worldId: number,
  routine: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return pixsimClient.post<Record<string, unknown>>(
    `/game/worlds/${worldId}/behavior/routines`,
    { routine },
  );
}

/** Update an existing routine graph. */
export async function updateWorldRoutine(
  worldId: number,
  routineId: string,
  routine: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return pixsimClient.put<Record<string, unknown>>(
    `/game/worlds/${worldId}/behavior/routines/${routineId}`,
    { routine },
  );
}

/** Delete a routine graph from a world's behavior config. */
export async function deleteWorldRoutine(
  worldId: number,
  routineId: string,
): Promise<{ deleted: string }> {
  return pixsimClient.delete<{ deleted: string }>(
    `/game/worlds/${worldId}/behavior/routines/${routineId}`,
  );
}
