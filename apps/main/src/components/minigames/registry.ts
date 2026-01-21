/**
 * Frontend Mini-Game Registrations
 *
 * This file registers frontend-specific mini-games that depend on
 * frontend implementations (like gizmo renderers).
 */

import { registerMiniGame, type MiniGameDefinition, type SceneGizmoConfig, type GizmoResult } from '@pixsim7/scene.gizmos';

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
        springiness: 0.85,
        magnetism: true,
      },
      visual: {
        baseColor: '#5f9ed8',
        activeColor: '#9fe7ff',
        particleType: 'stars',
        glowIntensity: 0.6,
        trailLength: 0.4,
        opacity: 0.9,
      },
    },
    component: SceneGizmoMiniGame,
  };

  registerMiniGame(sceneGizmoDefinition);
}

/**
 * Register all frontend mini-games
 */
export function registerFrontendMiniGames() {
  registerSceneGizmoMiniGame();
}
