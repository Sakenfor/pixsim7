/**
 * Canonical Gizmo and Tool Registry
 * Single source of truth for all registered gizmos and interactive tools
 * Pure TypeScript - no React/DOM dependencies
 */

import type { GizmoDefinition } from './core';
import type { InteractiveTool } from './tools';

// ============================================================================
// Registry Storage
// ============================================================================

const gizmos = new Map<string, GizmoDefinition>();
const tools = new Map<string, InteractiveTool>();
const categories = new Map<string, Set<string>>();

// ============================================================================
// Gizmo Registry Functions
// ============================================================================

/**
 * Register a gizmo definition
 */
export function registerGizmo(def: GizmoDefinition): void {
  gizmos.set(def.id, def);

  if (!categories.has(def.category)) {
    categories.set(def.category, new Set());
  }
  categories.get(def.category)!.add(def.id);

  // Logging disabled by default (enable in dev tools if needed)
  // console.log(`[GizmoRegistry] Registered gizmo: ${def.name} (${def.id})`);
}

/**
 * Get a gizmo definition by ID
 */
export function getGizmo(id: string): GizmoDefinition | undefined {
  return gizmos.get(id);
}

/**
 * Get all gizmos in a category
 */
export function getGizmosByCategory(category: string): GizmoDefinition[] {
  const ids = categories.get(category) || new Set();
  return Array.from(ids)
    .map(id => gizmos.get(id))
    .filter((g): g is GizmoDefinition => g !== undefined);
}

/**
 * Get all registered gizmos
 */
export function getAllGizmos(): GizmoDefinition[] {
  return Array.from(gizmos.values());
}

// ============================================================================
// Tool Registry Functions
// ============================================================================

/**
 * Register an interactive tool
 */
export function registerTool(tool: InteractiveTool): void {
  tools.set(tool.id, tool);

  // Logging disabled by default (enable in dev tools if needed)
  // console.log(`[GizmoRegistry] Registered tool: ${tool.type} (${tool.id})`);
}

/**
 * Get a tool definition by ID
 */
export function getTool(id: string): InteractiveTool | undefined {
  return tools.get(id);
}

/**
 * Get all tools of a specific type
 */
export function getToolsByType(type: string): InteractiveTool[] {
  return Array.from(tools.values()).filter(tool => tool.type === type);
}

/**
 * Get all registered tools
 */
export function getAllTools(): InteractiveTool[] {
  return Array.from(tools.values());
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a tool instance with overrides
 */
export function createToolInstance(
  toolId: string,
  overrides?: Partial<InteractiveTool>
): InteractiveTool | null {
  const tool = getTool(toolId);
  if (!tool) return null;

  return {
    ...tool,
    ...overrides,
    visual: { ...tool.visual, ...overrides?.visual },
    physics: { ...tool.physics, ...overrides?.physics },
    feedback: { ...tool.feedback, ...overrides?.feedback },
  };
}

/**
 * Clear all registered gizmos and tools (useful for testing)
 */
export function clearRegistry(): void {
  gizmos.clear();
  tools.clear();
  categories.clear();
}
