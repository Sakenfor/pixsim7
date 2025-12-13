/**
 * Game Hooks System
 *
 * Unified plugin system for game runtime events. Plugins can register hooks
 * that run during gameplay (Game2D) and simulation (SimulationPlayground).
 *
 * This allows plugins to add custom game mechanics (hunger, fatigue, weather, etc.)
 * that execute consistently in both play and simulation contexts.
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

import type { GameSessionDTO, GameWorldDetail } from '@lib/registries';

// ============================================
// Event Types
// ============================================

export type GameEventType = 'info' | 'warning' | 'success' | 'error';

export type GameEventCategory =
  | 'time'
  | 'npc'
  | 'relationship'
  | 'quest'
  | 'world'
  | 'location'
  | 'scene'
  | 'mechanic'  // For custom game mechanics
  | 'plugin'
  | 'lifecycle'
  | 'custom';

export interface GameEvent {
  id: string;
  timestamp: number;
  worldTime: number;
  type: GameEventType;
  category: GameEventCategory;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// Context Types
// ============================================

export interface GameTickContext {
  /** Current world ID */
  worldId: number;
  /** Current world details */
  world: GameWorldDetail;
  /** World time in seconds (after advancement) */
  worldTimeSeconds: number;
  /** How many seconds were advanced */
  deltaSeconds: number;
  /** Current session (may be null) */
  session: GameSessionDTO | null;
  /** Current location ID (if in a room) */
  locationId: number | null;
  /** Whether this is turn-based mode */
  isTurnBased: boolean;
  /** Current turn number (turn-based only) */
  turnNumber: number;
  /** Context origin: 'game' for Game2D, 'simulation' for SimulationPlayground */
  origin: 'game' | 'simulation';
  /** Additional context for simulation (selected NPCs, etc.) */
  simulationContext?: {
    selectedNpcIds: number[];
  };
}

export interface SessionLoadedContext {
  worldId: number;
  sessionId: number;
  session: GameSessionDTO;
  world: GameWorldDetail;
  isNew: boolean;
}

export interface LocationEnteredContext {
  worldId: number;
  sessionId: number;
  locationId: number;
  previousLocationId: number | null;
  worldTimeSeconds: number;
}

export interface SceneContext {
  worldId: number;
  sessionId: number;
  sceneId: number;
  npcId?: number;
  worldTimeSeconds: number;
}

// ============================================
// Hook Types
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
// Registry
// ============================================

class GameHooksRegistry {
  private plugins: Map<string, GamePlugin> = new Map();
  private eventListeners: Map<string, Set<(event: GameEvent) => void>> = new Map();

  /**
   * Register a plugin
   */
  registerPlugin(plugin: GamePlugin): void {
    // Default to running in both contexts
    if (!plugin.runIn) {
      plugin.runIn = 'both';
    }
    this.plugins.set(plugin.id, plugin);
  }

  /**
   * Unregister a plugin
   */
  unregisterPlugin(id: string): void {
    this.plugins.delete(id);
  }

  /**
   * Get all registered plugins
   */
  getPlugins(): GamePlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get a specific plugin
   */
  getPlugin(id: string): GamePlugin | undefined {
    return this.plugins.get(id);
  }

  /**
   * Enable/disable a plugin
   */
  setPluginEnabled(id: string, enabled: boolean): void {
    const plugin = this.plugins.get(id);
    if (plugin) {
      plugin.enabled = enabled;
    }
  }

  /**
   * Check if plugin should run in given context
   */
  private shouldRunInContext(plugin: GamePlugin, origin: 'game' | 'simulation'): boolean {
    if (!plugin.enabled) return false;
    if (plugin.runIn === 'both') return true;
    return plugin.runIn === origin;
  }

  /**
   * Run beforeTick hooks
   */
  async runBeforeTick(context: GameTickContext): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (!this.shouldRunInContext(plugin, context.origin)) continue;
      if (!plugin.hooks.beforeTick) continue;

      try {
        await Promise.resolve(plugin.hooks.beforeTick(context));
      } catch (error) {
        console.error(`[GameHooks] Error in beforeTick for plugin ${plugin.id}:`, error);
      }
    }
  }

  /**
   * Run onTick hooks and collect events
   */
  async runOnTick(context: GameTickContext): Promise<GameEvent[]> {
    const allEvents: GameEvent[] = [];

    for (const plugin of this.plugins.values()) {
      if (!this.shouldRunInContext(plugin, context.origin)) continue;
      if (!plugin.hooks.onTick) continue;

      try {
        const events = await Promise.resolve(plugin.hooks.onTick(context));
        allEvents.push(...events);
      } catch (error) {
        console.error(`[GameHooks] Error in onTick for plugin ${plugin.id}:`, error);
        allEvents.push({
          id: `error-${plugin.id}-${Date.now()}`,
          timestamp: Date.now(),
          worldTime: context.worldTimeSeconds,
          type: 'error',
          category: 'plugin',
          title: `Plugin Error: ${plugin.name}`,
          message: String(error),
        });
      }
    }

    // Emit events to listeners
    for (const event of allEvents) {
      this.emitEvent(event);
    }

    return allEvents;
  }

  /**
   * Run afterTick hooks
   */
  async runAfterTick(context: GameTickContext, events: GameEvent[]): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (!this.shouldRunInContext(plugin, context.origin)) continue;
      if (!plugin.hooks.afterTick) continue;

      try {
        await Promise.resolve(plugin.hooks.afterTick(context, events));
      } catch (error) {
        console.error(`[GameHooks] Error in afterTick for plugin ${plugin.id}:`, error);
      }
    }
  }

  /**
   * Run session loaded hooks
   */
  async runSessionLoaded(context: SessionLoadedContext): Promise<GameEvent[]> {
    const allEvents: GameEvent[] = [];

    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled || !plugin.hooks.onSessionLoaded) continue;

      try {
        const events = await Promise.resolve(plugin.hooks.onSessionLoaded(context));
        allEvents.push(...events);
      } catch (error) {
        console.error(`[GameHooks] Error in onSessionLoaded for plugin ${plugin.id}:`, error);
      }
    }

    return allEvents;
  }

  /**
   * Run location entered hooks
   */
  async runLocationEntered(context: LocationEnteredContext): Promise<GameEvent[]> {
    const allEvents: GameEvent[] = [];

    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled || !plugin.hooks.onLocationEntered) continue;

      try {
        const events = await Promise.resolve(plugin.hooks.onLocationEntered(context));
        allEvents.push(...events);
      } catch (error) {
        console.error(`[GameHooks] Error in onLocationEntered for plugin ${plugin.id}:`, error);
      }
    }

    return allEvents;
  }

  /**
   * Run scene started hooks
   */
  async runSceneStarted(context: SceneContext): Promise<GameEvent[]> {
    const allEvents: GameEvent[] = [];

    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled || !plugin.hooks.onSceneStarted) continue;

      try {
        const events = await Promise.resolve(plugin.hooks.onSceneStarted(context));
        allEvents.push(...events);
      } catch (error) {
        console.error(`[GameHooks] Error in onSceneStarted for plugin ${plugin.id}:`, error);
      }
    }

    return allEvents;
  }

  /**
   * Run scene ended hooks
   */
  async runSceneEnded(context: SceneContext): Promise<GameEvent[]> {
    const allEvents: GameEvent[] = [];

    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled || !plugin.hooks.onSceneEnded) continue;

      try {
        const events = await Promise.resolve(plugin.hooks.onSceneEnded(context));
        allEvents.push(...events);
      } catch (error) {
        console.error(`[GameHooks] Error in onSceneEnded for plugin ${plugin.id}:`, error);
      }
    }

    return allEvents;
  }

  /**
   * Subscribe to events
   */
  onEvent(callback: (event: GameEvent) => void): () => void {
    const key = 'all';
    if (!this.eventListeners.has(key)) {
      this.eventListeners.set(key, new Set());
    }
    this.eventListeners.get(key)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.eventListeners.get(key)?.delete(callback);
    };
  }

  /**
   * Subscribe to events of a specific category
   */
  onEventCategory(category: GameEventCategory, callback: (event: GameEvent) => void): () => void {
    const key = `category:${category}`;
    if (!this.eventListeners.has(key)) {
      this.eventListeners.set(key, new Set());
    }
    this.eventListeners.get(key)!.add(callback);

    return () => {
      this.eventListeners.get(key)?.delete(callback);
    };
  }

  private emitEvent(event: GameEvent): void {
    // Emit to 'all' listeners
    this.eventListeners.get('all')?.forEach((cb) => cb(event));
    // Emit to category-specific listeners
    this.eventListeners.get(`category:${event.category}`)?.forEach((cb) => cb(event));
  }
}

// Singleton instance
export const gameHooksRegistry = new GameHooksRegistry();

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
  gameHooksRegistry.registerPlugin(timeAdvancementPlugin);
  gameHooksRegistry.registerPlugin(worldStateSyncPlugin);
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
