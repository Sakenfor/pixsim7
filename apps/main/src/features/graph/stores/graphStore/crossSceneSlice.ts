import { filterNodesByType } from '@pixsim7/shared.graph-utilities';

import type { StateCreator, CrossSceneState } from './types';

/**
 * Cross-Scene Slice
 *
 * Handles cross-scene references and validation:
 * - Get scenes that call a target scene
 * - Get scenes called by a source scene
 * - Validate scene call nodes
 */
export const createCrossSceneSlice: StateCreator<CrossSceneState> = (_set, get) => {
  void _set;
  return {
    getSceneCallers: (sceneId) => {
      const state = get();
      const callers: Array<{ sceneId: string; nodeIds: string[] }> = [];

      Object.values(state.scenes).forEach((scene) => {
        const callNodes = filterNodesByType(scene.nodes, 'scene_call')
          .filter((n) => n.targetSceneId === sceneId);

        if (callNodes.length > 0) {
          callers.push({
            sceneId: scene.id,
            nodeIds: callNodes.map((n) => n.id),
          });
        }
      });

      return callers;
    },

    getSceneCalls: (sceneId) => {
      const state = get();
      const scene = state.scenes[sceneId];
      if (!scene) return [];

      const sceneCallNodes = filterNodesByType(scene.nodes, 'scene_call');

      return sceneCallNodes.map((node) => ({
        targetSceneId: node.targetSceneId,
        nodeId: node.id,
      }));
    },

    validateSceneCall: (callNode) => {
      const state = get();
      const errors: string[] = [];
      const warnings: string[] = [];

      // Check target scene exists
      const targetScene = state.scenes[callNode.targetSceneId];
      if (!targetScene) {
        errors.push(`Target scene not found: ${callNode.targetSceneId}`);
        return { valid: false, errors, warnings };
      }

      // Check target scene has signature if it's reusable
      if (targetScene.signature) {
        // Validate parameters
        targetScene.signature.parameters.forEach((param) => {
          if (param.required && !(param.name in callNode.parameterBindings)) {
            errors.push(`Missing required parameter: ${param.name}`);
          }
        });

        // Validate return routing
        targetScene.signature.returnPoints.forEach((returnPoint) => {
          if (!(returnPoint.id in callNode.returnRouting)) {
            warnings.push(`Missing return routing for: ${returnPoint.label}`);
          }
        });
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
      };
    },
  };
};
