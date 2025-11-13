import type { StateCreator, ImportExportState } from './types';
import type { DraftScene } from '../../modules/scene-builder';

/**
 * Import/Export Slice
 *
 * Handles scene and project import/export
 */
export const createImportExportSlice: StateCreator<ImportExportState> = (set, get, _api) => ({
  exportScene: (sceneId) => {
    const state = get();
    const scene = state.scenes[sceneId];
    if (!scene) {
      console.warn('[importExportSlice] Scene not found for export');
      return null;
    }

    const exportData = {
      ...scene,
      exportedAt: new Date().toISOString(),
      exportedBy: 'scene-builder-v2',
    };

    return JSON.stringify(exportData, null, 2);
  },

  exportProject: () => {
    const state = get();

    const exportData = {
      version: 2,
      scenes: state.scenes,
      sceneMetadata: state.sceneMetadata,
      exportedAt: new Date().toISOString(),
      exportedBy: 'scene-builder-v2',
    };

    return JSON.stringify(exportData, null, 2);
  },

  importScene: (jsonString) => {
    try {
      const data = JSON.parse(jsonString);

      // Validate basic structure
      if (!data.id || !data.title || !Array.isArray(data.nodes)) {
        throw new Error('Invalid scene format');
      }

      // Generate new ID to avoid conflicts
      const newSceneId = `scene_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const importedScene: DraftScene = {
        ...data,
        id: newSceneId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      set(
        (state) => ({
          scenes: {
            ...state.scenes,
            [newSceneId]: importedScene,
          },
          currentSceneId: newSceneId,
        }),
        false,
        'importScene'
      );

      console.log('[importExportSlice] Imported scene:', importedScene.title);
      return newSceneId;
    } catch (error) {
      console.error('[importExportSlice] Import failed:', error);
      return null;
    }
  },

  importProject: (jsonString) => {
    try {
      const data = JSON.parse(jsonString);

      if (!data.scenes || typeof data.scenes !== 'object') {
        throw new Error('Invalid project format');
      }

      set(
        {
          scenes: data.scenes,
          sceneMetadata: data.sceneMetadata || {},
          currentSceneId: Object.keys(data.scenes)[0] || null,
        },
        false,
        'importProject'
      );

      console.log('[importExportSlice] Imported project with', Object.keys(data.scenes).length, 'scenes');
    } catch (error) {
      console.error('[importExportSlice] Project import failed:', error);
    }
  },
});
