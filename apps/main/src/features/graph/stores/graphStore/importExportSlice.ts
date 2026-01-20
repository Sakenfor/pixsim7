import { exportGraph, exportProject, importGraph, importProject, createBasicValidator } from '@pixsim7/shared.graph.utilities';

import { logEvent } from '@lib/utils/logging';

import type { DraftScene } from '@domain/sceneBuilder';

import type { StateCreator, ImportExportState } from './types';

/**
 * Import/Export Slice
 *
 * Handles scene and project import/export
 */
export const createImportExportSlice: StateCreator<ImportExportState> = (set, get) => ({
  exportScene: (sceneId) => {
    const state = get();
    const scene = state.scenes[sceneId];
    if (!scene) {
      console.warn('[importExportSlice] Scene not found for export');
      return null;
    }

    return exportGraph(scene, { exportedBy: 'scene-builder-v2' });
  },

  exportProject: () => {
    const state = get();

    return exportProject(state.scenes, {
      version: 2,
      sceneMetadata: state.sceneMetadata,
      exportedBy: 'scene-builder-v2',
    });
  },

  importScene: (jsonString) => {
    const validateScene = createBasicValidator<DraftScene>(['id', 'title', 'nodes']);

    const importedScene = importGraph<DraftScene>(jsonString, {
      validate: validateScene,
      generateId: () => `scene_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });

    if (!importedScene) {
      console.error('[importExportSlice] Import failed');
      return null;
    }

    set(
      (state) => ({
        scenes: {
          ...state.scenes,
          [importedScene.id]: importedScene,
        },
        currentSceneId: importedScene.id,
      }),
      false,
      'importScene'
    );

    logEvent('DEBUG', 'scene_imported', { sceneId: importedScene.id, title: importedScene.title });
    return importedScene.id;
  },

  importProject: (jsonString) => {
    const validateProject = (data: any) => {
      return data.scenes && typeof data.scenes === 'object';
    };

    const scenes = importProject<DraftScene>(jsonString, 'scenes', validateProject);

    if (!scenes) {
      console.error('[importExportSlice] Project import failed');
      return;
    }

    // Parse metadata if present
    const data = JSON.parse(jsonString);

    set(
      {
        scenes,
        sceneMetadata: data.sceneMetadata || {},
        currentSceneId: Object.keys(scenes)[0] || null,
      },
      false,
      'importProject'
    );

    logEvent('DEBUG', 'project_imported', { sceneCount: Object.keys(scenes).length });
  },
});
