import type { Scene, SceneRuntimeState } from '@pixsim7/types';

/**
 * Frontend-only hotspot action schema for 2D interactions.
 *
 * These actions live inside `GameHotspot.meta.action` on the backend as
 * arbitrary JSON, but are interpreted here by the 2D client.
 */
export type HotspotActionType = 'play_scene' | 'change_location' | 'npc_talk';

export interface PlaySceneAction {
  type: 'play_scene';
  /**
   * Optional explicit scene id to play.
   * If omitted, the client should fall back to `linked_scene_id`.
   */
  scene_id?: number | string | null;
}

export interface ChangeLocationAction {
  type: 'change_location';
  /**
   * Target `GameLocation.id` to move the player to.
   */
  target_location_id?: number | string | null;
}

export interface NpcTalkAction {
  type: 'npc_talk';
  /**
   * Target `GameNPC.id` that this interaction should talk to.
   */
  npc_id?: number | string | null;
}

export type HotspotAction = PlaySceneAction | ChangeLocationAction | NpcTalkAction;

/**
 * Parse a loose `meta.action` value into a typed `HotspotAction`.
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

