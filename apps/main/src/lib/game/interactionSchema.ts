/**
 * Hotspot actions and scene playback helpers for 2D interactions.
 *
 * This module re-exports the canonical implementation from
 * `@pixsim7/game.engine
 * from `frontend/src/lib/game/interactionSchema` continue to work
 * while all logic lives in the shared game engine package.
 */
export {
  parseHotspotAction,
  deriveScenePlaybackPhase,
} from '@pixsim7/game.engine';

export type {
  HotspotActionType,
  HotspotAction,
  PlaySceneAction,
  ChangeLocationAction,
  NpcTalkAction,
  ScenePlaybackPhase,
} from '@pixsim7/game.engine';
