import type { ArcStateCreator, ArcNodeManagementState } from './types';
import type { ArcGraphNode, ArcGraphEdge } from '../../modules/arc-graph';
import { useToastStore } from '@pixsim7/ui';

/**
 * Arc Node Management Slice
 * Handles node and edge operations within arc graphs
 */
export const createArcNodeSlice: ArcStateCreator<ArcNodeManagementState> = (set, get) => ({
  addArcNode: (node: ArcGraphNode) => {
    const { currentArcGraphId, arcGraphs } = get();
    if (!currentArcGraphId) {
      const errorMsg = 'No current arc graph selected';
      console.error('[arcNodeSlice]', errorMsg);
      useToastStore.getState().addToast({
        type: 'error',
        message: errorMsg,
        duration: 4000,
      });
      return;
    }

    const graph = arcGraphs[currentArcGraphId];
    if (!graph) {
      const errorMsg = `Arc graph '${currentArcGraphId}' not found`;
      console.error('[arcNodeSlice]', errorMsg);
      useToastStore.getState().addToast({
        type: 'error',
        message: errorMsg,
        duration: 4000,
      });
      return;
    }

    set((state) => ({
      arcGraphs: {
        ...state.arcGraphs,
        [currentArcGraphId]: {
          ...graph,
          nodes: [...graph.nodes, node],
          updatedAt: new Date().toISOString(),
        },
      },
    }), false, 'addArcNode');
  },

  updateArcNode: (id: string, patch: Partial<ArcGraphNode>) => {
    const { currentArcGraphId, arcGraphs } = get();
    if (!currentArcGraphId) {
      const errorMsg = 'No current arc graph selected';
      console.error('[arcNodeSlice]', errorMsg);
      useToastStore.getState().addToast({
        type: 'error',
        message: errorMsg,
        duration: 4000,
      });
      return;
    }

    const graph = arcGraphs[currentArcGraphId];
    if (!graph) {
      const errorMsg = `Arc graph '${currentArcGraphId}' not found`;
      console.error('[arcNodeSlice]', errorMsg);
      useToastStore.getState().addToast({
        type: 'error',
        message: errorMsg,
        duration: 4000,
      });
      return;
    }

    set((state) => ({
      arcGraphs: {
        ...state.arcGraphs,
        [currentArcGraphId]: {
          ...graph,
          nodes: graph.nodes.map((n) =>
            n.id === id ? { ...n, ...patch } : n
          ),
          updatedAt: new Date().toISOString(),
        },
      },
    }), false, 'updateArcNode');
  },

  removeArcNode: (id: string) => {
    const { currentArcGraphId, arcGraphs } = get();
    if (!currentArcGraphId) {
      const errorMsg = 'No current arc graph selected';
      console.error('[arcNodeSlice]', errorMsg);
      useToastStore.getState().addToast({
        type: 'error',
        message: errorMsg,
        duration: 4000,
      });
      return;
    }

    const graph = arcGraphs[currentArcGraphId];
    if (!graph) {
      const errorMsg = `Arc graph '${currentArcGraphId}' not found`;
      console.error('[arcNodeSlice]', errorMsg);
      useToastStore.getState().addToast({
        type: 'error',
        message: errorMsg,
        duration: 4000,
      });
      return;
    }

    set((state) => ({
      arcGraphs: {
        ...state.arcGraphs,
        [currentArcGraphId]: {
          ...graph,
          nodes: graph.nodes.filter((n) => n.id !== id),
          edges: graph.edges.filter((e) => e.from !== id && e.to !== id),
          startNodeId: graph.startNodeId === id ? undefined : graph.startNodeId,
          updatedAt: new Date().toISOString(),
        },
      },
    }), false, 'removeArcNode');
  },

  connectArcNodes: (fromId: string, toId: string, meta?: ArcGraphEdge['meta']) => {
    const { currentArcGraphId, arcGraphs } = get();
    if (!currentArcGraphId) {
      const errorMsg = 'No current arc graph selected';
      console.error('[arcNodeSlice]', errorMsg);
      useToastStore.getState().addToast({
        type: 'error',
        message: errorMsg,
        duration: 4000,
      });
      return;
    }

    const graph = arcGraphs[currentArcGraphId];
    if (!graph) {
      const errorMsg = `Arc graph '${currentArcGraphId}' not found`;
      console.error('[arcNodeSlice]', errorMsg);
      useToastStore.getState().addToast({
        type: 'error',
        message: errorMsg,
        duration: 4000,
      });
      return;
    }

    const edge: ArcGraphEdge = {
      id: crypto.randomUUID(),
      from: fromId,
      to: toId,
      meta,
    };

    set((state) => ({
      arcGraphs: {
        ...state.arcGraphs,
        [currentArcGraphId]: {
          ...graph,
          edges: [...graph.edges, edge],
          updatedAt: new Date().toISOString(),
        },
      },
    }), false, 'connectArcNodes');
  },

  removeArcEdge: (edgeId: string) => {
    const { currentArcGraphId, arcGraphs } = get();
    if (!currentArcGraphId) {
      const errorMsg = 'No current arc graph selected';
      console.error('[arcNodeSlice]', errorMsg);
      useToastStore.getState().addToast({
        type: 'error',
        message: errorMsg,
        duration: 4000,
      });
      return;
    }

    const graph = arcGraphs[currentArcGraphId];
    if (!graph) {
      const errorMsg = `Arc graph '${currentArcGraphId}' not found`;
      console.error('[arcNodeSlice]', errorMsg);
      useToastStore.getState().addToast({
        type: 'error',
        message: errorMsg,
        duration: 4000,
      });
      return;
    }

    set((state) => ({
      arcGraphs: {
        ...state.arcGraphs,
        [currentArcGraphId]: {
          ...graph,
          edges: graph.edges.filter((e) => e.id !== edgeId),
          updatedAt: new Date().toISOString(),
        },
      },
    }), false, 'removeArcEdge');
  },

  setStartArcNode: (id: string) => {
    const { currentArcGraphId, arcGraphs } = get();
    if (!currentArcGraphId) {
      const errorMsg = 'No current arc graph selected';
      console.error('[arcNodeSlice]', errorMsg);
      useToastStore.getState().addToast({
        type: 'error',
        message: errorMsg,
        duration: 4000,
      });
      return;
    }

    const graph = arcGraphs[currentArcGraphId];
    if (!graph) {
      const errorMsg = `Arc graph '${currentArcGraphId}' not found`;
      console.error('[arcNodeSlice]', errorMsg);
      useToastStore.getState().addToast({
        type: 'error',
        message: errorMsg,
        duration: 4000,
      });
      return;
    }

    set((state) => ({
      arcGraphs: {
        ...state.arcGraphs,
        [currentArcGraphId]: {
          ...graph,
          startNodeId: id,
          updatedAt: new Date().toISOString(),
        },
      },
    }), false, 'setStartArcNode');
  },

  getArcNode: (id: string) => {
    const { currentArcGraphId, arcGraphs } = get();
    if (!currentArcGraphId) return null;

    const graph = arcGraphs[currentArcGraphId];
    if (!graph) return null;

    return graph.nodes.find((n) => n.id === id) || null;
  },
});
