/**
 * Game Hooks System
 *
 * App-specific wrapper around the game.engine PluginRegistry.
 * Provides type-safe context types using app-specific DTOs.
 *
 * Hook lifecycle:
 * 1. beforeTick - Runs before time advances (can prepare state)
 * 2. onTick - Runs during tick, returns events
 * 3. afterTick - Runs after tick completes (can react to events)
 *
 * Additional lifecycle hooks:
 * - onSessionLoaded - When a session is loaded/created
 * - onLocationEntered - When player enters a location
 * - onSceneStarted / onSceneEnded - Scene lifecycle
 */

import {
  createPluginRegistry,
  type IPluginRegistry,
  type GameEvent as EngineGameEvent,
  type GameEventType as EngineGameEventType,
  type GameEventCategory as EngineGameEventCategory,
  type GamePlugin as EngineGamePlugin,
  type GameTickContext as EngineGameTickContext,
  type SessionLoadedContext as EngineSessionLoadedContext,
  type LocationEnteredContext as EngineLocationEnteredContext,
  type SceneContext as EngineSceneContext,
  createGameEvent as engineCreateGameEvent,
} from '@pixsim7/game.engine';

import type { GameSessionDTO, GameWorldDetail } from '@lib/registries';

// ============================================
// Re-export base types from engine
// ============================================

export type GameEventType = EngineGameEventType;
export type GameEventCategory = EngineGameEventCategory;
export type GameEvent = EngineGameEvent;

// ============================================
// App-specific Context Types
// These extend the engine types with app-specific DTOs
// ============================================

export interface GameTickContext extends Omit<EngineGameTickContext, 'world' | 'session'> {
  /** Current world details */
  world: GameWorldDetail;
  /** Current session (may be null) */
  session: GameSessionDTO | null;
}

export interface SessionLoadedContext extends Omit<EngineSessionLoadedContext, 'session' | 'world'> {
  session: GameSessionDTO;
  world: GameWorldDetail;
}

export type LocationEnteredContext = EngineLocationEnteredContext;

export type SceneContext = EngineSceneContext;

// ============================================
// Hook Types (with app-specific contexts)
// ============================================

export type BeforeTickHook = (context: GameTickContext) => Promise<void> | void;
export type OnTickHook = (context: GameTickContext) => Promise<GameEvent[]> | GameEvent[];
export type AfterTickHook = (context: GameTickContext, events: GameEvent[]) => Promise<void> | void;

export type SessionLoadedHook = (context: SessionLoadedContext) => Promise<GameEvent[]> | GameEvent[];
export type LocationEnteredHook = (context: LocationEnteredContext) => Promise<GameEvent[]> | GameEvent[];
export type SceneStartedHook = (context: SceneContext) => Promise<GameEvent[]> | GameEvent[];
export type SceneEndedHook = (context: SceneContext) => Promise<GameEvent[]> | GameEvent[];

// ============================================
// Plugin Interface
// ============================================

export interface GamePlugin {
  /** Unique plugin ID */
  id: string;
  /** Display name */
  name: string;
  /** Description of what this plugin does */
  description?: string;
  /** Plugin version */
  version?: string;
  /** Author */
  author?: string;
  /** Whether the plugin is currently enabled */
  enabled: boolean;
  /** Which contexts this plugin runs in ('game', 'simulation', or 'both') */
  runIn?: 'game' | 'simulation' | 'both';
  /** Plugin hooks */
  hooks: {
    beforeTick?: BeforeTickHook;
    onTick?: OnTickHook;
    afterTick?: AfterTickHook;
    onSessionLoaded?: SessionLoadedHook;
    onLocationEntered?: LocationEnteredHook;
    onSceneStarted?: SceneStartedHook;
    onSceneEnded?: SceneEndedHook;
  };
}

// ============================================
// Registry Instance
// Using the engine's PluginRegistry
// ============================================

// Create singleton instance using engine's registry
const registry = createPluginRegistry({ debug: import.meta.env?.DEV ?? false });

// Type-safe wrapper that casts the engine types to our app-specific types
export const gameHooksRegistry = registry as IPluginRegistry;

// ============================================
// Built-in Plugins
// ============================================

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
 * Register built-in plugins
 */
export function registerBuiltinGamePlugins(): void {
  gameHooksRegistry.registerPlugin(timeAdvancementPlugin as EngineGamePlugin);
  gameHooksRegistry.registerPlugin(worldStateSyncPlugin as EngineGamePlugin);
}

/**
 * Unregister built-in plugins
 */
export function unregisterBuiltinGamePlugins(): void {
  gameHooksRegistry.unregisterPlugin('builtin:time-advancement');
  gameHooksRegistry.unregisterPlugin('builtin:world-state-sync');
}

// ============================================
// Helper to create events
// ============================================

export function createGameEvent(
  category: GameEventCategory,
  title: string,
  message: string,
  options?: {
    type?: GameEventType;
    worldTime?: number;
    metadata?: Record<string, unknown>;
  }
): GameEvent {
  return engineCreateGameEvent(category, title, message, options);
}
