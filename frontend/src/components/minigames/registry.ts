/**
 * Frontend Mini-Game Registrations
 *
 * This file registers frontend-specific mini-games that depend on
 * frontend implementations (like gizmo renderers).
 */

import { registerMiniGame, type MiniGameDefinition, type SceneGizmoConfig, type GizmoResult } from '@pixsim7/scene-gizmos';
import { SceneGizmoMiniGame } from './SceneGizmoMiniGame';

/**
 * Register the Scene Gizmo mini-game
 */
export function registerSceneGizmoMiniGame() {
  const sceneGizmoDefinition: MiniGameDefinition<SceneGizmoConfig, GizmoResult> = {
    id: 'sceneGizmo',
    name: 'Scene Gizmo Controller',
    description: 'Interactive 3D spatial control for scene navigation',
    category: 'spatial',
    icon: '🎮',
    defaultConfig: {
      style: 'orb',
      zones: [],
      anchors: [],
      physics: {
        friction: 0.95,
        snapStrength: 0.8,
        smoothing: 0.85,
      },
      visual: {
        showZones: true,
        showAnchors: true,
        showTrails: true,
        particleEffects: true,
      },
    },
    component: SceneGizmoMiniGame as any,
  };

  registerMiniGame(sceneGizmoDefinition);
}

/**
 * Register all frontend mini-games
 */
export function registerFrontendMiniGames() {
  registerSceneGizmoMiniGame();
}
