/**
 * Tool Console Operations Extension
 *
 * Allows scene gizmo tools (InteractiveTool) to define their own console
 * operations that get automatically registered when the tool is loaded.
 *
 * ## Domain Clarification
 *
 * This extends `InteractiveTool` (scene gizmos) with dev console operations.
 * NOT related to UI tool plugins (UiToolPlugin) or region drawers (RegionDrawer).
 *
 * Example usage in a tool definition:
 * ```ts
 * const temperatureTool: InteractiveToolWithOps = {
 *   ...baseToolDef,
 *   consoleOps: {
 *     freeze: {
 *       name: 'Freeze',
 *       description: 'Set temperature to minimum',
 *       execute: (ctx) => {
 *         ctx.setParam('physics.temperature', 0);
 *         return 'Temperature set to freezing';
 *       },
 *     },
 *     heat: {
 *       name: 'Heat Up',
 *       description: 'Set temperature to maximum',
 *       execute: (ctx) => {
 *         ctx.setParam('physics.temperature', 1);
 *         return 'Temperature set to max';
 *       },
 *     },
 *   },
 * };
 * ```
 */

import type { InteractiveTool } from '@pixsim7/interaction.gizmos';

import { opsRegistry, type Operation } from '@lib/dev';

import { useToolConfigStore } from '../../stores/toolConfigStore';

/**
 * Context passed to tool console operations
 */
export interface ToolOpContext {
  /** The tool ID */
  toolId: string;
  /** Get current value of a parameter (with overrides applied) */
  getParam: (path: string) => unknown;
  /** Set a parameter override */
  setParam: (path: string, value: unknown) => void;
  /** Get all current overrides */
  getOverrides: () => Record<string, unknown>;
  /** Reset all overrides for this tool */
  reset: () => void;
  /** Apply a preset */
  applyPreset: (presetId: string) => void;
}

/**
 * A console operation defined by a tool
 */
export interface ToolConsoleOp {
  /** Human-readable name */
  name: string;
  /** Brief description */
  description: string;
  /** The operation function - receives tool context */
  execute: (ctx: ToolOpContext, ...args: unknown[]) => unknown;
  /** Optional parameter definitions for autocomplete */
  params?: Array<{
    name: string;
    type: string;
    required?: boolean;
    description?: string;
  }>;
}

/**
 * Extended InteractiveTool with optional console operations
 */
export interface InteractiveToolWithOps extends InteractiveTool {
  /** Custom console operations for this tool */
  consoleOps?: Record<string, ToolConsoleOp>;
}

/**
 * Registry of tools that have custom console ops
 */
const toolsWithOps = new Map<string, InteractiveToolWithOps>();

/**
 * Create the operation context for a tool
 */
function createToolOpContext(toolId: string): ToolOpContext {
  const store = useToolConfigStore.getState();

  return {
    toolId,

    getParam: (path: string) => {
      const overrides = store.getOverrides(toolId) || {};
      const parts = path.split('.');
      let current: unknown = overrides;

      for (const part of parts) {
        if (current === undefined || current === null) return undefined;
        current = (current as Record<string, unknown>)[part];
      }

      return current;
    },

    setParam: (path: string, value: unknown) => {
      store.setParameter(toolId, path, value);
    },

    getOverrides: () => {
      return (store.getOverrides(toolId) || {}) as Record<string, unknown>;
    },

    reset: () => {
      store.resetTool(toolId);
    },

    applyPreset: (presetId: string) => {
      store.applyPreset(toolId, presetId);
    },
  };
}

/**
 * Register a tool's console operations
 * Called automatically when a tool with consoleOps is registered
 */
export function registerToolConsoleOps(tool: InteractiveToolWithOps): void {
  if (!tool.consoleOps) return;

  toolsWithOps.set(tool.id, tool);

  // Register each operation under pixsim.ops.tools.<toolId>.<opName>
  // We create a subcategory for each tool
  const categoryId = `tools.${tool.id}`;
  opsRegistry.registerCategory(
    categoryId,
    `${tool.id} Tool`,
    `Operations for the ${tool.id} tool`
  );

  for (const [opId, op] of Object.entries(tool.consoleOps)) {
    const operation: Operation = {
      id: opId,
      name: op.name,
      description: op.description,
      execute: (...args: unknown[]) => {
        const ctx = createToolOpContext(tool.id);
        return op.execute(ctx, ...args);
      },
      params: op.params,
    };

    opsRegistry.register(categoryId, operation);
  }

  // Also register a help operation for this tool
  opsRegistry.register(categoryId, {
    id: 'help',
    name: 'Help',
    description: `Show available operations for ${tool.id}`,
    execute: () => {
      const ops = Object.entries(tool.consoleOps!).map(([id, op]) => ({
        command: `pixsim.ops.tools.${tool.id}.${id}()`,
        name: op.name,
        description: op.description,
      }));
      return ops;
    },
  });
}

/**
 * Unregister a tool's console operations
 */
export function unregisterToolConsoleOps(toolId: string): void {
  toolsWithOps.delete(toolId);
  // Note: opsRegistry doesn't support unregister, but this tracks our state
}

/**
 * Get all tools that have custom console operations
 */
export function getToolsWithConsoleOps(): InteractiveToolWithOps[] {
  return Array.from(toolsWithOps.values());
}

/**
 * Check if a tool has custom console operations
 */
export function hasToolConsoleOps(toolId: string): boolean {
  return toolsWithOps.has(toolId);
}

/**
 * Helper to create common tool operations
 * Use these to quickly build consoleOps for your tools
 */
export const commonToolOps = {
  /** Create a "set pressure" operation */
  pressure: (levels: Record<string, number> = { light: 0.2, medium: 0.5, heavy: 0.9 }): Record<string, ToolConsoleOp> => {
    const ops: Record<string, ToolConsoleOp> = {};

    for (const [name, value] of Object.entries(levels)) {
      ops[name] = {
        name: `${name.charAt(0).toUpperCase() + name.slice(1)} Pressure`,
        description: `Set pressure to ${value}`,
        execute: (ctx) => {
          ctx.setParam('physics.pressure', value);
          return `Pressure set to ${name} (${value})`;
        },
      };
    }

    return ops;
  },

  /** Create a "set speed" operation */
  speed: (levels: Record<string, number> = { slow: 0.2, normal: 0.5, fast: 0.9 }): Record<string, ToolConsoleOp> => {
    const ops: Record<string, ToolConsoleOp> = {};

    for (const [name, value] of Object.entries(levels)) {
      ops[name] = {
        name: `${name.charAt(0).toUpperCase() + name.slice(1)} Speed`,
        description: `Set speed to ${value}`,
        execute: (ctx) => {
          ctx.setParam('physics.speed', value);
          return `Speed set to ${name} (${value})`;
        },
      };
    }

    return ops;
  },

  /** Create temperature operations */
  temperature: (): Record<string, ToolConsoleOp> => ({
    freeze: {
      name: 'Freeze',
      description: 'Set to freezing cold (0)',
      execute: (ctx) => {
        ctx.setParam('physics.temperature', 0);
        return 'Temperature: FREEZING';
      },
    },
    cool: {
      name: 'Cool',
      description: 'Set to cool (0.3)',
      execute: (ctx) => {
        ctx.setParam('physics.temperature', 0.3);
        return 'Temperature: Cool';
      },
    },
    warm: {
      name: 'Warm',
      description: 'Set to warm (0.7)',
      execute: (ctx) => {
        ctx.setParam('physics.temperature', 0.7);
        return 'Temperature: Warm';
      },
    },
    hot: {
      name: 'Hot',
      description: 'Set to burning hot (1)',
      execute: (ctx) => {
        ctx.setParam('physics.temperature', 1);
        return 'Temperature: HOT!';
      },
    },
  }),

  /** Create vibration operations */
  vibration: (): Record<string, ToolConsoleOp> => ({
    vibrateOff: {
      name: 'Vibration Off',
      description: 'Disable vibration',
      execute: (ctx) => {
        ctx.setParam('physics.vibration', 0);
        return 'Vibration disabled';
      },
    },
    vibrateLow: {
      name: 'Low Vibration',
      description: 'Set low vibration',
      execute: (ctx) => {
        ctx.setParam('physics.vibration', 0.3);
        return 'Vibration: Low';
      },
    },
    vibrateHigh: {
      name: 'High Vibration',
      description: 'Set high vibration',
      execute: (ctx) => {
        ctx.setParam('physics.vibration', 0.8);
        return 'Vibration: HIGH!';
      },
    },
    vibrateMax: {
      name: 'Max Vibration',
      description: 'Maximum vibration intensity',
      execute: (ctx) => {
        ctx.setParam('physics.vibration', 1);
        return 'Vibration: MAXIMUM!!!';
      },
    },
  }),

  /** Create glow toggle */
  glow: (): Record<string, ToolConsoleOp> => ({
    glowOn: {
      name: 'Glow On',
      description: 'Enable glow effect',
      execute: (ctx) => {
        ctx.setParam('visual.glow', true);
        return 'Glow enabled';
      },
    },
    glowOff: {
      name: 'Glow Off',
      description: 'Disable glow effect',
      execute: (ctx) => {
        ctx.setParam('visual.glow', false);
        return 'Glow disabled';
      },
    },
  }),

  /** Create pattern operations */
  patterns: (): Record<string, ToolConsoleOp> => ({
    patternCircular: {
      name: 'Circular Pattern',
      description: 'Set circular touch pattern',
      execute: (ctx) => {
        ctx.setParam('physics.pattern', 'circular');
        return 'Pattern: Circular';
      },
    },
    patternLinear: {
      name: 'Linear Pattern',
      description: 'Set linear touch pattern',
      execute: (ctx) => {
        ctx.setParam('physics.pattern', 'linear');
        return 'Pattern: Linear';
      },
    },
    patternSpiral: {
      name: 'Spiral Pattern',
      description: 'Set spiral touch pattern',
      execute: (ctx) => {
        ctx.setParam('physics.pattern', 'spiral');
        return 'Pattern: Spiral';
      },
    },
    patternWave: {
      name: 'Wave Pattern',
      description: 'Set wave touch pattern',
      execute: (ctx) => {
        ctx.setParam('physics.pattern', 'wave');
        return 'Pattern: Wave';
      },
    },
  }),
};
