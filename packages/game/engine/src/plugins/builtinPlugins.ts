/**
 * Built-in Game Plugins
 *
 * Standard plugins shipped with the game engine.
 */

import type { GamePlugin, GameEvent, GameEventCategory } from './types';

/**
 * Time advancement logging plugin
 */
export const timeAdvancementPlugin: GamePlugin = {
  id: 'builtin:time-advancement',
  name: 'Time Advancement',
  description: 'Logs time advancement events',
  version: '1.0.0',
  enabled: true,
  runIn: 'both',
  hooks: {
    onTick: (context) => {
      const hours = Math.floor(context.deltaSeconds / 3600);
      const minutes = Math.floor((context.deltaSeconds % 3600) / 60);
      const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

      return [
        {
          id: `time-advance-${Date.now()}`,
          timestamp: Date.now(),
          worldTime: context.worldTimeSeconds,
          type: 'info',
          category: 'time',
          title: 'Time Advanced',
          message: `Advanced ${timeStr}`,
          metadata: {
            deltaSeconds: context.deltaSeconds,
            newWorldTime: context.worldTimeSeconds,
            turnNumber: context.turnNumber,
          },
        },
      ];
    },
  },
};

/**
 * World state sync plugin
 */
export const worldStateSyncPlugin: GamePlugin = {
  id: 'builtin:world-state-sync',
  name: 'World State Sync',
  description: 'Logs world state synchronization',
  version: '1.0.0',
  enabled: true,
  runIn: 'simulation', // Only in simulation - too noisy for gameplay
  hooks: {
    onTick: (context) => {
      return [
        {
          id: `world-state-${Date.now()}`,
          timestamp: Date.now(),
          worldTime: context.worldTimeSeconds,
          type: 'success',
          category: 'world',
          title: 'World State Updated',
          message: `World "${context.world.name}" synchronized`,
          metadata: {
            worldId: context.worldId,
            worldTime: context.worldTimeSeconds,
          },
        },
      ];
    },
  },
};

/**
 * Get all built-in plugins
 */
export function getBuiltinPlugins(): GamePlugin[] {
  return [timeAdvancementPlugin, worldStateSyncPlugin];
}

/**
 * Helper to create events
 */
export function createGameEvent(
  category: GameEventCategory,
  title: string,
  message: string,
  options?: {
    type?: 'info' | 'warning' | 'success' | 'error';
    worldTime?: number;
    metadata?: Record<string, unknown>;
  }
): GameEvent {
  return {
    id: `${category}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    worldTime: options?.worldTime ?? 0,
    type: options?.type ?? 'info',
    category,
    title,
    message,
    metadata: options?.metadata,
  };
}
