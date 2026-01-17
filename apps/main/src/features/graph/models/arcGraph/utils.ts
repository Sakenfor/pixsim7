/**
 * Arc Graph Utilities
 *
 * Helper functions for working with arc graphs, similar to graphSync for scene graphs.
 */

import { validateArcGraph as validateArcGraphComprehensive } from './validation';

import type { ArcGraph, ArcGraphNode, ArcGraphEdge } from './types';

/**
 * Create a new empty arc graph
 */
export function createEmptyArcGraph(title: string): ArcGraph {
  return {
    id: crypto.randomUUID(),
    title,
    nodes: [],
    edges: [],
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * NOTE: Basic CRUD operations (addNode, updateNode, removeNode, addEdge, removeEdge)
 * and edge query utilities (getNodeEdges, getIncomingEdges, getOutgoingEdges) are
 * available in @pixsim7/shared.graph-utilities and should be used instead of
 * arc-specific implementations.
 */

/**
 * Validate arc graph structure
 *
 * NOTE: This is a simplified wrapper around the comprehensive validator from validation.ts.
 * For full validation with scene references and optional quest/character validation,
 * use validateArcGraph from validation.ts directly.
 */
export function validateArcGraph(graph: ArcGraph): { valid: boolean; errors: string[] } {
  // Use comprehensive validator with empty scene set for basic structural validation
  const result = validateArcGraphComprehensive(graph, new Set());

  return {
    valid: result.valid,
    errors: result.errors.map(e => e.message),
  };
}

/**
 * Convert arc graph to JSON for export
 */
export function exportArcGraph(graph: ArcGraph): string {
  return JSON.stringify(graph, null, 2);
}

/**
 * Import arc graph from JSON
 */
export function importArcGraph(json: string): ArcGraph {
  const graph = JSON.parse(json) as ArcGraph;
  const validation = validateArcGraph(graph);
  if (!validation.valid) {
    throw new Error(`Invalid arc graph: ${validation.errors.join(', ')}`);
  }
  return graph;
}
