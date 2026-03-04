/**
 * Routine Graph Service
 *
 * Orchestrates store ↔ API for routine graph persistence.
 * Converts between frontend shapes (with position/label) and backend shapes
 * (which lack those fields — stashed in meta.__editor).
 */
import {
  getWorldBehavior,
  createWorldRoutine,
  updateWorldRoutine,
  deleteWorldRoutine,
} from '@lib/api/gameBehavior';

import { useRoutineGraphStore } from '../stores/routineGraphStore';

import { toBackendGraph, fromBackendRoutines } from './routineGraphConversion';

// ============================================================================
// Race guard for concurrent loads
// ============================================================================

let _loadGeneration = 0;

// ============================================================================
// Load
// ============================================================================

/**
 * Load routines from the backend for a given world.
 * Clears the store immediately, then fetches and hydrates.
 * Includes a race guard: if another load starts before this one finishes,
 * this load's results are discarded.
 */
export async function loadRoutinesForWorld(worldId: number): Promise<void> {
  const generation = ++_loadGeneration;
  const store = useRoutineGraphStore.getState();

  // Clear store immediately and set worldId (as string for store compat)
  store.setWorldId(String(worldId));

  try {
    const config = await getWorldBehavior(worldId);

    // Race guard: bail if a newer load started
    if (generation !== _loadGeneration) return;

    const routines = config.routines ?? {};
    const graphs = fromBackendRoutines(routines);

    useRoutineGraphStore.getState().loadGraphs(graphs);

    // Auto-select first graph if any exist
    const graphIds = Object.keys(graphs);
    if (graphIds.length > 0) {
      useRoutineGraphStore.getState().setCurrentGraph(graphIds[0]);
    }

    // Mark as clean (just loaded from backend)
    useRoutineGraphStore.getState().markSaved();
  } catch (err) {
    // Race guard
    if (generation !== _loadGeneration) return;
    throw err;
  }
}

// ============================================================================
// Save
// ============================================================================

/** Save all routine graphs to the backend. */
export async function saveAllRoutines(worldId: number): Promise<void> {
  const { graphs } = useRoutineGraphStore.getState();

  const promises = Object.values(graphs).map((graph) => {
    const backendGraph = toBackendGraph(graph);
    return updateWorldRoutine(worldId, graph.id, backendGraph as unknown as Record<string, unknown>)
      .catch((err) => {
        // If 404 (routine doesn't exist on backend yet), create it
        if (err?.response?.status === 404) {
          return createWorldRoutine(worldId, backendGraph as unknown as Record<string, unknown>);
        }
        throw err;
      });
  });

  await Promise.all(promises);
  useRoutineGraphStore.getState().markSaved();
}

/** Save a single routine graph. */
export async function saveRoutine(worldId: number, graphId: string): Promise<void> {
  const { graphs } = useRoutineGraphStore.getState();
  const graph = graphs[graphId];
  if (!graph) return;

  const backendGraph = toBackendGraph(graph);
  try {
    await updateWorldRoutine(worldId, graph.id, backendGraph as unknown as Record<string, unknown>);
  } catch (err: unknown) {
    if ((err as { response?: { status?: number } })?.response?.status === 404) {
      await createWorldRoutine(worldId, backendGraph as unknown as Record<string, unknown>);
    } else {
      throw err;
    }
  }
}

/** Remove a routine from both the backend and the local store. */
export async function removeRoutine(worldId: number, routineId: string): Promise<void> {
  // Delete from backend first (if it fails, store stays consistent)
  try {
    await deleteWorldRoutine(worldId, routineId);
  } catch (err: unknown) {
    // 404 means it wasn't on the backend — that's fine, still remove locally
    if ((err as { response?: { status?: number } })?.response?.status !== 404) throw err;
  }

  useRoutineGraphStore.getState().deleteGraph(routineId);
}

// ============================================================================
// Cleanup
// ============================================================================

/** Clear routine state: null worldId, empty graphs. */
export function clearRoutineState(): void {
  useRoutineGraphStore.getState().setWorldId(null);
}

// ============================================================================
// Expose load generation for testing
// ============================================================================

/** @internal Reset the load generation counter (for tests only). */
export function _resetLoadGeneration(): void {
  _loadGeneration = 0;
}

/** @internal Get current load generation (for tests only). */
export function _getLoadGeneration(): number {
  return _loadGeneration;
}
