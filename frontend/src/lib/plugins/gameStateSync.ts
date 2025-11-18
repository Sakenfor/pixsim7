/**
 * Game State Synchronization for Plugins
 *
 * This module provides utilities to sync game state to the plugin manager.
 * Game components (like Game2D) can call updatePluginGameState() to notify plugins of state changes.
 */

import { pluginManager } from './PluginManager';
import type { PluginGameState } from './types';
import type { GameSessionDTO, GameWorldDetail, GameLocationDetail, NpcPresenceDTO } from '../api/game';

/**
 * Build PluginGameState from various game state sources
 */
export function buildPluginGameState(params: {
  session?: GameSessionDTO | null;
  world?: GameWorldDetail | null;
  location?: GameLocationDetail | null;
  locationNpcs?: NpcPresenceDTO[];
}): PluginGameState {
  const { session, world, location, locationNpcs = [] } = params;

  return {
    // Session data
    session: session ?? null,
    flags: (session?.flags as Record<string, unknown>) ?? {},
    relationships: (session?.relationships as Record<string, unknown>) ?? {},

    // World data
    world: world ?? null,
    worldTime: world
      ? parseWorldTimeToPlugin(world.world_time)
      : { day: 0, hour: 0 },

    // Location data
    currentLocation: location ?? null,
    locationNpcs,
  };
}

/**
 * Parse world_time (seconds since Monday 00:00) to { day, hour }
 */
function parseWorldTimeToPlugin(seconds: number): { day: number; hour: number } {
  const SECONDS_PER_DAY = 86400;
  const SECONDS_PER_HOUR = 3600;

  const totalDays = Math.floor(seconds / SECONDS_PER_DAY);
  const remainingSeconds = seconds % SECONDS_PER_DAY;
  const hour = Math.floor(remainingSeconds / SECONDS_PER_HOUR);

  return {
    day: totalDays,
    hour,
  };
}

/**
 * Update plugin game state
 * Call this from game components when state changes
 */
export function updatePluginGameState(params: {
  session?: GameSessionDTO | null;
  world?: GameWorldDetail | null;
  location?: GameLocationDetail | null;
  locationNpcs?: NpcPresenceDTO[];
}): void {
  const state = buildPluginGameState(params);
  pluginManager.updateGameState(state);
}
