/**
 * Simulation Hooks System
 *
 * Provides a plugin-like system for running simulation logic during ticks.
 * Designers can observe NPC routines, relationship drift, and other world changes.
 */

import type { GameSessionDTO, GameWorldDetail } from '../api/game';

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
  category: 'time' | 'npc' | 'relationship' | 'quest' | 'world' | 'custom';
  title: string;
  message: string;
  metadata?: Record<string, any>;
}

export type SimulationHook = (
  context: SimulationTickContext
) => Promise<SimulationEvent[]> | SimulationEvent[];

/**
 * Simulation Hooks Registry
 */
class SimulationHooksRegistry {
  private hooks: Map<string, SimulationHook> = new Map();

  /**
   * Register a simulation hook
   */
  register(id: string, hook: SimulationHook): void {
    this.hooks.set(id, hook);
  }

  /**
   * Unregister a simulation hook
   */
  unregister(id: string): void {
    this.hooks.delete(id);
  }

  /**
   * Run all registered hooks
   */
  async runAll(context: SimulationTickContext): Promise<SimulationEvent[]> {
    const allEvents: SimulationEvent[] = [];

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
  if (context.session?.relationships) {
    const relationshipCount = Object.keys(context.session.relationships).length;
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
