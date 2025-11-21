/**
 * Multi-Run Storage for Phase 6
 *
 * Manages multiple simulation runs for comparison across worlds/sessions.
 * Each run is a complete SimulationHistory that can be saved, loaded, and compared.
 */

import type { SimulationHistory, SimulationSnapshot } from './history';

export interface SavedSimulationRun {
  id: string;
  name: string;
  description?: string;
  worldId: number;
  worldName?: string;
  savedAt: number;
  history: SimulationHistory;
}

const STORAGE_KEY = 'pixsim7:simulation:saved-runs';

/**
 * Load all saved simulation runs from localStorage
 */
export function loadSavedRuns(): SavedSimulationRun[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load saved runs from localStorage', e);
    return [];
  }
}

/**
 * Save all runs to localStorage
 */
export function saveSavedRuns(runs: SavedSimulationRun[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  } catch (e) {
    console.error('Failed to save runs to localStorage', e);
  }
}

/**
 * Get a single saved run by ID
 */
export function getSavedRun(id: string): SavedSimulationRun | null {
  const runs = loadSavedRuns();
  return runs.find((r) => r.id === id) ?? null;
}

/**
 * Save the current simulation history as a named run
 */
export function saveSimulationRun(
  name: string,
  worldId: number,
  history: SimulationHistory,
  options?: {
    description?: string;
    worldName?: string;
  }
): SavedSimulationRun {
  const newRun: SavedSimulationRun = {
    id: `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    description: options?.description,
    worldId,
    worldName: options?.worldName,
    savedAt: Date.now(),
    history,
  };

  const runs = loadSavedRuns();
  runs.push(newRun);
  saveSavedRuns(runs);

  return newRun;
}

/**
 * Delete a saved run
 */
export function deleteSavedRun(id: string): boolean {
  const runs = loadSavedRuns();
  const filtered = runs.filter((r) => r.id !== id);

  if (filtered.length === runs.length) {
    return false; // Run not found
  }

  saveSavedRuns(filtered);
  return true;
}

/**
 * Update a saved run's metadata
 */
export function updateSavedRun(
  id: string,
  updates: Partial<Pick<SavedSimulationRun, 'name' | 'description'>>
): SavedSimulationRun | null {
  const runs = loadSavedRuns();
  const index = runs.findIndex((r) => r.id === id);

  if (index === -1) {
    return null;
  }

  const updated = { ...runs[index], ...updates };
  runs[index] = updated;
  saveSavedRuns(runs);

  return updated;
}

/**
 * Align snapshots from multiple runs by world time
 * Returns arrays of snapshots aligned to common world times
 */
export function alignSnapshotsByWorldTime(
  runs: SavedSimulationRun[]
): {
  worldTimes: number[];
  alignedSnapshots: (SimulationSnapshot | null)[][];
} {
  if (runs.length === 0) {
    return { worldTimes: [], alignedSnapshots: [] };
  }

  // Collect all unique world times across all runs
  const allWorldTimes = new Set<number>();
  for (const run of runs) {
    for (const snapshot of run.history.snapshots) {
      allWorldTimes.add(snapshot.worldTime);
    }
  }

  const worldTimes = Array.from(allWorldTimes).sort((a, b) => a - b);

  // For each run, create an array of snapshots aligned to worldTimes
  const alignedSnapshots: (SimulationSnapshot | null)[][] = runs.map((run) => {
    const snapshotsByTime = new Map<number, SimulationSnapshot>();
    for (const snapshot of run.history.snapshots) {
      snapshotsByTime.set(snapshot.worldTime, snapshot);
    }

    return worldTimes.map((time) => snapshotsByTime.get(time) ?? null);
  });

  return { worldTimes, alignedSnapshots };
}

/**
 * Align snapshots by index (tick number)
 * Returns snapshots at the same index across runs
 */
export function alignSnapshotsByIndex(
  runs: SavedSimulationRun[]
): {
  indices: number[];
  alignedSnapshots: (SimulationSnapshot | null)[][];
} {
  if (runs.length === 0) {
    return { indices: [], alignedSnapshots: [] };
  }

  const maxLength = Math.max(...runs.map((r) => r.history.snapshots.length));
  const indices = Array.from({ length: maxLength }, (_, i) => i);

  const alignedSnapshots: (SimulationSnapshot | null)[][] = runs.map((run) => {
    return indices.map((i) => run.history.snapshots[i] ?? null);
  });

  return { indices, alignedSnapshots };
}

/**
 * Calculate deltas between snapshots at the same alignment point
 */
export function calculateSnapshotDeltas(
  snapshot1: SimulationSnapshot | null,
  snapshot2: SimulationSnapshot | null
): {
  timeDelta: number;
  flagChanges: { key: string; from: unknown; to: unknown }[];
  relationshipChanges: { key: string; from: any; to: any }[];
  eventCountDelta: number;
} {
  const result = {
    timeDelta: 0,
    flagChanges: [] as { key: string; from: unknown; to: unknown }[],
    relationshipChanges: [] as { key: string; from: any; to: any }[],
    eventCountDelta: 0,
  };

  if (!snapshot1 || !snapshot2) {
    return result;
  }

  result.timeDelta = snapshot2.worldTime - snapshot1.worldTime;
  result.eventCountDelta = snapshot2.events.length - snapshot1.events.length;

  // Flag changes
  const allFlagKeys = new Set([
    ...Object.keys(snapshot1.sessionSnapshot.flags),
    ...Object.keys(snapshot2.sessionSnapshot.flags),
  ]);

  for (const key of allFlagKeys) {
    const val1 = snapshot1.sessionSnapshot.flags[key];
    const val2 = snapshot2.sessionSnapshot.flags[key];
    if (JSON.stringify(val1) !== JSON.stringify(val2)) {
      result.flagChanges.push({ key, from: val1, to: val2 });
    }
  }

  // Relationship changes
  const allRelKeys = new Set([
    ...Object.keys(snapshot1.sessionSnapshot.relationships),
    ...Object.keys(snapshot2.sessionSnapshot.relationships),
  ]);

  for (const key of allRelKeys) {
    const val1 = snapshot1.sessionSnapshot.relationships[key];
    const val2 = snapshot2.sessionSnapshot.relationships[key];
    if (JSON.stringify(val1) !== JSON.stringify(val2)) {
      result.relationshipChanges.push({ key, from: val1, to: val2 });
    }
  }

  return result;
}

/**
 * Get summary metrics for a saved run
 */
export function getRunSummary(run: SavedSimulationRun): {
  totalSnapshots: number;
  totalEvents: number;
  startWorldTime: number;
  endWorldTime: number;
  duration: number;
  uniqueFlags: number;
  uniqueRelationships: number;
} {
  const snapshots = run.history.snapshots;
  const totalSnapshots = snapshots.length;
  const totalEvents = snapshots.reduce((sum, s) => sum + s.events.length, 0);

  const allFlags = new Set<string>();
  const allRels = new Set<string>();

  for (const snapshot of snapshots) {
    Object.keys(snapshot.sessionSnapshot.flags).forEach((k) => allFlags.add(k));
    Object.keys(snapshot.sessionSnapshot.relationships).forEach((k) => allRels.add(k));
  }

  return {
    totalSnapshots,
    totalEvents,
    startWorldTime: snapshots[0]?.worldTime ?? 0,
    endWorldTime: snapshots[snapshots.length - 1]?.worldTime ?? 0,
    duration: snapshots.length > 0
      ? snapshots[snapshots.length - 1].timestamp - run.history.startTime
      : 0,
    uniqueFlags: allFlags.size,
    uniqueRelationships: allRels.size,
  };
}
