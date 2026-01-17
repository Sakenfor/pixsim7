/**
 * Generic CRUD operations for graph nodes and edges
 *
 * Pure TypeScript utilities that work with any node/edge types.
 * No assumptions about node structure beyond having an `id` field.
 */

/**
 * Constraint for nodes - must have an id field
 */
export interface NodeWithId {
  id: string;
  [key: string]: any;
}

/**
 * Constraint for edges - must have from/to fields
 */
export interface EdgeWithFromTo {
  from: string;
  to: string;
  [key: string]: any;
}

/**
 * Constraint for graphs - must have nodes array
 */
export interface GraphWithNodes<TNode> {
  nodes: TNode[];
  updatedAt?: string;
  [key: string]: any;
}

/**
 * Add a node to a graph
 */
export function addNode<TNode extends NodeWithId, TGraph extends GraphWithNodes<TNode>>(
  graph: TGraph,
  node: TNode
): TGraph {
  return {
    ...graph,
    nodes: [...graph.nodes, node],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Update a node in a graph
 */
export function updateNode<TNode extends NodeWithId, TGraph extends GraphWithNodes<TNode>>(
  graph: TGraph,
  nodeId: string,
  patch: Partial<TNode>
): TGraph {
  const nodeExists = graph.nodes.some(n => n.id === nodeId);
  if (!nodeExists) {
    console.warn(`[graph-utilities] Node not found: ${nodeId}`);
    return graph;
  }

  return {
    ...graph,
    nodes: graph.nodes.map(n => n.id === nodeId ? { ...n, ...patch } : n),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Remove a node from a graph
 */
export function removeNode<TNode extends NodeWithId, TGraph extends GraphWithNodes<TNode>>(
  graph: TGraph,
  nodeId: string
): TGraph {
  return {
    ...graph,
    nodes: graph.nodes.filter(n => n.id !== nodeId),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Find a node in a graph
 */
export function findNode<TNode extends NodeWithId>(
  nodes: TNode[],
  nodeId: string
): TNode | undefined {
  return nodes.find(n => n.id === nodeId);
}

/**
 * Check if a node exists
 */
export function hasNode<TNode extends NodeWithId>(
  nodes: TNode[],
  nodeId: string
): boolean {
  return nodes.some(n => n.id === nodeId);
}

/**
 * Add an edge to a graph (if graph has edges array)
 */
export function addEdge<
  TEdge extends EdgeWithFromTo,
  TGraph extends { edges: TEdge[]; updatedAt?: string; [key: string]: any }
>(
  graph: TGraph,
  edge: TEdge
): TGraph {
  return {
    ...graph,
    edges: [...graph.edges, edge],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Remove an edge from a graph
 */
export function removeEdge<
  TEdge extends { id: string; [key: string]: any },
  TGraph extends { edges: TEdge[]; updatedAt?: string; [key: string]: any }
>(
  graph: TGraph,
  edgeId: string
): TGraph {
  return {
    ...graph,
    edges: graph.edges.filter(e => e.id !== edgeId),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Remove all edges connected to a node
 */
export function removeEdgesConnectedToNode<
  TEdge extends EdgeWithFromTo,
  TGraph extends { edges: TEdge[]; updatedAt?: string; [key: string]: any }
>(
  graph: TGraph,
  nodeId: string
): TGraph {
  return {
    ...graph,
    edges: graph.edges.filter(e => e.from !== nodeId && e.to !== nodeId),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Remove node and all connected edges
 */
export function removeNodeWithEdges<
  TNode extends NodeWithId,
  TEdge extends EdgeWithFromTo,
  TGraph extends GraphWithNodes<TNode> & { edges: TEdge[] }
>(
  graph: TGraph,
  nodeId: string
): TGraph {
  return {
    ...graph,
    nodes: graph.nodes.filter(n => n.id !== nodeId),
    edges: graph.edges.filter(e => e.from !== nodeId && e.to !== nodeId),
    updatedAt: new Date().toISOString(),
  };
}
