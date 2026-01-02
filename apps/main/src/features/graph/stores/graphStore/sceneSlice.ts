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
    const sceneId = `scene_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

      const newScenes = { ...state.scenes };
      delete newScenes[sceneId];

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
    const originalScene = state.scenes[sceneId];
    if (!originalScene) {
      console.warn(`[sceneSlice] Scene not found: ${sceneId}`);
      return '';
    }

    const newSceneId = `scene_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const duplicated: DraftScene = {
      ...originalScene,
      id: newSceneId,
      title: newTitle || `${originalScene.title} (Copy)`,
      createdAt: now,
      updatedAt: now,
    };

    set(
      (state) => ({
        scenes: {
          ...state.scenes,
          [newSceneId]: duplicated,
        },
        currentSceneId: newSceneId,
      }),
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
    return state.scenes[state.currentSceneId] || null;
  },

  getScene: (sceneId) => {
    const state = get();
    return state.scenes[sceneId] || null;
  },

  listScenes: () => {
    const state = get();
    return Object.values(state.scenes).sort((a, b) =>
      (a.createdAt || '').localeCompare(b.createdAt || '')
    );
  },

  renameScene: (sceneId, newTitle) => {
    set(
      (state) => {
        const scene = state.scenes[sceneId];
        if (!scene) return state;

        return {
          scenes: {
            ...state.scenes,
            [sceneId]: {
              ...scene,
              title: newTitle,
              updatedAt: new Date().toISOString(),
            },
          },
        };
      },
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
    return new Set(Object.keys(scenes));
  },
});
