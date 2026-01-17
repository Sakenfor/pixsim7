/**
 * Graph collection management utilities
 *
 * Helpers for managing collections of graphs (e.g., multiple scenes, multiple arc graphs)
 */

export interface GraphWithId {
  id: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

/**
 * Add a graph to a collection
 */
export function addGraphToCollection<TGraph extends GraphWithId>(
  collection: Record<string, TGraph>,
  graph: TGraph
): Record<string, TGraph> {
  return {
    ...collection,
    [graph.id]: graph,
  };
}

/**
 * Remove a graph from a collection
 */
export function removeGraphFromCollection<TGraph extends GraphWithId>(
  collection: Record<string, TGraph>,
  graphId: string
): Record<string, TGraph> {
  const { [graphId]: removed, ...rest } = collection;
  return rest;
}

/**
 * Update a graph in a collection
 */
export function updateGraphInCollection<TGraph extends GraphWithId>(
  collection: Record<string, TGraph>,
  graphId: string,
  patch: Partial<TGraph>
): Record<string, TGraph> {
  const graph = collection[graphId];
  if (!graph) {
    console.warn(`[graph-utilities] Graph not found: ${graphId}`);
    return collection;
  }

  return {
    ...collection,
    [graphId]: {
      ...graph,
      ...patch,
      updatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Duplicate a graph in a collection
 */
export function duplicateGraph<TGraph extends GraphWithId>(
  collection: Record<string, TGraph>,
  graphId: string,
  newId: string,
  newTitle?: string
): Record<string, TGraph> | null {
  const original = collection[graphId];
  if (!original) {
    console.warn(`[graph-utilities] Graph not found for duplication: ${graphId}`);
    return null;
  }

  const duplicate: TGraph = {
    ...original,
    id: newId,
    title: newTitle || `${original.title || 'Untitled'} (Copy)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    ...collection,
    [newId]: duplicate,
  };
}

/**
 * Get a graph from a collection
 */
export function getGraph<TGraph extends GraphWithId>(
  collection: Record<string, TGraph>,
  graphId: string
): TGraph | null {
  return collection[graphId] || null;
}

/**
 * List all graphs in a collection
 */
export function listGraphs<TGraph extends GraphWithId>(
  collection: Record<string, TGraph>
): TGraph[] {
  return Object.values(collection);
}

/**
 * Get all graph IDs in a collection
 */
export function getGraphIds<TGraph extends GraphWithId>(
  collection: Record<string, TGraph>
): string[] {
  return Object.keys(collection);
}

/**
 * Count graphs in a collection
 */
export function countGraphs<TGraph extends GraphWithId>(
  collection: Record<string, TGraph>
): number {
  return Object.keys(collection).length;
}

/**
 * Check if a graph exists in a collection
 */
export function hasGraph<TGraph extends GraphWithId>(
  collection: Record<string, TGraph>,
  graphId: string
): boolean {
  return graphId in collection;
}

/**
 * Rename a graph in a collection
 */
export function renameGraph<TGraph extends GraphWithId>(
  collection: Record<string, TGraph>,
  graphId: string,
  newTitle: string
): Record<string, TGraph> {
  return updateGraphInCollection(collection, graphId, { title: newTitle } as Partial<TGraph>);
}
