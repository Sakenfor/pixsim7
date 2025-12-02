/**
 * Snapshot & Scenario Runner - Type Definitions
 *
 * Defines types for capturing and restoring world+session state for
 * headless QA testing and scenario replay.
 */

/**
 * Snapshot of a single game session's state
 */
export interface SessionSnapshot {
  sessionId: number;
  flags: Record<string, unknown>;
  stats: {
    relationships: Record<string, unknown>;
    [key: string]: unknown;
  };
  worldTime: number;
  version: number;
}

/**
 * Complete snapshot of world + associated sessions
 */
export interface WorldSnapshot {
  worldId: number;
  worldMeta: Record<string, unknown>;
  worldTime: number;
  sessions: SessionSnapshot[];
}

/**
 * Result of a snapshot capture operation
 */
export interface SnapshotCaptureResult {
  success: boolean;
  snapshot?: WorldSnapshot;
  error?: string;
}

/**
 * Result of a snapshot restore operation
 */
export interface SnapshotRestoreResult {
  success: boolean;
  restoredWorldId?: number;
  restoredSessionIds?: number[];
  error?: string;
}
