import {
  generateGraphId,
  removeGraphFromCollection,
  duplicateGraph,
  renameGraph,
  getGraph,
  listGraphs,
  getGraphIds,
} from '@pixsim7/shared.graph.utilities';

import type { DraftScene } from '@domain/sceneBuilder';

import type { StateCreator, SceneManagementState } from './types';

/**
 * Scene Management Slice
 *
 * Handles scene CRUD operations: create, delete, duplicate, load, rename
 */
export const createSceneSlice: StateCreator<SceneManagementState> = (set, get) => ({
  scenes: {},
  currentSceneId: null,
  sceneMetadata: {},

  createScene: (title, options = {}) => {
    const sceneId = generateGraphId('scene');
    const now = new Date().toISOString();

    const newScene: DraftScene = {
      id: sceneId,
      title,
      nodes: [],
      edges: [],
      version: 1,
      metadata: {},
      createdAt: now,
      updatedAt: now,
      signature: options.isReusable
        ? {
            parameters: [],
            returnPoints: [],
            isReusable: true,
            description: '',
            tags: [],
            version: 1,
            ...options.signature,
          }
        : undefined,
    };

    set(
      (state) => ({
        scenes: {
          ...state.scenes,
          [sceneId]: newScene,
        },
        currentSceneId: sceneId,
        sceneMetadata: {
          ...state.sceneMetadata,
          [sceneId]: {
            id: sceneId,
            title,
            description: options.signature?.description,
            tags: options.signature?.tags || [],
            isReusable: options.isReusable || false,
            referencedBy: [],
            nodeCount: 0,
            callCount: 0,
            createdAt: now,
            updatedAt: now,
          },
        },
      }),
      false,
      'createScene'
    );

    return sceneId;
  },

  deleteScene: (sceneId) => {
    set((state) => {
      // Safety check: Don't delete if referenced
      const callers = Object.values(state.scenes).filter((scene) =>
        scene.nodes.some((n) => n.type === 'scene_call' && n.targetSceneId === sceneId)
      );

      if (callers.length > 0) {
        console.warn(
          `[sceneSlice] Cannot delete scene ${sceneId} - referenced by ${callers.length} scene(s)`
        );
        return state;
      }

      const newScenes = removeGraphFromCollection(state.scenes, sceneId);
      const newMetadata = { ...state.sceneMetadata };
      delete newMetadata[sceneId];

      return {
        scenes: newScenes,
        sceneMetadata: newMetadata,
        currentSceneId: state.currentSceneId === sceneId ? null : state.currentSceneId,
      };
    }, false, 'deleteScene');
  },

  duplicateScene: (sceneId, newTitle) => {
    const state = get();
    const newSceneId = generateGraphId('scene');
    const newScenes = duplicateGraph(state.scenes, sceneId, newSceneId, newTitle);

    if (!newScenes) {
      console.warn(`[sceneSlice] Scene not found: ${sceneId}`);
      return '';
    }

    set(
      {
        scenes: newScenes,
        currentSceneId: newSceneId,
      },
      false,
      'duplicateScene'
    );

    return newSceneId;
  },

  loadScene: (sceneId) => {
    set({ currentSceneId: sceneId }, false, 'loadScene');
  },

  getCurrentScene: () => {
    const state = get();
    if (!state.currentSceneId) return null;
    return getGraph(state.scenes, state.currentSceneId);
  },

  getScene: (sceneId) => {
    const state = get();
    return getGraph(state.scenes, sceneId);
  },

  listScenes: () => {
    const state = get();
    const scenes = listGraphs(state.scenes);
    return scenes.sort((a, b) =>
      (a.createdAt || '').localeCompare(b.createdAt || '')
    );
  },

  renameScene: (sceneId, newTitle) => {
    set(
      (state) => ({
        scenes: renameGraph(state.scenes, sceneId, newTitle),
      }),
      false,
      'renameScene'
    );
  },

  /**
   * Get set of all scene IDs (for validation)
   *
   * This is useful for cross-layer validation where arc graphs need
   * to check if scene references are valid without accessing the full
   * scenes object.
   */
  getSceneIds: () => {
    const { scenes } = get();
    return new Set(getGraphIds(scenes));
  },
});
