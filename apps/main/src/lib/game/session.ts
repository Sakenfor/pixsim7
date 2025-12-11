import type { SessionFlags, WorldMode } from '@/types';

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

export function loadWorldSession(): WorldSessionState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
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

export function saveWorldSession(state: WorldSessionState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors in editor/preview contexts
  }
}

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
