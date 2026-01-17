/**
 * Arc Graph Utilities
 *
 * Helper functions for working with arc graphs, similar to graphSync for scene graphs.
 */

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
 */
export function validateArcGraph(graph: ArcGraph): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for duplicate node IDs
  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node ID: ${node.id}`);
    }
    nodeIds.add(node.id);
  }

  // Check for invalid edge references
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from)) {
      errors.push(`Edge ${edge.id} references non-existent source node: ${edge.from}`);
    }
    if (!nodeIds.has(edge.to)) {
      errors.push(`Edge ${edge.id} references non-existent target node: ${edge.to}`);
    }
  }

  // Check for duplicate edge IDs
  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      errors.push(`Duplicate edge ID: ${edge.id}`);
    }
    edgeIds.add(edge.id);
  }

  // Check start node exists if specified
  if (graph.startNodeId && !nodeIds.has(graph.startNodeId)) {
    errors.push(`Start node ${graph.startNodeId} does not exist`);
  }

  return {
    valid: errors.length === 0,
    errors,
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
