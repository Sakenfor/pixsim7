/**
 * Gizmo Console Registration
 *
 * Self-registers tool and gizmo console operations when gizmos are loaded.
 * This follows the pattern of features registering their own console commands.
 */

import { create } from 'zustand';
import {
  getAllTools,
  getTool,
  getAllGizmos,
  getGizmo,
} from '@pixsim7/scene.gizmos';

// ============================================================================
// Tool State Store (for console control)
// ============================================================================

interface ToolState {
  activeToolId: string | null;
  overrides: {
    pressure?: number;
    speed?: number;
    temperature?: number;
    unlockAll?: boolean;
    relationshipLevel?: number;
  };
  setActiveTool: (toolId: string | null) => void;
  setOverride: <K extends keyof ToolState['overrides']>(key: K, value: ToolState['overrides'][K]) => void;
  clearOverrides: () => void;
}

export const useToolConsoleStore = create<ToolState>((set) => ({
  activeToolId: null,
  overrides: {},
  setActiveTool: (toolId) => set({ activeToolId: toolId }),
  setOverride: (key, value) =>
    set((state) => ({
      overrides: { ...state.overrides, [key]: value },
    })),
  clearOverrides: () => set({ overrides: {} }),
}));

// ============================================================================
// Console Registration
// ============================================================================

let registered = false;

/**
 * Register tool and gizmo console operations.
 * Called automatically when this module is imported.
 */
export function registerGizmoConsole(): void {
  if (registered) return;

  // Lazy import to avoid circular dependencies
  // Console may not be initialized yet when gizmos load
  import('@/lib/console').then(({ opsRegistry, dataRegistry, isConsoleInitialized }) => {
    // If console isn't initialized yet, defer registration
    if (!isConsoleInitialized()) {
      // Will be called again when console initializes via module system
      return;
    }

    registerToolOps(opsRegistry);
    registerGizmoOps(opsRegistry);
    registerDataStore(dataRegistry);
    registered = true;
  }).catch(() => {
    // Console not available, skip registration
  });
}

/**
 * Synchronous registration for use when console is already initialized.
 * Called by the console module system.
 */
export function registerGizmoConsoleSync(
  opsRegistry: { registerCategory: Function; register: Function },
  dataRegistry: { register: Function }
): void {
  if (registered) return;

  registerToolOps(opsRegistry);
  registerGizmoOps(opsRegistry);
  registerDataStore(dataRegistry);
  registered = true;
}

// ============================================================================
// Tool Operations
// ============================================================================

function registerToolOps(opsRegistry: { registerCategory: Function; register: Function }): void {
  opsRegistry.registerCategory('tools', 'Tools', 'Interactive tool operations and cheats');

  opsRegistry.register('tools', {
    id: 'list',
    name: 'List Tools',
    description: 'List all registered tools',
    execute: () => {
      const tools = getAllTools();
      return tools.map((t) => ({
        id: t.id,
        type: t.type,
        model: t.visual.model,
        pressure: t.physics.pressure,
        speed: t.physics.speed,
      }));
    },
  });

  opsRegistry.register('tools', {
    id: 'get',
    name: 'Get Tool',
    description: 'Get full details of a tool by ID',
    execute: (toolId: unknown) => {
      if (typeof toolId !== 'string') throw new Error('toolId must be a string');
      const tool = getTool(toolId);
      if (!tool) throw new Error(`Tool not found: ${toolId}`);
      return tool;
    },
    params: [{ name: 'toolId', type: 'string', required: true, description: 'Tool ID' }],
  });

  opsRegistry.register('tools', {
    id: 'select',
    name: 'Select Tool',
    description: 'Select a tool as active (for testing)',
    execute: (toolId: unknown) => {
      if (typeof toolId !== 'string') throw new Error('toolId must be a string');
      const tool = getTool(toolId);
      if (!tool) throw new Error(`Tool not found: ${toolId}`);
      useToolConsoleStore.getState().setActiveTool(toolId);
      return `Selected tool: ${toolId}`;
    },
    params: [{ name: 'toolId', type: 'string', required: true, description: 'Tool ID to select' }],
  });

  opsRegistry.register('tools', {
    id: 'active',
    name: 'Get Active Tool',
    description: 'Get the currently active tool',
    execute: () => {
      const { activeToolId } = useToolConsoleStore.getState();
      if (!activeToolId) return 'No tool selected';
      const tool = getTool(activeToolId);
      return tool ? { id: tool.id, type: tool.type, model: tool.visual.model } : 'Tool not found';
    },
  });

  // Parameter overrides
  opsRegistry.register('tools', {
    id: 'setPressure',
    name: 'Set Pressure Override',
    description: 'Override pressure parameter (0-1)',
    execute: (value: unknown) => {
      if (typeof value !== 'number') throw new Error('value must be a number');
      if (value < 0 || value > 1) throw new Error('value must be between 0 and 1');
      useToolConsoleStore.getState().setOverride('pressure', value);
      return `Pressure override set to ${value}`;
    },
    params: [{ name: 'value', type: 'number', required: true, description: 'Pressure (0-1)' }],
  });

  opsRegistry.register('tools', {
    id: 'setSpeed',
    name: 'Set Speed Override',
    description: 'Override speed parameter (0-1)',
    execute: (value: unknown) => {
      if (typeof value !== 'number') throw new Error('value must be a number');
      if (value < 0 || value > 1) throw new Error('value must be between 0 and 1');
      useToolConsoleStore.getState().setOverride('speed', value);
      return `Speed override set to ${value}`;
    },
    params: [{ name: 'value', type: 'number', required: true, description: 'Speed (0-1)' }],
  });

  opsRegistry.register('tools', {
    id: 'setTemperature',
    name: 'Set Temperature Override',
    description: 'Override temperature parameter (0=cold, 1=hot)',
    execute: (value: unknown) => {
      if (typeof value !== 'number') throw new Error('value must be a number');
      if (value < 0 || value > 1) throw new Error('value must be between 0 and 1');
      useToolConsoleStore.getState().setOverride('temperature', value);
      return `Temperature override set to ${value}`;
    },
    params: [{ name: 'value', type: 'number', required: true, description: 'Temperature (0-1)' }],
  });

  opsRegistry.register('tools', {
    id: 'clearOverrides',
    name: 'Clear Overrides',
    description: 'Clear all tool parameter overrides',
    execute: () => {
      useToolConsoleStore.getState().clearOverrides();
      return 'All overrides cleared';
    },
  });

  opsRegistry.register('tools', {
    id: 'getOverrides',
    name: 'Get Overrides',
    description: 'Get current tool parameter overrides',
    execute: () => {
      const { overrides } = useToolConsoleStore.getState();
      const entries = Object.entries(overrides).filter(([, v]) => v !== undefined);
      if (entries.length === 0) return 'No overrides active';
      return Object.fromEntries(entries);
    },
  });

  // Cheat commands
  opsRegistry.register('tools', {
    id: 'unlockAll',
    name: 'Unlock All Tools',
    description: '[CHEAT] Unlock all tools regardless of level',
    execute: () => {
      useToolConsoleStore.getState().setOverride('unlockAll', true);
      return '🔓 All tools unlocked! (cheat mode)';
    },
  });

  opsRegistry.register('tools', {
    id: 'setRelationshipLevel',
    name: 'Set Relationship Level',
    description: '[CHEAT] Set relationship level (0-100)',
    execute: (level: unknown) => {
      if (typeof level !== 'number') throw new Error('level must be a number');
      if (level < 0 || level > 100) throw new Error('level must be between 0 and 100');
      useToolConsoleStore.getState().setOverride('relationshipLevel', level);
      return `💕 Relationship level set to ${level}`;
    },
    params: [{ name: 'level', type: 'number', required: true, description: 'Level (0-100)' }],
  });
}

// ============================================================================
// Gizmo Operations
// ============================================================================

function registerGizmoOps(opsRegistry: { registerCategory: Function; register: Function }): void {
  opsRegistry.registerCategory('gizmos', 'Gizmos', 'Interactive gizmo operations');

  opsRegistry.register('gizmos', {
    id: 'list',
    name: 'List Gizmos',
    description: 'List all registered gizmos',
    execute: () => {
      const gizmos = getAllGizmos();
      return gizmos.map((g) => ({
        id: g.id,
        name: g.name,
        category: g.category,
        tags: g.tags,
      }));
    },
  });

  opsRegistry.register('gizmos', {
    id: 'get',
    name: 'Get Gizmo',
    description: 'Get full details of a gizmo by ID',
    execute: (gizmoId: unknown) => {
      if (typeof gizmoId !== 'string') throw new Error('gizmoId must be a string');
      const gizmo = getGizmo(gizmoId);
      if (!gizmo) throw new Error(`Gizmo not found: ${gizmoId}`);
      return {
        id: gizmo.id,
        name: gizmo.name,
        category: gizmo.category,
        description: gizmo.description,
        tags: gizmo.tags,
        defaultConfig: gizmo.defaultConfig,
      };
    },
    params: [{ name: 'gizmoId', type: 'string', required: true, description: 'Gizmo ID' }],
  });
}

// ============================================================================
// Data Store Registration
// ============================================================================

function registerDataStore(dataRegistry: { register: Function }): void {
  dataRegistry.register({
    id: 'toolConsole',
    name: 'Tool Console State',
    description: 'Active tool and overrides for console control',
    getSnapshot: () => useToolConsoleStore.getState(),
    getKeys: () => ['activeToolId', 'overrides'],
  });
}

// Auto-register when imported (deferred to avoid blocking)
if (typeof window !== 'undefined') {
  // Use setTimeout to defer registration until after console is likely initialized
  setTimeout(registerGizmoConsole, 0);
}
