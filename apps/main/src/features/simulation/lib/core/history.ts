/**
 * Simulation History Tracking
 *
 * Tracks simulation state changes over time for analysis and rollback.
 */

import type { SimulationEvent } from '../../hooks';

export interface SimulationSnapshot {
  id: string;
  timestamp: number;
  worldTime: number;
  worldId: number;
  sessionSnapshot: {
    flags: Record<string, unknown>;
    relationships: Record<string, unknown>;
  };
  events: SimulationEvent[];
}

export interface SimulationHistory {
  scenarioId: string | null;
  scenarioName: string | null;
  startTime: number;
  snapshots: SimulationSnapshot[];
  currentIndex: number;
}

const STORAGE_KEY = 'pixsim7:simulation:history';
const MAX_SNAPSHOTS = 50; // Keep last 50 snapshots

/**
 * Create a new history session
 */
export function createHistory(
  scenarioId: string | null,
  scenarioName: string | null
): SimulationHistory {
  return {
    scenarioId,
    scenarioName,
    startTime: Date.now(),
    snapshots: [],
    currentIndex: -1,
  };
}

/**
 * Add a snapshot to history
 */
export function addSnapshot(
  history: SimulationHistory,
  snapshot: Omit<SimulationSnapshot, 'id'>
): SimulationHistory {
  const newSnapshot: SimulationSnapshot = {
    ...snapshot,
    id: `snapshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };

  // If we're not at the end of history, truncate future snapshots
  const snapshots =
    history.currentIndex < history.snapshots.length - 1
      ? history.snapshots.slice(0, history.currentIndex + 1)
      : [...history.snapshots];

  snapshots.push(newSnapshot);

  // Keep only last MAX_SNAPSHOTS
  const trimmedSnapshots =
    snapshots.length > MAX_SNAPSHOTS
      ? snapshots.slice(-MAX_SNAPSHOTS)
      : snapshots;

  return {
    ...history,
    snapshots: trimmedSnapshots,
    currentIndex: trimmedSnapshots.length - 1,
  };
}

/**
 * Navigate to a specific snapshot
 */
export function goToSnapshot(
  history: SimulationHistory,
  index: number
): SimulationHistory | null {
  if (index < 0 || index >= history.snapshots.length) {
    return null;
  }

  return {
    ...history,
    currentIndex: index,
  };
}

/**
 * Get current snapshot
 */
export function getCurrentSnapshot(
  history: SimulationHistory
): SimulationSnapshot | null {
  if (history.currentIndex < 0 || history.currentIndex >= history.snapshots.length) {
    return null;
  }
  return history.snapshots[history.currentIndex];
}

/**
 * Clear history
 */
export function clearHistory(history: SimulationHistory): SimulationHistory {
  return {
    ...history,
    snapshots: [],
    currentIndex: -1,
  };
}

/**
 * Save history to localStorage
 */
export function saveHistory(history: SimulationHistory): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Failed to save simulation history', e);
  }
}

/**
 * Load history from localStorage
 */
export function loadHistory(): SimulationHistory | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load simulation history', e);
    return null;
  }
}

/**
 * Export history as JSON
 */
export function exportHistory(history: SimulationHistory): string {
  return JSON.stringify(history, null, 2);
}

/**
 * Import history from JSON
 */
export function importHistory(json: string): SimulationHistory | null {
  try {
    const parsed = JSON.parse(json);
    // Basic validation
    if (
      typeof parsed === 'object' &&
      Array.isArray(parsed.snapshots) &&
      typeof parsed.currentIndex === 'number'
    ) {
      return parsed as SimulationHistory;
    }
    return null;
  } catch (e) {
    console.error('Failed to import simulation history', e);
    return null;
  }
}

/**
 * Get summary statistics from history
 */
export function getHistoryStats(history: SimulationHistory): {
  totalSnapshots: number;
  totalEvents: number;
  duration: number;
  eventsByCategory: Record<string, number>;
} {
  const totalEvents = history.snapshots.reduce(
    (sum, snap) => sum + snap.events.length,
    0
  );

  const eventsByCategory: Record<string, number> = {};
  for (const snapshot of history.snapshots) {
    for (const event of snapshot.events) {
      eventsByCategory[event.category] = (eventsByCategory[event.category] || 0) + 1;
    }
  }

  return {
    totalSnapshots: history.snapshots.length,
    totalEvents,
    duration: history.snapshots.length > 0
      ? history.snapshots[history.snapshots.length - 1].timestamp - history.startTime
      : 0,
    eventsByCategory,
  };
}
