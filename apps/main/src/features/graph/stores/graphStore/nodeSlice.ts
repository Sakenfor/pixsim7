import { addNode as addNodeUtil, updateNode as updateNodeUtil, removeNodeWithEdges } from '@pixsim7/shared.graph.utilities';

import type { StateCreator, NodeManagementState, GraphState } from './types';

/**
 * Node Management Slice
 *
 * Handles node operations on the current scene:
 * add, update, remove, connect, set start node
 */
export const createNodeSlice: StateCreator<NodeManagementState> = (set) => ({
  addNode: (node) => {
    set(
      (state) => {
        if (!state.currentSceneId) {
          console.warn('[nodeSlice] No current scene to add node to');
          return state;
        }

        const scene = state.scenes[state.currentSceneId];
        if (!scene) return state;

        const updatedScene = addNodeUtil(scene, node);

        return {
          scenes: {
            ...state.scenes,
            [state.currentSceneId]: {
              ...updatedScene,
              startNodeId: scene.startNodeId || node.id,
            },
          },
        };
      },
      false,
      'addNode'
    );
  },

  updateNode: (id, patch) => {
    set(
      (state) => {
        if (!state.currentSceneId) return state;

        const scene = state.scenes[state.currentSceneId];
        if (!scene) return state;

        const updatedScene = updateNodeUtil(scene, id, patch);

        return {
          scenes: {
            ...state.scenes,
            [state.currentSceneId]: updatedScene,
          },
        } as Partial<GraphState>;
      },
      false,
      'updateNode'
    );
  },

  removeNode: (id) => {
    set(
      (state) => {
        if (!state.currentSceneId) return state;

        const scene = state.scenes[state.currentSceneId];
        if (!scene) return state;

        const updatedScene = removeNodeWithEdges(scene, id);

        return {
          scenes: {
            ...state.scenes,
            [state.currentSceneId]: {
              ...updatedScene,
              startNodeId: scene.startNodeId === id ? updatedScene.nodes[0]?.id : scene.startNodeId,
            },
          },
        };
      },
      false,
      'removeNode'
    );
  },

  connectNodes: (fromId, toId, meta) => {
    set(
      (state) => {
        if (!state.currentSceneId) return state;

        const scene = state.scenes[state.currentSceneId];
        if (!scene) return state;

        const fromNode = scene.nodes.find((n) => n.id === fromId);
        if (!fromNode) {
          console.warn(`[nodeSlice] Source node not found: ${fromId}`);
          return state;
        }

        const toNode = scene.nodes.find((n) => n.id === toId);
        if (!toNode) {
          console.warn(`[nodeSlice] Target node not found: ${toId}`);
          return state;
        }

        const edgeId = `${fromId}_${toId}_${meta?.fromPort || 'default'}`;
        const existingEdge = scene.edges.find((e) => e.id === edgeId);

        if (existingEdge) {
          console.info(`[nodeSlice] Edge already exists: ${edgeId}`);
          return state;
        }

        return {
          scenes: {
            ...state.scenes,
            [state.currentSceneId]: {
              ...scene,
              edges: [...scene.edges, { id: edgeId, from: fromId, to: toId, meta }],
              updatedAt: new Date().toISOString(),
            },
          },
        };
      },
      false,
      'connectNodes'
    );
  },

  attachEdgeMeta: (edgeId, metaPatch) => {
    set(
      (state) => {
        if (!state.currentSceneId) return state;

        const scene = state.scenes[state.currentSceneId];
        if (!scene) return state;

        const edgeExists = scene.edges.some((e) => e.id === edgeId);
        if (!edgeExists) {
          console.warn(`[nodeSlice] Edge not found: ${edgeId}`);
          return state;
        }

        return {
          scenes: {
            ...state.scenes,
            [state.currentSceneId]: {
              ...scene,
              edges: scene.edges.map((e) =>
                e.id === edgeId ? { ...e, meta: { ...e.meta, ...metaPatch } } : e
              ),
              updatedAt: new Date().toISOString(),
            },
          },
        };
      },
      false,
      'attachEdgeMeta'
    );
  },

  setStartNode: (id) => {
    set(
      (state) => {
        if (!state.currentSceneId) return state;

        const scene = state.scenes[state.currentSceneId];
        if (!scene) return state;

        const nodeExists = scene.nodes.some((n) => n.id === id);
        if (!nodeExists) {
          console.warn(`[nodeSlice] Node not found: ${id}`);
          return state;
        }

        return {
          scenes: {
            ...state.scenes,
            [state.currentSceneId]: {
              ...scene,
              startNodeId: id,
              updatedAt: new Date().toISOString(),
            },
          },
        };
      },
      false,
      'setStartNode'
    );
  },
});
