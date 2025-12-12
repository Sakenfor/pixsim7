/**
 * Simulation Hooks System (Extended for Phase 8)
 *
 * Provides a plugin-like system for running simulation logic during ticks.
 * Designers can observe NPC routines, relationship drift, and other world changes.
 * Phase 8: Adds lifecycle hooks and plugin management separate from runtime.
 */

import type { GameSessionDTO, GameWorldDetail } from '../api/game';
import type { SimulationScenario } from './scenarios';
import type { SimulationHistory } from './history';

export interface SimulationTickContext {
  worldId: number;
  worldDetail: GameWorldDetail;
  worldTime: number;
  deltaSeconds: number;
  session: GameSessionDTO | null;
  selectedNpcIds: number[];
}

export interface SimulationEvent {
  id: string;
  timestamp: number;
  worldTime: number;
  type: 'info' | 'warning' | 'success' | 'error';
  category: 'time' | 'npc' | 'relationship' | 'quest' | 'world' | 'custom' | 'lifecycle' | 'plugin';
  title: string;
  message: string;
  metadata?: Record<string, any>;
}

// Phase 8: Lifecycle hook types
export type SimulationHook = (
  context: SimulationTickContext
) => Promise<SimulationEvent[]> | SimulationEvent[];

export type BeforeTickHook = (context: SimulationTickContext) => Promise<void> | void;
export type AfterTickHook = (
  context: SimulationTickContext,
  events: SimulationEvent[]
) => Promise<void> | void;

export interface ScenarioLoadedContext {
  scenario: SimulationScenario;
  worldId: number;
  worldTime: number;
}

export type ScenarioLoadedHook = (context: ScenarioLoadedContext) => Promise<SimulationEvent[]> | SimulationEvent[];

export interface SimulationStartedContext {
  worldId: number;
  worldTime: number;
  mode: 'manual' | 'auto' | 'constraint';
}

export type SimulationStartedHook = (context: SimulationStartedContext) => Promise<SimulationEvent[]> | SimulationEvent[];

export interface SimulationStoppedContext {
  worldId: number;
  worldTime: number;
  reason: string;
  ticksRun: number;
}

export type SimulationStoppedHook = (context: SimulationStoppedContext) => Promise<SimulationEvent[]> | SimulationEvent[];

// Phase 8: Plugin metadata
export interface SimulationPlugin {
  id: string;
  name: string;
  description?: string;
  version?: string;
  author?: string;
  enabled: boolean;
  hooks: {
    beforeTick?: BeforeTickHook;
    afterTick?: AfterTickHook;
    onTick?: SimulationHook;
    onScenarioLoaded?: ScenarioLoadedHook;
    onSimulationStarted?: SimulationStartedHook;
    onSimulationStopped?: SimulationStoppedHook;
  };
}

/**
 * Simulation Hooks Registry (Extended for Phase 8)
 */
class SimulationHooksRegistry {
  private hooks: Map<string, SimulationHook> = new Map();
  private plugins: Map<string, SimulationPlugin> = new Map(); // Phase 8: Plugin storage

  /**
   * Register a simulation hook (legacy API)
   */
  register(id: string, hook: SimulationHook): void {
    this.hooks.set(id, hook);
  }

  /**
   * Unregister a simulation hook (legacy API)
   */
  unregister(id: string): void {
    this.hooks.delete(id);
  }

  /**
   * Phase 8: Register a plugin
   */
  registerPlugin(plugin: SimulationPlugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  /**
   * Phase 8: Unregister a plugin
   */
  unregisterPlugin(id: string): void {
    this.plugins.delete(id);
  }

  /**
   * Phase 8: Get all registered plugins
   */
  getPlugins(): SimulationPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Phase 8: Enable/disable a plugin
   */
  setPluginEnabled(id: string, enabled: boolean): void {
    const plugin = this.plugins.get(id);
    if (plugin) {
      plugin.enabled = enabled;
    }
  }

  /**
   * Run all registered hooks (including plugin hooks)
   */
  async runAll(context: SimulationTickContext): Promise<SimulationEvent[]> {
    const allEvents: SimulationEvent[] = [];

    // Run legacy hooks
    for (const [id, hook] of this.hooks.entries()) {
      try {
        const events = await Promise.resolve(hook(context));
        allEvents.push(...events);
      } catch (error) {
        console.error(`Error running simulation hook ${id}:`, error);
        allEvents.push({
          id: `error-${id}-${Date.now()}`,
          timestamp: Date.now(),
          worldTime: context.worldTime,
          type: 'error',
          category: 'custom',
          title: `Hook Error: ${id}`,
          message: String(error),
        });
      }
    }

    // Phase 8: Run plugin onTick hooks
    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled || !plugin.hooks.onTick) continue;

      try {
        const events = await Promise.resolve(plugin.hooks.onTick(context));
        allEvents.push(...events);
      } catch (error) {
        console.error(`Error running plugin ${plugin.id}:`, error);
        allEvents.push({
          id: `error-${plugin.id}-${Date.now()}`,
          timestamp: Date.now(),
          worldTime: context.worldTime,
          type: 'error',
          category: 'plugin',
          title: `Plugin Error: ${plugin.name}`,
          message: String(error),
        });
      }
    }

    return allEvents;
  }

  /**
   * Phase 8: Run beforeTick hooks
   */
  async runBeforeTick(context: SimulationTickContext): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled || !plugin.hooks.beforeTick) continue;

      try {
        await Promise.resolve(plugin.hooks.beforeTick(context));
      } catch (error) {
        console.error(`Error in beforeTick for plugin ${plugin.id}:`, error);
      }
    }
  }

  /**
   * Phase 8: Run afterTick hooks
   */
  async runAfterTick(
    context: SimulationTickContext,
    events: SimulationEvent[]
  ): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled || !plugin.hooks.afterTick) continue;

      try {
        await Promise.resolve(plugin.hooks.afterTick(context, events));
      } catch (error) {
        console.error(`Error in afterTick for plugin ${plugin.id}:`, error);
      }
    }
  }

  /**
   * Phase 8: Run scenario loaded hooks
   */
  async runScenarioLoaded(context: ScenarioLoadedContext): Promise<SimulationEvent[]> {
    const allEvents: SimulationEvent[] = [];

    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled || !plugin.hooks.onScenarioLoaded) continue;

      try {
        const events = await Promise.resolve(plugin.hooks.onScenarioLoaded(context));
        allEvents.push(...events);
      } catch (error) {
        console.error(`Error in onScenarioLoaded for plugin ${plugin.id}:`, error);
      }
    }

    return allEvents;
  }

  /**
   * Phase 8: Run simulation started hooks
   */
  async runSimulationStarted(context: SimulationStartedContext): Promise<SimulationEvent[]> {
    const allEvents: SimulationEvent[] = [];

    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled || !plugin.hooks.onSimulationStarted) continue;

      try {
        const events = await Promise.resolve(plugin.hooks.onSimulationStarted(context));
        allEvents.push(...events);
      } catch (error) {
        console.error(`Error in onSimulationStarted for plugin ${plugin.id}:`, error);
      }
    }

    return allEvents;
  }

  /**
   * Phase 8: Run simulation stopped hooks
   */
  async runSimulationStopped(context: SimulationStoppedContext): Promise<SimulationEvent[]> {
    const allEvents: SimulationEvent[] = [];

    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled || !plugin.hooks.onSimulationStopped) continue;

      try {
        const events = await Promise.resolve(plugin.hooks.onSimulationStopped(context));
        allEvents.push(...events);
      } catch (error) {
        console.error(`Error in onSimulationStopped for plugin ${plugin.id}:`, error);
      }
    }

    return allEvents;
  }

  /**
   * Get all registered hook IDs
   */
  getHookIds(): string[] {
    return Array.from(this.hooks.keys());
  }
}

export const simulationHooksRegistry = new SimulationHooksRegistry();

/**
 * Built-in simulation hooks
 */

/**
 * Time advancement logging hook
 */
export const timeAdvancementHook: SimulationHook = (context) => {
  const events: SimulationEvent[] = [];

  events.push({
    id: `time-advance-${Date.now()}`,
    timestamp: Date.now(),
    worldTime: context.worldTime,
    type: 'info',
    category: 'time',
    title: 'Time Advanced',
    message: `Advanced ${context.deltaSeconds}s (${Math.floor(context.deltaSeconds / 3600)}h ${Math.floor((context.deltaSeconds % 3600) / 60)}m)`,
    metadata: {
      deltaSeconds: context.deltaSeconds,
      newWorldTime: context.worldTime,
    },
  });

  return events;
};

/**
 * NPC routine simulation hook (stub for future implementation)
 */
export const npcRoutineHook: SimulationHook = (context) => {
  const events: SimulationEvent[] = [];

  // Stub: Log that NPC routines would be evaluated here
  if (context.selectedNpcIds.length > 0) {
    events.push({
      id: `npc-routine-${Date.now()}`,
      timestamp: Date.now(),
      worldTime: context.worldTime,
      type: 'info',
      category: 'npc',
      title: 'NPC Routines',
      message: `Evaluated routines for ${context.selectedNpcIds.length} NPC(s)`,
      metadata: {
        npcIds: context.selectedNpcIds,
      },
    });
  }

  return events;
};

/**
 * Relationship drift hook (stub for future implementation)
 */
export const relationshipDriftHook: SimulationHook = (context) => {
  const events: SimulationEvent[] = [];

  // Stub: Log that relationship drift would be calculated here
  const relationshipsData = context.session?.stats?.relationships || {};
  const relationshipCount = Object.keys(relationshipsData).length;
  if (relationshipCount > 0) {
    events.push({
      id: `relationship-drift-${Date.now()}`,
      timestamp: Date.now(),
      worldTime: context.worldTime,
      type: 'info',
      category: 'relationship',
      title: 'Relationship Drift',
      message: `Simulated relationship changes for ${relationshipCount} relationship(s)`,
      metadata: {
        relationshipCount,
      },
    });
  }

  return events;
};

/**
 * World state update hook
 */
export const worldStateHook: SimulationHook = (context) => {
  const events: SimulationEvent[] = [];

  events.push({
    id: `world-state-${Date.now()}`,
    timestamp: Date.now(),
    worldTime: context.worldTime,
    type: 'success',
    category: 'world',
    title: 'World State Updated',
    message: `World "${context.worldDetail.name}" synchronized`,
    metadata: {
      worldId: context.worldId,
      worldTime: context.worldTime,
    },
  });

  return events;
};

/**
 * Register all built-in hooks
 */
export function registerBuiltinHooks(): void {
  simulationHooksRegistry.register('time-advancement', timeAdvancementHook);
  simulationHooksRegistry.register('npc-routines', npcRoutineHook);
  simulationHooksRegistry.register('relationship-drift', relationshipDriftHook);
  simulationHooksRegistry.register('world-state', worldStateHook);
}

/**
 * Unregister all built-in hooks
 */
export function unregisterBuiltinHooks(): void {
  simulationHooksRegistry.unregister('time-advancement');
  simulationHooksRegistry.unregister('npc-routines');
  simulationHooksRegistry.unregister('relationship-drift');
  simulationHooksRegistry.unregister('world-state');
}

/**
 * Phase 8: Example Simulation Plugins
 */

/**
 * Example: Event Logger Plugin
 * Logs all simulation events to console
 */
export const eventLoggerPlugin: SimulationPlugin = {
  id: 'event-logger',
  name: 'Event Logger',
  description: 'Logs all simulation events to the browser console',
  version: '1.0.0',
  enabled: false,
  hooks: {
    afterTick: (context, events) => {
      if (events.length > 0) {
        console.log(
          `[Event Logger] Tick completed at world time ${context.worldTime}:`,
          events
        );
      }
    },
    onSimulationStarted: (context) => {
      return [
        {
          id: `logger-started-${Date.now()}`,
          timestamp: Date.now(),
          worldTime: context.worldTime,
          type: 'info',
          category: 'lifecycle',
          title: 'Event Logger Started',
          message: `Logging simulation events in ${context.mode} mode`,
          metadata: { mode: context.mode },
        },
      ];
    },
    onSimulationStopped: (context) => {
      return [
        {
          id: `logger-stopped-${Date.now()}`,
          timestamp: Date.now(),
          worldTime: context.worldTime,
          type: 'info',
          category: 'lifecycle',
          title: 'Event Logger Stopped',
          message: `Ran for ${context.ticksRun} ticks. Reason: ${context.reason}`,
          metadata: { ticksRun: context.ticksRun, reason: context.reason },
        },
      ];
    },
  },
};

/**
 * Example: Performance Monitor Plugin
 * Tracks tick execution time
 */
export const performanceMonitorPlugin: SimulationPlugin = {
  id: 'performance-monitor',
  name: 'Performance Monitor',
  description: 'Monitors simulation tick execution time',
  version: '1.0.0',
  enabled: false,
  hooks: {
    beforeTick: () => {
      (performance as any).simulationTickStart = performance.now();
    },
    afterTick: (context, events) => {
      const elapsed = performance.now() - (performance as any).simulationTickStart;
      if (elapsed > 100) {
        // Log slow ticks
        console.warn(
          `[Performance Monitor] Slow tick detected: ${elapsed.toFixed(2)}ms at world time ${
            context.worldTime
          }`
        );
      }
    },
    onTick: (context) => {
      const elapsed = performance.now() - (performance as any).simulationTickStart;
      if (elapsed > 100) {
        return [
          {
            id: `perf-warning-${Date.now()}`,
            timestamp: Date.now(),
            worldTime: context.worldTime,
            type: 'warning',
            category: 'plugin',
            title: 'Slow Tick Detected',
            message: `Tick took ${elapsed.toFixed(2)}ms to execute`,
            metadata: { elapsedMs: elapsed },
          },
        ];
      }
      return [];
    },
  },
};

/**
 * Example: State Validator Plugin
 * Validates simulation state consistency
 */
export const stateValidatorPlugin: SimulationPlugin = {
  id: 'state-validator',
  name: 'State Validator',
  description: 'Validates simulation state consistency after each tick',
  version: '1.0.0',
  enabled: false,
  hooks: {
    afterTick: (context, events) => {
      // Example validation: Check if world time is progressing
      const lastWorldTime = (context as any).lastWorldTime ?? 0;
      if (context.worldTime <= lastWorldTime && context.deltaSeconds > 0) {
        console.error(
          `[State Validator] World time did not advance! Current: ${context.worldTime}, Last: ${lastWorldTime}`
        );
      }
      (context as any).lastWorldTime = context.worldTime;
    },
    onTick: (context) => {
      const events: SimulationEvent[] = [];

      // Validate world time is reasonable
      if (context.worldTime < 0) {
        events.push({
          id: `validation-error-${Date.now()}`,
          timestamp: Date.now(),
          worldTime: context.worldTime,
          type: 'error',
          category: 'plugin',
          title: 'Invalid World Time',
          message: `World time is negative: ${context.worldTime}`,
        });
      }

      return events;
    },
  },
};

/**
 * Example: Scenario Tracker Plugin
 * Tracks scenario progress and milestones
 */
export const scenarioTrackerPlugin: SimulationPlugin = {
  id: 'scenario-tracker',
  name: 'Scenario Tracker',
  description: 'Tracks scenario loading and milestone events',
  version: '1.0.0',
  enabled: false,
  hooks: {
    onScenarioLoaded: (context) => {
      return [
        {
          id: `scenario-loaded-${Date.now()}`,
          timestamp: Date.now(),
          worldTime: context.worldTime,
          type: 'success',
          category: 'lifecycle',
          title: 'Scenario Loaded',
          message: `Loaded scenario "${context.scenario.name}" with ${context.scenario.npcIds.length} NPCs`,
          metadata: {
            scenarioId: context.scenario.id,
            scenarioName: context.scenario.name,
            npcCount: context.scenario.npcIds.length,
          },
        },
      ];
    },
  },
};

/**
 * Register all example plugins
 */
export function registerExamplePlugins(): void {
  simulationHooksRegistry.registerPlugin(eventLoggerPlugin);
  simulationHooksRegistry.registerPlugin(performanceMonitorPlugin);
  simulationHooksRegistry.registerPlugin(stateValidatorPlugin);
  simulationHooksRegistry.registerPlugin(scenarioTrackerPlugin);
}

/**
 * Unregister all example plugins
 */
export function unregisterExamplePlugins(): void {
  simulationHooksRegistry.unregisterPlugin('event-logger');
  simulationHooksRegistry.unregisterPlugin('performance-monitor');
  simulationHooksRegistry.unregisterPlugin('state-validator');
  simulationHooksRegistry.unregisterPlugin('scenario-tracker');
}
