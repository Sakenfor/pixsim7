/**
 * useToolWithOverrides
 *
 * Hook that provides tools with console overrides applied.
 * Use this instead of direct getTool/createToolInstance calls
 * to get tools that respect console parameter adjustments.
 */

import { useMemo } from 'react';
import { getTool, createToolInstance, type InteractiveTool } from '@pixsim/scene-gizmos';
import { useToolConfigStore, type ToolOverrides } from '@/stores/toolConfigStore';

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
export function applyToolOverrides(tool: InteractiveTool, overrides?: ToolOverrides): InteractiveTool {
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

/**
 * React hook to get a tool with console overrides applied
 * Reactively updates when console overrides change
 */
export function useToolWithOverrides(toolId: string): InteractiveTool | undefined {
  const overrides = useToolConfigStore((state) => state.overrides[toolId]);

  return useMemo(() => {
    const baseTool = getTool(toolId);
    if (!baseTool) return undefined;
    return applyToolOverrides(baseTool, overrides);
  }, [toolId, overrides]);
}

/**
 * React hook to create a tool instance with all overrides applied
 * Reactively updates when console overrides change
 */
export function useToolInstanceWithOverrides(
  toolId: string,
  explicitOverrides?: Partial<InteractiveTool>
): InteractiveTool | null {
  const consoleOverrides = useToolConfigStore((state) => state.overrides[toolId]);

  return useMemo(() => {
    const baseInstance = createToolInstance(toolId, explicitOverrides);
    if (!baseInstance) return null;
    return applyToolOverrides(baseInstance, consoleOverrides);
  }, [toolId, explicitOverrides, consoleOverrides]);
}

/**
 * Hook to check if a tool has any console overrides
 */
export function useToolHasOverrides(toolId: string): boolean {
  return useToolConfigStore((state) => !!state.overrides[toolId]);
}

/**
 * Hook to get all tools with their console overrides applied
 */
export function useAllToolsWithOverrides(): InteractiveTool[] {
  const allOverrides = useToolConfigStore((state) => state.overrides);
  const { getAllTools } = require('@pixsim/scene-gizmos');

  return useMemo(() => {
    const tools = getAllTools() as InteractiveTool[];
    return tools.map((tool) => {
      const overrides = allOverrides[tool.id];
      return overrides ? applyToolOverrides(tool, overrides) : tool;
    });
  }, [allOverrides]);
}
