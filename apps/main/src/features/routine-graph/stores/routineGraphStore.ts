/**
 * Routine Graph Store
 *
 * Zustand store for routine graph data.
 * Uses shared infrastructure:
 * - createTemporalStore for undo/redo
 * - @pixsim7/shared.graph.utilities for CRUD operations
 *
 * Selection state is in a separate store (selectionStore.ts)
 */

import {
  addNode as addNodeUtil,
  updateNode as updateNodeUtil,
  removeNodeWithEdges as removeNodeWithEdgesUtil,
  addEdge as addEdgeUtil,
  removeEdge as removeEdgeUtil,
  findNode,
  findEdgeByNodes,
  generateNodeId,
  generateSimpleEdgeId,
  generateGraphId,
  addGraphToCollection,
  updateGraphInCollection,
  removeGraphFromCollection,
  listGraphs,
} from '@pixsim7/shared.graph.utilities';
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';


import { createTemporalStore } from '@/stores/_shared/temporal';

import type { RoutineGraph, RoutineNode, RoutineEdge, RoutineNodeType } from '../types';

// ============================================================================
// State Interface (Data Only - no UI state)
// ============================================================================

interface RoutineGraphDataState {
  // Graph collection (multiple graphs per world)
  graphs: Record<string, RoutineGraph>;

  // Current graph being edited
  currentGraphId: string | null;

  // Current world context
  worldId: string | null;

  // Persistence state
  isDirty: boolean;
  lastSavedAt: number | null;
}

interface RoutineGraphActions {
  // World context
  setWorldId: (worldId: string | null) => void;
  loadGraphs: (graphs: Record<string, RoutineGraph>) => void;

  // Graph CRUD
  setCurrentGraph: (graphId: string | null) => void;
  createGraph: (name: string) => string;
  updateGraph: (graphId: string, patch: Partial<RoutineGraph>) => void;
  deleteGraph: (graphId: string) => void;
  duplicateGraph: (graphId: string) => string | null;

  // Node CRUD (uses shared utilities)
  addNode: (node: RoutineNode) => void;
  updateNode: (nodeId: string, patch: Partial<RoutineNode>) => void;
  removeNode: (nodeId: string) => void;
  addNodeOfType: (type: RoutineNodeType, position: { x: number; y: number }) => string | null;

  // Edge CRUD (uses shared utilities)
  addEdge: (edge: RoutineEdge) => void;
  updateEdge: (edgeId: string, patch: Partial<RoutineEdge>) => void;
  removeEdge: (edgeId: string) => void;
  connectNodes: (fromId: string, toId: string) => string | null;

  // State management
  markDirty: () => void;
  markSaved: () => void;
  reset: () => void;
}

export type RoutineGraphState = RoutineGraphDataState & RoutineGraphActions;

// ============================================================================
// Default Node Factories
// ============================================================================

function createDefaultNode(
  type: RoutineNodeType,
  position: { x: number; y: number }
): RoutineNode {
  const id = generateNodeId(type);

  const base: RoutineNode = {
    id,
    nodeType: type,
    position,
    preferredActivities: [],
  };

  switch (type) {
    case 'time_slot':
      return {
        ...base,
        label: 'New Time Slot',
        timeRangeSeconds: { start: 32400, end: 43200 }, // 9am-12pm
      };
    case 'decision':
      return {
        ...base,
        label: 'New Decision',
        decisionConditions: [],
      };
    case 'activity':
      return {
        ...base,
        label: 'New Activity',
      };
    default:
      return base;
  }
}

function createDefaultGraph(name: string): RoutineGraph {
  return {
    id: generateGraphId('routine'),
    version: 1,
    name,
    nodes: [],
    edges: [],
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Partialize Function (exclude UI state from undo/redo)
// ============================================================================

function routineGraphPartialize(state: RoutineGraphState): Partial<RoutineGraphDataState> {
  // Only track data state, not actions or transient state
  return {
    graphs: state.graphs,
    currentGraphId: state.currentGraphId,
    worldId: state.worldId,
    // Exclude: isDirty, lastSavedAt (transient)
  };
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useRoutineGraphStore = create<RoutineGraphState>()(
  devtools(
    persist(
      createTemporalStore(
        (set, get) => ({
          // Initial state
          graphs: {},
          currentGraphId: null,
          worldId: null,
          isDirty: false,
          lastSavedAt: null,

          // ================================================================
          // World Context
          // ================================================================

          setWorldId: (worldId) => set({
            worldId,
            currentGraphId: null,
            graphs: {},
          }, false, 'setWorldId'),

          loadGraphs: (graphs) => set({
            graphs,
          }, false, 'loadGraphs'),

          // ================================================================
          // Graph CRUD
          // ================================================================

          setCurrentGraph: (graphId) => set({
            currentGraphId: graphId,
          }, false, 'setCurrentGraph'),

          createGraph: (name) => {
            const graph = createDefaultGraph(name);
            set((state) => ({
              graphs: addGraphToCollection(state.graphs, graph),
              currentGraphId: graph.id,
              isDirty: true,
            }), false, 'createGraph');
            return graph.id;
          },

          updateGraph: (graphId, patch) => {
            set((state) => ({
              graphs: updateGraphInCollection(state.graphs, graphId, patch),
              isDirty: true,
            }), false, 'updateGraph');
          },

          deleteGraph: (graphId) => {
            set((state) => ({
              graphs: removeGraphFromCollection(state.graphs, graphId),
              currentGraphId: state.currentGraphId === graphId ? null : state.currentGraphId,
              isDirty: true,
            }), false, 'deleteGraph');
          },

          duplicateGraph: (graphId) => {
            const { graphs } = get();
            const source = graphs[graphId];
            if (!source) return null;

            const newGraph: RoutineGraph = {
              ...source,
              id: generateGraphId('routine'),
              name: `${source.name} (copy)`,
              updatedAt: new Date().toISOString(),
            };

            set((state) => ({
              graphs: addGraphToCollection(state.graphs, newGraph),
              currentGraphId: newGraph.id,
              isDirty: true,
            }), false, 'duplicateGraph');

            return newGraph.id;
          },

          // ================================================================
          // Node CRUD (using shared utilities)
          // ================================================================

          addNode: (node) => {
            const { currentGraphId, graphs } = get();
            if (!currentGraphId) return;

            const graph = graphs[currentGraphId];
            if (!graph) return;

            const updated = addNodeUtil(graph, node);
            set((state) => ({
              graphs: { ...state.graphs, [currentGraphId]: updated },
              isDirty: true,
            }), false, 'addNode');
          },

          updateNode: (nodeId, patch) => {
            const { currentGraphId, graphs } = get();
            if (!currentGraphId) return;

            const graph = graphs[currentGraphId];
            if (!graph) return;

            const updated = updateNodeUtil(graph, nodeId, patch);
            set((state) => ({
              graphs: { ...state.graphs, [currentGraphId]: updated },
              isDirty: true,
            }), false, 'updateNode');
          },

          removeNode: (nodeId) => {
            const { currentGraphId, graphs } = get();
            if (!currentGraphId) return;

            const graph = graphs[currentGraphId];
            if (!graph) return;

            const updated = removeNodeWithEdgesUtil(graph, nodeId);
            set((state) => ({
              graphs: { ...state.graphs, [currentGraphId]: updated },
              isDirty: true,
            }), false, 'removeNode');
          },

          addNodeOfType: (type, position) => {
            const { currentGraphId } = get();
            if (!currentGraphId) return null;

            const node = createDefaultNode(type, position);
            get().addNode(node);
            return node.id;
          },

          // ================================================================
          // Edge CRUD (using shared utilities)
          // ================================================================

          addEdge: (edge) => {
            const { currentGraphId, graphs } = get();
            if (!currentGraphId) return;

            const graph = graphs[currentGraphId];
            if (!graph) return;

            // Check for duplicate
            const existing = findEdgeByNodes(graph.edges, edge.from, edge.to);
            if (existing) return;

            const updated = addEdgeUtil(graph, edge);
            set((state) => ({
              graphs: { ...state.graphs, [currentGraphId]: updated },
              isDirty: true,
            }), false, 'addEdge');
          },

          updateEdge: (edgeId, patch) => {
            const { currentGraphId, graphs } = get();
            if (!currentGraphId) return;

            const graph = graphs[currentGraphId];
            if (!graph) return;

            const updated = {
              ...graph,
              edges: graph.edges.map((e) =>
                e.id === edgeId ? { ...e, ...patch } : e
              ),
              updatedAt: new Date().toISOString(),
            };

            set((state) => ({
              graphs: { ...state.graphs, [currentGraphId]: updated },
              isDirty: true,
            }), false, 'updateEdge');
          },

          removeEdge: (edgeId) => {
            const { currentGraphId, graphs } = get();
            if (!currentGraphId) return;

            const graph = graphs[currentGraphId];
            if (!graph) return;

            const updated = removeEdgeUtil(graph, edgeId);
            set((state) => ({
              graphs: { ...state.graphs, [currentGraphId]: updated },
              isDirty: true,
            }), false, 'removeEdge');
          },

          connectNodes: (fromId, toId) => {
            const { currentGraphId, graphs } = get();
            if (!currentGraphId) return null;

            const graph = graphs[currentGraphId];
            if (!graph) return null;

            // Validate nodes exist
            const fromNode = findNode(graph.nodes, fromId);
            const toNode = findNode(graph.nodes, toId);
            if (!fromNode || !toNode) return null;

            // Check for duplicate
            const existing = findEdgeByNodes(graph.edges, fromId, toId);
            if (existing) return existing.id;

            const edge: RoutineEdge = {
              id: generateSimpleEdgeId(),
              from: fromId,
              to: toId,
              weight: 1.0,
            };

            get().addEdge(edge);
            return edge.id;
          },

          // ================================================================
          // State Management
          // ================================================================

          markDirty: () => set({ isDirty: true }, false, 'markDirty'),

          markSaved: () => set({
            isDirty: false,
            lastSavedAt: Date.now(),
          }, false, 'markSaved'),

          reset: () => set({
            graphs: {},
            currentGraphId: null,
            worldId: null,
            isDirty: false,
            lastSavedAt: null,
          }, false, 'reset'),
        }),
        {
          limit: 50,
          partialize: routineGraphPartialize,
        }
      ),
      {
        name: 'routine-graph-store',
        partialize: (state) => ({
          graphs: state.graphs,
          worldId: state.worldId,
          currentGraphId: state.currentGraphId,
        }),
      }
    ),
    { name: 'RoutineGraphStore' }
  )
);

// ============================================================================
// Selectors
// ============================================================================

export const routineGraphSelectors = {
  currentGraph: (state: RoutineGraphState): RoutineGraph | null => {
    if (!state.currentGraphId) return null;
    return state.graphs[state.currentGraphId] ?? null;
  },

  graphList: (state: RoutineGraphState): RoutineGraph[] => {
    return listGraphs(state.graphs);
  },

  nodeById: (nodeId: string) => (state: RoutineGraphState): RoutineNode | null => {
    const graph = routineGraphSelectors.currentGraph(state);
    if (!graph) return null;
    return findNode(graph.nodes, nodeId) ?? null;
  },

  edgeById: (edgeId: string) => (state: RoutineGraphState): RoutineEdge | null => {
    const graph = routineGraphSelectors.currentGraph(state);
    if (!graph) return null;
    return graph.edges.find((e) => e.id === edgeId) ?? null;
  },

  isDirty: (state: RoutineGraphState): boolean => state.isDirty,

  canUndo: (): boolean => {
    const temporal = useRoutineGraphStore.temporal?.getState();
    return (temporal?.pastStates?.length ?? 0) > 0;
  },

  canRedo: (): boolean => {
    const temporal = useRoutineGraphStore.temporal?.getState();
    return (temporal?.futureStates?.length ?? 0) > 0;
  },
};

// ============================================================================
// Temporal Actions (Undo/Redo)
// ============================================================================

export const useRoutineGraphUndo = () => useRoutineGraphStore.temporal?.getState().undo;
export const useRoutineGraphRedo = () => useRoutineGraphStore.temporal?.getState().redo;
