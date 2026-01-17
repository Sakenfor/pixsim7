/**
 * Plugin Registry
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

import { createRegistry, type Registry } from '@pixsim7/shared.helpers.core';
import type {
  GamePlugin,
  GameEvent,
  GameEventCategory,
  GameTickContext,
  SessionLoadedContext,
  LocationEnteredContext,
  SceneContext,
  IPluginRegistry,
} from './types';

/**
 * PluginRegistry implementation
 *
 * Pure TypeScript class with no React dependencies.
 */
export class PluginRegistry implements IPluginRegistry {
  private registry: Registry<string, GamePlugin>;
  private eventListeners: Map<string, Set<(event: GameEvent) => void>> = new Map();
  private debug: boolean;

  constructor(options?: { debug?: boolean }) {
    this.debug = options?.debug ?? false;
    this.registry = createRegistry<string, GamePlugin>({
      label: 'PluginRegistry',
      warnOnOverwrite: true,
      strictMode: false,
    });
  }

  private log(message: string): void {
    if (this.debug) {
      console.log(`[PluginRegistry] ${message}`);
    }
  }

  /**
   * Register a plugin
   */
  registerPlugin(plugin: GamePlugin): void {
    // Default to running in both contexts
    if (!plugin.runIn) {
      plugin.runIn = 'both';
    }
    this.registry.register(plugin.id, plugin);
    this.log(`Registered plugin: ${plugin.id}`);
  }

  /**
   * Unregister a plugin
   */
  unregisterPlugin(id: string): void {
    this.registry.unregister(id);
    this.log(`Unregistered plugin: ${id}`);
  }

  /**
   * Get all registered plugins
   */
  getPlugins(): GamePlugin[] {
    return Array.from(this.registry.getAll().values());
  }

  /**
   * Get a specific plugin
   */
  getPlugin(id: string): GamePlugin | undefined {
    return this.registry.get(id);
  }

  /**
   * Enable/disable a plugin
   */
  setPluginEnabled(id: string, enabled: boolean): void {
    const plugin = this.registry.get(id);
    if (plugin) {
      plugin.enabled = enabled;
      this.log(`Plugin ${id} enabled: ${enabled}`);
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
    for (const plugin of this.registry.getAll().values()) {
      if (!this.shouldRunInContext(plugin, context.origin)) continue;
      if (!plugin.hooks.beforeTick) continue;

      try {
        await Promise.resolve(plugin.hooks.beforeTick(context));
      } catch (error) {
        console.error(`[PluginRegistry] Error in beforeTick for plugin ${plugin.id}:`, error);
      }
    }
  }

  /**
   * Run onTick hooks and collect events
   */
  async runOnTick(context: GameTickContext): Promise<GameEvent[]> {
    const allEvents: GameEvent[] = [];

    for (const plugin of this.registry.getAll().values()) {
      if (!this.shouldRunInContext(plugin, context.origin)) continue;
      if (!plugin.hooks.onTick) continue;

      try {
        const events = await Promise.resolve(plugin.hooks.onTick(context));
        allEvents.push(...events);
      } catch (error) {
        console.error(`[PluginRegistry] Error in onTick for plugin ${plugin.id}:`, error);
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
    for (const plugin of this.registry.getAll().values()) {
      if (!this.shouldRunInContext(plugin, context.origin)) continue;
      if (!plugin.hooks.afterTick) continue;

      try {
        await Promise.resolve(plugin.hooks.afterTick(context, events));
      } catch (error) {
        console.error(`[PluginRegistry] Error in afterTick for plugin ${plugin.id}:`, error);
      }
    }
  }

  /**
   * Run session loaded hooks
   */
  async runSessionLoaded(context: SessionLoadedContext): Promise<GameEvent[]> {
    const allEvents: GameEvent[] = [];

    for (const plugin of this.registry.getAll().values()) {
      if (!plugin.enabled || !plugin.hooks.onSessionLoaded) continue;

      try {
        const events = await Promise.resolve(plugin.hooks.onSessionLoaded(context));
        allEvents.push(...events);
      } catch (error) {
        console.error(`[PluginRegistry] Error in onSessionLoaded for plugin ${plugin.id}:`, error);
      }
    }

    return allEvents;
  }

  /**
   * Run location entered hooks
   */
  async runLocationEntered(context: LocationEnteredContext): Promise<GameEvent[]> {
    const allEvents: GameEvent[] = [];

    for (const plugin of this.registry.getAll().values()) {
      if (!plugin.enabled || !plugin.hooks.onLocationEntered) continue;

      try {
        const events = await Promise.resolve(plugin.hooks.onLocationEntered(context));
        allEvents.push(...events);
      } catch (error) {
        console.error(`[PluginRegistry] Error in onLocationEntered for plugin ${plugin.id}:`, error);
      }
    }

    return allEvents;
  }

  /**
   * Run scene started hooks
   */
  async runSceneStarted(context: SceneContext): Promise<GameEvent[]> {
    const allEvents: GameEvent[] = [];

    for (const plugin of this.registry.getAll().values()) {
      if (!plugin.enabled || !plugin.hooks.onSceneStarted) continue;

      try {
        const events = await Promise.resolve(plugin.hooks.onSceneStarted(context));
        allEvents.push(...events);
      } catch (error) {
        console.error(`[PluginRegistry] Error in onSceneStarted for plugin ${plugin.id}:`, error);
      }
    }

    return allEvents;
  }

  /**
   * Run scene ended hooks
   */
  async runSceneEnded(context: SceneContext): Promise<GameEvent[]> {
    const allEvents: GameEvent[] = [];

    for (const plugin of this.registry.getAll().values()) {
      if (!plugin.enabled || !plugin.hooks.onSceneEnded) continue;

      try {
        const events = await Promise.resolve(plugin.hooks.onSceneEnded(context));
        allEvents.push(...events);
      } catch (error) {
        console.error(`[PluginRegistry] Error in onSceneEnded for plugin ${plugin.id}:`, error);
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

  /**
   * Clear all plugins and listeners
   */
  clear(): void {
    this.registry.clear();
    this.eventListeners.clear();
    this.log('Registry cleared');
  }
}

/**
 * Factory function to create a PluginRegistry instance
 */
export function createPluginRegistry(options?: { debug?: boolean }): IPluginRegistry {
  return new PluginRegistry(options);
}
