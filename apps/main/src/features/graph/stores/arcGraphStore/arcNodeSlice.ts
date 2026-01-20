import {
  addNode,
  updateNode,
  removeNodeWithEdges,
  addEdge,
  removeEdge,
  findNode,
} from '@pixsim7/shared.graph.utilities';
import { useToastStore } from '@pixsim7/shared.ui';

import { validateArcGraphReferences, type ArcGraphEdge, type ArcGraphNode } from '@features/graph/models/arcGraph';

import { useGraphStore } from '../graphStore';

import type { ArcStateCreator, ArcNodeManagementState } from './types';

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

    // Validate scene reference if present
    if (node.type !== 'arc_group' && node.sceneId) {
      const sceneIds = useGraphStore.getState().getSceneIds();
      const updatedGraph = addNode(graph, node);
      const issues = validateArcGraphReferences(updatedGraph, sceneIds);

      const errors = issues.filter(i => i.severity === 'error');
      if (errors.length > 0) {
        useToastStore.getState().addToast({
          type: 'warning',
          message: `Scene reference may be invalid: ${node.sceneId}`,
          duration: 5000,
        });
        // Allow with warning, don't block
      }
    }

    const updatedGraph = addNode(graph, node);

    set((state) => ({
      arcGraphs: {
        ...state.arcGraphs,
        [currentArcGraphId]: updatedGraph,
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

    // Validate scene reference if sceneId is being updated
    if ('sceneId' in patch && patch.sceneId) {
      const sceneIds = useGraphStore.getState().getSceneIds();
      const updatedGraph = updateNode(graph, id, patch);
      const issues = validateArcGraphReferences(updatedGraph, sceneIds);

      const errors = issues.filter(i => i.severity === 'error');
      if (errors.length > 0) {
        useToastStore.getState().addToast({
          type: 'warning',
          message: `Scene reference may be invalid: ${patch.sceneId}`,
          duration: 5000,
        });
        // Allow with warning, don't block
      }
    }

    const updatedGraph = updateNode(graph, id, patch);

    set((state) => ({
      arcGraphs: {
        ...state.arcGraphs,
        [currentArcGraphId]: updatedGraph,
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

    const updatedGraph = removeNodeWithEdges(graph, id);

    set((state) => ({
      arcGraphs: {
        ...state.arcGraphs,
        [currentArcGraphId]: {
          ...updatedGraph,
          startNodeId: graph.startNodeId === id ? undefined : graph.startNodeId,
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

    const updatedGraph = addEdge(graph, edge);

    set((state) => ({
      arcGraphs: {
        ...state.arcGraphs,
        [currentArcGraphId]: updatedGraph,
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

    const updatedGraph = removeEdge(graph, edgeId);

    set((state) => ({
      arcGraphs: {
        ...state.arcGraphs,
        [currentArcGraphId]: updatedGraph,
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

    return findNode(graph.nodes, id) || null;
  },
});

