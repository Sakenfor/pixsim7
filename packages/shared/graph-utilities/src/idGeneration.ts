/**
 * ID generation utilities for graphs, nodes, and edges
 *
 * Provides consistent ID generation patterns across different graph types.
 */

/**
 * Generate a unique ID with a prefix
 *
 * @param prefix - Prefix for the ID (e.g., 'scene', 'arc', 'node')
 * @returns Unique ID in format: {prefix}_{timestamp}_{random}
 *
 * @example
 * generateId('scene') // => "scene_1704067200000_x7k9m"
 */
export function generateId(prefix: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Generate a graph ID
 */
export function generateGraphId(graphType: string): string {
  return generateId(graphType);
}

/**
 * Generate a node ID
 */
export function generateNodeId(nodeType?: string): string {
  return generateId(nodeType || 'node');
}

/**
 * Generate an edge ID
 */
export function generateEdgeId(from: string, to: string): string {
  return `edge_${from}_${to}_${Date.now()}`;
}

/**
 * Generate a simple edge ID without node references
 */
export function generateSimpleEdgeId(): string {
  return generateId('edge');
}

/**
 * Extract prefix from an ID
 *
 * @example
 * extractPrefix('scene_1704067200000_x7k9m') // => "scene"
 */
export function extractPrefix(id: string): string | null {
  const match = id.match(/^([^_]+)_/);
  return match ? match[1] : null;
}

/**
 * Check if an ID matches a prefix
 */
export function hasPrefix(id: string, prefix: string): boolean {
  return id.startsWith(`${prefix}_`);
}
