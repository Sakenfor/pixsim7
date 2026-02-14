/**
 * useToolWithOverrides
 *
 * Hook that provides tools with console overrides applied.
 * Use this instead of direct getTool/createToolInstance calls
 * to get tools that respect console parameter adjustments.
 */

import { createToolInstance, getAllTools, getTool, type InteractiveTool } from '@pixsim7/interaction.gizmos';
import { useMemo } from 'react';

import { applyToolOverrides } from '../lib/core/toolOverrides';
import { useToolConfigStore } from '../stores/toolConfigStore';

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

  return useMemo(() => {
    const tools = getAllTools() as InteractiveTool[];
    return tools.map((tool) => {
      const overrides = allOverrides[tool.id];
      return overrides ? applyToolOverrides(tool, overrides) : tool;
    });
  }, [allOverrides]);
}
