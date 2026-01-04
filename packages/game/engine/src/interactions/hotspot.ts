import type {
  Scene,
  SceneRuntimeState,
  HotspotAction,
  HotspotActionType,
  PlaySceneAction,
  ChangeLocationAction,
  NpcTalkAction,
} from '@pixsim7/shared.types';

// Re-export from registry
export {
  gameActionRegistry,
  parseHotspotAction,
  validateAction,
  type GameActionMeta,
} from './actionRegistry';

/**
 * Frontend-only hotspot action schema for 2D interactions.
 *
 * These actions are authored as structured JSON in `GameHotspot.action`,
 * but are still parsed defensively on the client.
 */
export type {
  HotspotActionType,
  HotspotAction,
  PlaySceneAction,
  ChangeLocationAction,
  NpcTalkAction,
};

/**
 * Coarse scene playback phases exposed to the 2D UI.
 *
 * These are intentionally simple and derived entirely on the client from
 * Scene + SceneRuntimeState, without introducing new backend enums.
 */
export type ScenePlaybackPhase = 'playing' | 'awaiting_input' | 'completed';

export function deriveScenePlaybackPhase(args: {
  scene: Scene;
  runtime: SceneRuntimeState;
}): ScenePlaybackPhase {
  const { scene, runtime } = args;
  const node = scene.nodes.find((n) => n.id === runtime.currentNodeId);
  const nodeType = node?.type;

  if (!node) {
    return 'completed';
  }

  if (nodeType === 'choice') {
    return 'awaiting_input';
  }

  if (nodeType === 'end') {
    return 'completed';
  }

  return 'playing';
}
