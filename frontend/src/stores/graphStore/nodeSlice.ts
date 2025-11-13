import type { StateCreator, NodeManagementState, GraphState } from './types';
import type { DraftSceneNode } from '../../modules/scene-builder';

/**
 * Node Management Slice
 *
 * Handles node operations on the current scene:
 * add, update, remove, connect, set start node
 */
export const createNodeSlice: StateCreator<NodeManagementState> = (set, _get, _api) => ({
  addNode: (node) => {
    set(
      (state) => {
        if (!state.currentSceneId) {
          console.warn('[nodeSlice] No current scene to add node to');
          return state;
        }

        const scene = state.scenes[state.currentSceneId];
        if (!scene) return state;

        return {
          scenes: {
            ...state.scenes,
            [state.currentSceneId]: {
              ...scene,
              nodes: [...scene.nodes, node],
              startNodeId: scene.startNodeId || node.id,
              updatedAt: new Date().toISOString(),
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
              nodes: scene.nodes.map((n) => (n.id === id ? { ...n, ...patch } as DraftSceneNode : n)),
              updatedAt: new Date().toISOString(),
            },
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

        const nodes = scene.nodes.filter((n) => n.id !== id);
        const edges = scene.edges.filter((e) => e.from !== id && e.to !== id);

        return {
          scenes: {
            ...state.scenes,
            [state.currentSceneId]: {
              ...scene,
              nodes,
              edges,
              startNodeId: scene.startNodeId === id ? nodes[0]?.id : scene.startNodeId,
              updatedAt: new Date().toISOString(),
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

        const edgeId = `${fromId}_${toId}_${meta?.fromPort || 'default'}`;
        const existingEdge = scene.edges.find((e) => e.id === edgeId);

        if (existingEdge) {
          console.info(`[nodeSlice] Edge already exists: ${edgeId}`);
          return state;
        }

        // Update node.connections for backward compatibility
        const updatedFromNode = {
          ...fromNode,
          connections: Array.from(new Set([...(fromNode.connections || []), toId])),
        };

        return {
          scenes: {
            ...state.scenes,
            [state.currentSceneId]: {
              ...scene,
              nodes: scene.nodes.map((n) => (n.id === fromId ? updatedFromNode : n)),
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
