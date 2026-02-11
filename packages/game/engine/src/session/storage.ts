/**
 * Session Storage Utilities
 *
 * Local storage abstraction for persisting world session state
 * across browser sessions. Handles world time, session IDs, and world selection.
 *
 * Extracted from apps/main/src/lib/game/session.ts
 *
 * Storage is injected via `configureKVStorage()` — no direct `localStorage` access.
 */

import type { SessionFlags, WorldMode } from '@pixsim7/shared.types';
import { getKVStorage } from '../core/storageConfig';

/**
 * Persisted world session state
 */
export interface WorldSessionState {
  /**
   * Canonical world time in seconds.
   * 0 = Monday 00:00 in the shared NPCSchedule model.
   */
  worldTimeSeconds: number;
  /**
   * Optional backing GameSession id on the server.
   * When present, worldTimeSeconds should mirror GameSession.world_time.
   */
  gameSessionId?: number;
  /**
   * Optional selected GameWorld id for this client session.
   */
  worldId?: number;
}

const STORAGE_KEY = 'pixsim7.worldSession.v1';

/**
 * Load world session state from local storage
 * @returns Session state or null if not found/invalid
 */
export function loadWorldSession(): WorldSessionState | null {
  const storage = getKVStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.worldTimeSeconds !== 'number') return null;
    const state: WorldSessionState = { worldTimeSeconds: parsed.worldTimeSeconds };
    if (parsed.gameSessionId && typeof parsed.gameSessionId === 'number') {
      state.gameSessionId = parsed.gameSessionId;
    }
    if (parsed.worldId && typeof parsed.worldId === 'number') {
      state.worldId = parsed.worldId;
    }
    return state;
  } catch {
    return null;
  }
}

/**
 * Save world session state to local storage
 * @param state - Session state to persist
 */
export function saveWorldSession(state: WorldSessionState): void {
  const storage = getKVStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors in editor/preview contexts
  }
}

/**
 * Clear world session state from local storage
 */
export function clearWorldSession(): void {
  const storage = getKVStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

// ===== Session Flag Builders =====

interface WorldSessionFlagOptions {
  worldId: string;
  mode: WorldMode;
  turnDeltaSeconds?: number;
  currentLocationId?: number;
}

function createWorldSessionFlags({
  worldId,
  mode,
  turnDeltaSeconds,
  currentLocationId,
}: WorldSessionFlagOptions): SessionFlags {
  const worldFlags: SessionFlags['world'] = {
    id: worldId,
    mode,
    currentLocationId,
  };

  if (typeof turnDeltaSeconds === 'number') {
    worldFlags.turnDeltaSeconds = turnDeltaSeconds;
  }

  return {
    sessionKind: 'world',
    world: worldFlags,
  };
}

/**
 * Create session flags for turn-based world mode
 * @param worldId - Unique identifier for the world
 * @param turnDeltaSeconds - Time advancement per turn in seconds (default: 3600 = 1 hour)
 * @param currentLocationId - Optional starting location ID
 */
export function createTurnBasedSessionFlags(
  worldId: string,
  turnDeltaSeconds: number = 3600,
  currentLocationId?: number
): SessionFlags {
  return createWorldSessionFlags({
    worldId,
    mode: 'turn_based',
    turnDeltaSeconds,
    currentLocationId,
  });
}

/**
 * Create session flags for real-time world mode
 * @param worldId - Unique identifier for the world
 * @param currentLocationId - Optional starting location ID
 */
export function createRealTimeSessionFlags(
  worldId: string,
  currentLocationId?: number
): SessionFlags {
  return createWorldSessionFlags({
    worldId,
    mode: 'real_time',
    currentLocationId,
  });
}
