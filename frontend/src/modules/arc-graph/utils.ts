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
 * Add a node to an arc graph
 */
export function addNodeToGraph(graph: ArcGraph, node: ArcGraphNode): ArcGraph {
  return {
    ...graph,
    nodes: [...graph.nodes, node],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Update a node in an arc graph
 */
export function updateNodeInGraph(
  graph: ArcGraph,
  nodeId: string,
  updates: Partial<ArcGraphNode>
): ArcGraph {
  return {
    ...graph,
    nodes: graph.nodes.map(node =>
      node.id === nodeId ? { ...node, ...updates } : node
    ),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Remove a node from an arc graph
 */
export function removeNodeFromGraph(graph: ArcGraph, nodeId: string): ArcGraph {
  return {
    ...graph,
    nodes: graph.nodes.filter(node => node.id !== nodeId),
    edges: graph.edges.filter(edge => edge.from !== nodeId && edge.to !== nodeId),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Add an edge to an arc graph
 */
export function addEdgeToGraph(graph: ArcGraph, edge: ArcGraphEdge): ArcGraph {
  return {
    ...graph,
    edges: [...graph.edges, edge],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Remove an edge from an arc graph
 */
export function removeEdgeFromGraph(graph: ArcGraph, edgeId: string): ArcGraph {
  return {
    ...graph,
    edges: graph.edges.filter(edge => edge.id !== edgeId),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Get all edges connected to a node
 */
export function getNodeEdges(graph: ArcGraph, nodeId: string): ArcGraphEdge[] {
  return graph.edges.filter(edge => edge.from === nodeId || edge.to === nodeId);
}

/**
 * Get incoming edges for a node
 */
export function getIncomingEdges(graph: ArcGraph, nodeId: string): ArcGraphEdge[] {
  return graph.edges.filter(edge => edge.to === nodeId);
}

/**
 * Get outgoing edges for a node
 */
export function getOutgoingEdges(graph: ArcGraph, nodeId: string): ArcGraphEdge[] {
  return graph.edges.filter(edge => edge.from === nodeId);
}

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
