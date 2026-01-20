/**
 * @pixsim7/shared.graph.utilities
 *
 * Generic graph utilities - pure TypeScript, no framework dependencies.
 *
 * Provides composable helpers for common graph operations without forcing
 * graphs to share a common base structure. Each graph type maintains its
 * unique node/edge types while benefiting from shared CRUD, import/export,
 * and collection management utilities.
 *
 * @example
 * ```ts
 * import { addNode, exportGraph, generateGraphId } from '@pixsim7/shared.graph.utilities';
 *
 * // Works with any graph structure that has nodes array
 * const updatedGraph = addNode(sceneGraph, newNode);
 *
 * // Export any graph type
 * const json = exportGraph(arcGraph);
 *
 * // Generate consistent IDs
 * const id = generateGraphId('scene');
 * ```
 *
 * @packageDocumentation
 */

// CRUD operations
export {
  addNode,
  updateNode,
  removeNode,
  findNode,
  hasNode,
  addEdge,
  removeEdge,
  removeEdgesConnectedToNode,
  removeNodeWithEdges,
  findNodeByType,
  filterNodesByType,
  findEdgeByNodes,
  getNodeEdges,
  getIncomingEdges,
  getOutgoingEdges,
  type NodeWithId,
  type EdgeWithFromTo,
  type GraphWithNodes,
} from './crud';

// Import/Export
export {
  exportGraph,
  exportProject,
  importGraph,
  importProject,
  createBasicValidator,
  type ExportMetadata,
  type ImportOptions,
} from './importExport';

// ID Generation
export {
  generateId,
  generateGraphId,
  generateNodeId,
  generateEdgeId,
  generateSimpleEdgeId,
  extractPrefix,
  hasPrefix,
} from './idGeneration';

// Collection Management
export {
  addGraphToCollection,
  removeGraphFromCollection,
  updateGraphInCollection,
  duplicateGraph,
  getGraph,
  listGraphs,
  getGraphIds,
  countGraphs,
  hasGraph,
  renameGraph,
  type GraphWithId,
} from './collections';
