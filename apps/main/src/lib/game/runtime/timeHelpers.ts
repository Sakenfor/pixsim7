/**
 * Time Helpers
 *
 * Utilities for world time management, extracted from Game2D.
 * These helpers work with session flags, world configuration, and manifests
 * to determine turn-based behavior and time deltas.
 */

import type { SessionFlags, GameWorldDetail } from '@pixsim7/shared.types';
import {
  parseWorldTime,
  composeWorldTime,
  getManifestTurnDelta,
} from '@pixsim7/game.engine';
import type { WorldTimeDisplay } from './types';

/**
 * Convert Game2D WorldTime (1-indexed days) to world_time seconds
 */
export function worldTimeToSeconds(wt: WorldTimeDisplay): number {
  return composeWorldTime({ dayOfWeek: wt.day - 1, hour: wt.hour, minute: 0, second: 0 });
}

/**
 * Convert world_time seconds to Game2D WorldTime (1-indexed days)
 */
export function secondsToWorldTime(seconds: number): WorldTimeDisplay {
  const { dayOfWeek, hour } = parseWorldTime(seconds);
  return { day: dayOfWeek + 1, hour };
}

/**
 * Check if session is in turn-based world mode
 *
 * Checks both session flags and GameProfile.simulationMode from world meta.
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
 */
export function getCurrentTurnNumber(sessionFlags?: Record<string, unknown> | null): number {
  if (!sessionFlags) return 0;
  const flags = sessionFlags as SessionFlags;
  return flags.world?.turnNumber ?? 0;
}

/**
 * Create updated session flags with incremented turn number
 */
export function createTurnAdvanceFlags(
  currentFlags: SessionFlags,
  newWorldTime: number,
  locationId?: number | null
): SessionFlags {
  const currentTurnNumber = currentFlags.world?.turnNumber ?? 0;
  const newTurnNumber = currentTurnNumber + 1;

  return {
    ...currentFlags,
    world: {
      ...currentFlags.world,
      turnNumber: newTurnNumber,
      turnHistory: [
        ...(currentFlags.world?.turnHistory || []).slice(-9), // Keep last 10 turns
        {
          turnNumber: newTurnNumber,
          worldTime: newWorldTime,
          timestamp: Date.now(),
          locationId: locationId ?? undefined,
        },
      ],
    },
  };
}
