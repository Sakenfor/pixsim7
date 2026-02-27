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
 * Derived entirely on the client from Scene + SceneRuntimeState.
 * The base set covers the current known phases; the open `| string` union
 * lets future runtimes emit custom phases without breaking existing consumers.
 *
 * Base phases:
 *   'playing_auto'   — media playing, no player choices available (will auto-advance)
 *   'playing_choice' — media playing, choices available to the player
 *   'awaiting_input' — blocked on a choice node (no media, just choices)
 *   'completed'      — scene reached an end node or has no more nodes
 */
export type BaseScenePlaybackPhase =
  | 'playing_auto'
  | 'playing_choice'
  | 'awaiting_input'
  | 'completed';

export type ScenePlaybackPhase = BaseScenePlaybackPhase | string;

/** Returns true for any "media is playing" phase regardless of variant. */
export function isPlayingPhase(phase: ScenePlaybackPhase): boolean {
  return phase === 'playing_auto' || phase === 'playing_choice' || phase === 'playing';
}

export function deriveScenePlaybackPhase(args: {
  scene: Scene;
  runtime: SceneRuntimeState;
}): BaseScenePlaybackPhase {
  const { scene, runtime } = args;
  const node = scene.nodes.find((n) => n.id === runtime.currentNodeId);
  const nodeType = node?.type;

  if (!node) {
    return 'completed';
  }

  if (nodeType === 'end') {
    return 'completed';
  }

  if (nodeType === 'choice') {
    return 'awaiting_input';
  }

  // For media nodes: check if there are any outgoing edges the player can act on
  const outgoingEdges = scene.edges.filter((e) => e.from === node.id);
  return outgoingEdges.length > 0 ? 'playing_choice' : 'playing_auto';
}
