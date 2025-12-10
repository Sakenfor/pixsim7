/**
 * Gizmo Console Registration
 *
 * Self-registers tool and gizmo console operations when gizmos are loaded.
 * This follows the pattern of features registering their own console commands.
 *
 * Enhanced with:
 * - Per-tool parameter overrides with dot notation
 * - Preset system (gentle, intense, no-cooldown, etc.)
 * - Undo history
 * - Dynamic tool-defined operations
 */

import { create } from 'zustand';
import {
  getAllTools,
  getTool,
  getAllGizmos,
  getGizmo,
} from '@pixsim7/scene.gizmos';
import { useToolConfigStore } from '@/stores/toolConfigStore';

// ============================================================================
// Tool State Store (for console control)
// Re-export from toolConfigStore for backwards compatibility
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

// Simple store for backwards compatibility with main's API
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
  import('@/lib/console').then(({ opsRegistry, dataRegistry, isConsoleInitialized }) => {
    if (!isConsoleInitialized()) {
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
// Tool Operations (Enhanced)
// ============================================================================

function registerToolOps(opsRegistry: { registerCategory: Function; register: Function }): void {
  opsRegistry.registerCategory('tools', 'Tools', 'Interactive tool configuration, parameter adjustment, and cheats');

  // List all tools
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
        physics: {
          pressure: t.physics.pressure,
          speed: t.physics.speed,
          temperature: t.physics.temperature,
        },
      }));
    },
  });

  // Get a tool definition
  opsRegistry.register('tools', {
    id: 'get',
    name: 'Get Tool',
    description: 'Get full tool definition by ID',
    execute: (toolId: unknown) => {
      if (typeof toolId !== 'string') throw new Error('toolId must be a string');
      const tool = getTool(toolId);
      if (!tool) throw new Error(`Unknown tool: ${toolId}`);
      return tool;
    },
    params: [{ name: 'toolId', type: 'string', required: true, description: 'Tool ID (e.g., "touch", "temperature")' }],
  });

  // Select a tool as active
  opsRegistry.register('tools', {
    id: 'select',
    name: 'Select Tool',
    description: 'Select a tool as active (for testing)',
    execute: (toolId: unknown) => {
      if (typeof toolId !== 'string') throw new Error('toolId must be a string');
      const tool = getTool(toolId);
      if (!tool) throw new Error(`Tool not found: ${toolId}`);
      useToolConsoleStore.getState().setActiveTool(toolId);
      useToolConfigStore.getState().setActiveTool(toolId);
      return `Selected tool: ${toolId}`;
    },
    params: [{ name: 'toolId', type: 'string', required: true, description: 'Tool ID to select' }],
  });

  // Set a tool parameter (enhanced with dot notation)
  opsRegistry.register('tools', {
    id: 'set',
    name: 'Set Parameter',
    description: 'Set a tool parameter using dot notation (e.g., "physics.pressure", "visual.glow")',
    execute: (toolId: unknown, path: unknown, value: unknown) => {
      if (typeof toolId !== 'string') throw new Error('toolId must be a string');
      if (typeof path !== 'string') throw new Error('path must be a string');

      const tool = getTool(toolId);
      if (!tool) throw new Error(`Unknown tool: ${toolId}`);

      const [category] = path.split('.');
      if (!['physics', 'visual', 'feedback', 'constraints'].includes(category)) {
        throw new Error(`Invalid path category: ${category}. Use physics, visual, feedback, or constraints`);
      }

      useToolConfigStore.getState().setParameter(toolId, path, value);
      return `Set ${toolId}.${path} = ${JSON.stringify(value)}`;
    },
    params: [
      { name: 'toolId', type: 'string', required: true, description: 'Tool ID' },
      { name: 'path', type: 'string', required: true, description: 'Parameter path (e.g., "physics.pressure")' },
      { name: 'value', type: 'any', required: true, description: 'New value' },
    ],
  });

  // Get current overrides for a tool
  opsRegistry.register('tools', {
    id: 'overrides',
    name: 'Get Overrides',
    description: 'Get current parameter overrides for a tool',
    execute: (toolId: unknown) => {
      if (typeof toolId !== 'string') throw new Error('toolId must be a string');
      const overrides = useToolConfigStore.getState().getOverrides(toolId);
      return overrides || {};
    },
    params: [{ name: 'toolId', type: 'string', required: true, description: 'Tool ID' }],
  });

  // Reset a tool to defaults
  opsRegistry.register('tools', {
    id: 'reset',
    name: 'Reset Tool',
    description: 'Reset a tool to its default parameters (clear all overrides)',
    execute: (toolId: unknown) => {
      if (typeof toolId !== 'string') throw new Error('toolId must be a string');
      useToolConfigStore.getState().resetTool(toolId);
      return `Reset ${toolId} to defaults`;
    },
    params: [{ name: 'toolId', type: 'string', required: true, description: 'Tool ID' }],
  });

  // Reset all tools
  opsRegistry.register('tools', {
    id: 'resetAll',
    name: 'Reset All',
    description: 'Reset all tools to default parameters',
    execute: () => {
      useToolConfigStore.getState().resetAll();
      useToolConsoleStore.getState().clearOverrides();
      return 'All tools reset to defaults';
    },
  });

  // List adjustable parameters
  opsRegistry.register('tools', {
    id: 'params',
    name: 'List Parameters',
    description: 'List all adjustable parameters for a tool',
    execute: (toolId: unknown) => {
      if (typeof toolId !== 'string') throw new Error('toolId must be a string');

      const tool = getTool(toolId);
      if (!tool) throw new Error(`Unknown tool: ${toolId}`);

      const adjustablePaths = {
        physics: ['pressure', 'speed', 'temperature', 'vibration', 'pattern'],
        visual: ['baseColor', 'activeColor', 'glow', 'trail'],
        constraints: ['minPressure', 'maxSpeed', 'cooldown'],
      };

      const result: Record<string, Record<string, { current: unknown; type: string }>> = {};

      result.physics = {};
      for (const key of adjustablePaths.physics) {
        const value = tool.physics[key as keyof typeof tool.physics];
        if (value !== undefined) {
          result.physics[key] = { current: value, type: typeof value };
        }
      }

      result.visual = {};
      for (const key of adjustablePaths.visual) {
        const value = tool.visual[key as keyof typeof tool.visual];
        if (value !== undefined) {
          result.visual[key] = { current: value, type: typeof value };
        }
      }

      if (tool.constraints) {
        result.constraints = {};
        for (const key of adjustablePaths.constraints) {
          const value = tool.constraints[key as keyof typeof tool.constraints];
          if (value !== undefined) {
            result.constraints[key] = { current: value, type: typeof value };
          }
        }
      }

      return result;
    },
    params: [{ name: 'toolId', type: 'string', required: true, description: 'Tool ID' }],
  });

  // Apply a preset
  opsRegistry.register('tools', {
    id: 'preset',
    name: 'Apply Preset',
    description: 'Apply a preset configuration to a tool',
    execute: (toolId: unknown, presetId: unknown) => {
      if (typeof toolId !== 'string') throw new Error('toolId must be a string');
      if (typeof presetId !== 'string') throw new Error('presetId must be a string');

      const presets = useToolConfigStore.getState().presets;
      const preset = presets.find((p) => p.id === presetId);
      if (!preset) {
        const available = presets.map((p) => p.id).join(', ');
        throw new Error(`Unknown preset: ${presetId}. Available: ${available}`);
      }

      useToolConfigStore.getState().applyPreset(toolId, presetId);
      return `Applied preset "${preset.name}" to ${toolId}`;
    },
    params: [
      { name: 'toolId', type: 'string', required: true, description: 'Tool ID' },
      { name: 'presetId', type: 'string', required: true, description: 'Preset ID (gentle, intense, no-cooldown, etc.)' },
    ],
  });

  // List available presets
  opsRegistry.register('tools', {
    id: 'presets',
    name: 'List Presets',
    description: 'List all available tool presets',
    execute: () => {
      return useToolConfigStore.getState().presets.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
      }));
    },
  });

  // Undo last change
  opsRegistry.register('tools', {
    id: 'undo',
    name: 'Undo',
    description: 'Undo the last parameter change',
    execute: () => {
      const history = useToolConfigStore.getState().history;
      if (history.length === 0) {
        return 'Nothing to undo';
      }
      const last = history[history.length - 1];
      useToolConfigStore.getState().undo();
      return `Undone: ${last.toolId}.${last.path} reverted to ${JSON.stringify(last.oldValue)}`;
    },
  });

  // Quick cheat: Max power mode
  opsRegistry.register('tools', {
    id: 'maxPower',
    name: 'Max Power',
    description: 'Set a tool to maximum power settings (cheat)',
    execute: (toolId: unknown) => {
      if (typeof toolId !== 'string') throw new Error('toolId must be a string');

      const tool = getTool(toolId);
      if (!tool) throw new Error(`Unknown tool: ${toolId}`);

      useToolConfigStore.getState().setOverrides(toolId, {
        physics: {
          pressure: 1,
          speed: 1,
          vibration: 1,
        },
        visual: {
          glow: true,
          trail: true,
        },
        constraints: {
          cooldown: 0,
        },
      });

      return `${toolId} set to MAX POWER mode!`;
    },
    params: [{ name: 'toolId', type: 'string', required: true, description: 'Tool ID' }],
  });

  // Unlock all tools cheat
  opsRegistry.register('tools', {
    id: 'unlockAll',
    name: 'Unlock All Tools',
    description: '[CHEAT] Unlock all tools regardless of level',
    execute: () => {
      useToolConsoleStore.getState().setOverride('unlockAll', true);
      return '🔓 All tools unlocked! (cheat mode)';
    },
  });

  // Status overview
  opsRegistry.register('tools', {
    id: 'status',
    name: 'Status',
    description: 'Show current status of all tool overrides',
    execute: () => {
      const { overrides, activeToolId, history } = useToolConfigStore.getState();
      const toolIds = Object.keys(overrides);

      if (toolIds.length === 0) {
        return { message: 'No tool overrides active', activeTool: activeToolId };
      }

      return {
        modifiedTools: toolIds,
        activeTool: activeToolId,
        historySize: history.length,
        overrides: Object.fromEntries(
          toolIds.map((id) => [id, overrides[id]])
        ),
      };
    },
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

  dataRegistry.register({
    id: 'toolConfig',
    name: 'Tool Configuration',
    description: 'Runtime tool parameter overrides with presets and history',
    getSnapshot: () => useToolConfigStore.getState(),
    getKeys: () => ['overrides', 'presets', 'activeToolId', 'history'],
  });
}

// Auto-register when imported (deferred to avoid blocking)
if (typeof window !== 'undefined') {
  setTimeout(registerGizmoConsole, 0);
}
