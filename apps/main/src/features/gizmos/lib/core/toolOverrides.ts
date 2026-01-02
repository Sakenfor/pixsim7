/**
 * Tool override utilities
 *
 * Non-react helpers for applying console overrides to gizmo tools.
 */

import { createToolInstance, getTool, type InteractiveTool } from '@pixsim7/scene.gizmos';

import { useToolConfigStore, type ToolOverrides } from '../../stores/toolConfigStore';

/**
 * Deep merge helper that properly handles nested objects
 */
function deepMerge<T extends object>(base: T, overrides: Partial<T>): T {
  const result = { ...base } as T;

  for (const key in overrides) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      const baseValue = base[key];
      const overrideValue = overrides[key];

      if (
        overrideValue !== undefined &&
        typeof baseValue === 'object' &&
        baseValue !== null &&
        typeof overrideValue === 'object' &&
        overrideValue !== null &&
        !Array.isArray(baseValue)
      ) {
        // Recursively merge objects
        result[key] = deepMerge(baseValue as object, overrideValue as object) as T[Extract<keyof T, string>];
      } else if (overrideValue !== undefined) {
        result[key] = overrideValue as T[Extract<keyof T, string>];
      }
    }
  }

  return result;
}

/**
 * Apply console overrides to a tool definition
 */
export function applyToolOverrides(
  tool: InteractiveTool,
  overrides?: ToolOverrides
): InteractiveTool {
  if (!overrides) return tool;

  return {
    ...tool,
    visual: deepMerge(tool.visual, overrides.visual || {}),
    physics: deepMerge(tool.physics, overrides.physics || {}),
    feedback: deepMerge(tool.feedback, overrides.feedback || {}),
    constraints: tool.constraints || overrides.constraints
      ? deepMerge(tool.constraints || {}, overrides.constraints || {})
      : undefined,
  };
}

/**
 * Get a tool by ID with console overrides applied
 */
export function getToolWithOverrides(toolId: string): InteractiveTool | undefined {
  const baseTool = getTool(toolId);
  if (!baseTool) return undefined;

  const overrides = useToolConfigStore.getState().getOverrides(toolId);
  return applyToolOverrides(baseTool, overrides);
}

/**
 * Create a tool instance with both explicit overrides and console overrides applied
 * Console overrides take precedence over explicit overrides
 */
export function createToolInstanceWithOverrides(
  toolId: string,
  explicitOverrides?: Partial<InteractiveTool>
): InteractiveTool | null {
  // First create base instance with explicit overrides
  const baseInstance = createToolInstance(toolId, explicitOverrides);
  if (!baseInstance) return null;

  // Then apply console overrides on top
  const consoleOverrides = useToolConfigStore.getState().getOverrides(toolId);
  return applyToolOverrides(baseInstance, consoleOverrides);
}
