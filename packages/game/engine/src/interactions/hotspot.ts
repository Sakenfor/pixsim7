import type {
  Scene,
  SceneRuntimeState,
  HotspotAction,
  HotspotActionType,
  PlaySceneAction,
  ChangeLocationAction,
  NpcTalkAction,
} from '@pixsim7/shared.types';

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
 * Parse a loose action value into a typed `HotspotAction`.
 * Unknown or malformed actions return `null` so callers can safely ignore them.
 */
export function parseHotspotAction(raw: unknown): HotspotAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const anyRaw = raw as any;
  const type = anyRaw.type as HotspotActionType | undefined;
  if (type !== 'play_scene' && type !== 'change_location' && type !== 'npc_talk') {
    return null;
  }

  switch (type) {
    case 'play_scene':
      return { type, scene_id: anyRaw.scene_id ?? null };
    case 'change_location':
      return { type, target_location_id: anyRaw.target_location_id ?? null };
    case 'npc_talk':
      return { type, npc_id: anyRaw.npc_id ?? null };
    default:
      return null;
  }
}

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
