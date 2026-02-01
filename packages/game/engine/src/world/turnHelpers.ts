/**
 * Turn-Based Mode Helpers
 *
 * Utilities for turn-based world mode including mode detection,
 * turn delta calculation, and turn advancement.
 *
 * Extracted from apps/main/src/lib/game/runtime/timeHelpers.ts
 */

import type {
  SessionFlags,
  GameWorldDetail,
} from '@pixsim7/shared.types';

import { getManifestTurnDelta } from './manifest';

/**
 * Check if session is in turn-based world mode
 *
 * Checks both session flags and GameProfile.simulationMode from world meta.
 *
 * @param sessionFlags - Session flags (optional)
 * @param world - World detail (optional)
 * @returns True if turn-based mode is active
 */
export function isTurnBasedMode(
  sessionFlags?: Record<string, unknown> | null,
  world?: GameWorldDetail | null
): boolean {
  if (!sessionFlags && !world) return false;

  // Check session flags first (allows session-level override)
  if (sessionFlags) {
    const flags = sessionFlags as SessionFlags;
    if (flags.sessionKind === 'world' && flags.world?.mode === 'turn_based') {
      return true;
    }
  }

  // Check GameProfile.simulationMode from world meta
  if (world?.meta && typeof world.meta === 'object' && 'gameProfile' in world.meta) {
    const gameProfile = (world.meta as Record<string, unknown>).gameProfile as Record<string, unknown> | undefined;
    if (gameProfile?.simulationMode === 'turn_based') {
      return true;
    }
  }

  return false;
}

/**
 * Get configured turn delta in seconds
 *
 * Priority: session flags > GameProfile.turnConfig > world manifest > default (3600 = 1 hour)
 *
 * @param sessionFlags - Session flags (optional)
 * @param world - World detail (optional)
 * @returns Turn delta in seconds
 */
export function getTurnDelta(
  sessionFlags?: Record<string, unknown> | null,
  world?: GameWorldDetail | null
): number {
  // First, check session flags for an override
  if (sessionFlags) {
    const flags = sessionFlags as SessionFlags;
    if (flags.world?.turnDeltaSeconds != null) {
      return flags.world.turnDeltaSeconds;
    }
  }

  // Second, check GameProfile.turnConfig
  if (world?.meta && typeof world.meta === 'object' && 'gameProfile' in world.meta) {
    const gameProfile = (world.meta as Record<string, unknown>).gameProfile as Record<string, unknown> | undefined;
    const turnConfig = gameProfile?.turnConfig as Record<string, unknown> | undefined;
    if (turnConfig?.turnDeltaSeconds != null) {
      return turnConfig.turnDeltaSeconds as number;
    }
  }

  // Third, check world manifest for default turn preset
  if (world) {
    return getManifestTurnDelta(world);
  }

  // Final fallback: 1 hour
  return 3600;
}

/**
 * Get the current turn number from session flags
 *
 * @param sessionFlags - Session flags (optional)
 * @returns Current turn number (0 if not set)
 */
export function getCurrentTurnNumber(sessionFlags?: Record<string, unknown> | null): number {
  if (!sessionFlags) return 0;
  const flags = sessionFlags as SessionFlags;
  return flags.world?.turnNumber ?? 0;
}

/**
 * Turn history entry
 */
export interface TurnHistoryEntry {
  turnNumber: number;
  worldTime: number;
  timestamp: number;
  locationId?: number;
}

/**
 * Create updated session flags with incremented turn number
 *
 * @param currentFlags - Current session flags
 * @param newWorldTime - New world time in seconds
 * @param locationId - Current location ID (optional)
 * @returns Updated session flags
 */
export function createTurnAdvanceFlags(
  currentFlags: SessionFlags,
  newWorldTime: number,
  locationId?: number | null
): SessionFlags {
  const currentTurnNumber = currentFlags.world?.turnNumber ?? 0;
  const newTurnNumber = currentTurnNumber + 1;

  const turnHistory: TurnHistoryEntry[] = [
    ...((currentFlags.world?.turnHistory as TurnHistoryEntry[] | undefined) || []).slice(-9), // Keep last 10 turns
    {
      turnNumber: newTurnNumber,
      worldTime: newWorldTime,
      timestamp: Date.now(),
      locationId: locationId ?? undefined,
    },
  ];

  return {
    ...currentFlags,
    world: {
      ...currentFlags.world,
      turnNumber: newTurnNumber,
      turnHistory,
    },
  };
}
