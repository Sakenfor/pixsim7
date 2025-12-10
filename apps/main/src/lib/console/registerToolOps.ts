/**
 * Register Tool Operations
 *
 * Registers tool-related operations with the ops registry
 * so they're accessible via pixsim.ops.tools.*
 *
 * Provides console commands for:
 * - Listing available tools
 * - Getting tool definitions
 * - Adjusting tool parameters at runtime
 * - Applying presets
 * - Resetting tools to defaults
 */

import { opsRegistry } from './opsRegistry';
import { getAllTools, getTool } from '@pixsim/scene-gizmos';
import { useToolConfigStore } from '@/stores/toolConfigStore';

/** Paths that can be adjusted on tools */
const ADJUSTABLE_PATHS = {
  physics: ['pressure', 'speed', 'temperature', 'vibration', 'viscosity', 'elasticity', 'bendFactor', 'pattern'],
  visual: ['baseColor', 'activeColor', 'glow', 'trail', 'distortion'],
  'visual.particles': ['type', 'density', 'color', 'size', 'lifetime'],
  feedback: ['haptic.intensity', 'haptic.type', 'audio.volume', 'audio.pitch', 'npcReaction.intensity'],
  constraints: ['minPressure', 'maxSpeed', 'cooldown'],
};

/**
 * Register all tool operations
 */
export function registerToolOps(): void {
  // ─────────────────────────────────────────────────────────────
  // Tools Operations
  // ─────────────────────────────────────────────────────────────
  opsRegistry.registerCategory('tools', 'Tools', 'Interactive tool configuration and parameter adjustment');

  // List all tools
  opsRegistry.register('tools', {
    id: 'list',
    name: 'List Tools',
    description: 'List all available interactive tools',
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

  // Set a tool parameter
  opsRegistry.register('tools', {
    id: 'set',
    name: 'Set Parameter',
    description: 'Set a tool parameter using dot notation (e.g., "physics.pressure", "visual.glow")',
    execute: (toolId: unknown, path: unknown, value: unknown) => {
      if (typeof toolId !== 'string') throw new Error('toolId must be a string');
      if (typeof path !== 'string') throw new Error('path must be a string');

      const tool = getTool(toolId);
      if (!tool) throw new Error(`Unknown tool: ${toolId}`);

      // Validate path exists
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

      const result: Record<string, Record<string, { current: unknown; type: string }>> = {};

      // Physics params
      result.physics = {};
      for (const key of ADJUSTABLE_PATHS.physics) {
        const value = tool.physics[key as keyof typeof tool.physics];
        if (value !== undefined) {
          result.physics[key] = { current: value, type: typeof value };
        }
      }

      // Visual params
      result.visual = {};
      for (const key of ADJUSTABLE_PATHS.visual) {
        const value = tool.visual[key as keyof typeof tool.visual];
        if (value !== undefined) {
          result.visual[key] = { current: value, type: typeof value };
        }
      }

      // Constraints params
      if (tool.constraints) {
        result.constraints = {};
        for (const key of ADJUSTABLE_PATHS.constraints) {
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

  // Quick cheat commands
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
