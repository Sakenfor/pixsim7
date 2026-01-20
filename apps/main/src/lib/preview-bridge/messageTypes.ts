/**
 * PostMessage Bridge - Message Types
 *
 * App-level re-exports for shared preview protocol contracts.
 */

import type {
  EditorToGameMessage as EditorToGameMessageBase,
  LoadSceneMessage as LoadSceneMessageBase,
  PlaySceneMessage as PlaySceneMessageBase,
  PauseSceneMessage as PauseSceneMessageBase,
  StopSceneMessage as StopSceneMessageBase,
  SeekToNodeMessage as SeekToNodeMessageBase,
  SetAuthTokenMessage as SetAuthTokenMessageBase,
  GameToEditorMessage as GameToEditorMessageBase,
  SceneLoadedMessage as SceneLoadedMessageBase,
  SceneErrorMessage as SceneErrorMessageBase,
  PlaybackStateMessage as PlaybackStateMessageBase,
  NodeChangedMessage as NodeChangedMessageBase,
} from "@pixsim7/shared.preview-protocol";

import type { Scene } from "@lib/registries";

export type EditorToGameMessage = EditorToGameMessageBase<Scene>;
export type LoadSceneMessage = LoadSceneMessageBase<Scene>;
export type PlaySceneMessage = PlaySceneMessageBase;
export type PauseSceneMessage = PauseSceneMessageBase;
export type StopSceneMessage = StopSceneMessageBase;
export type SeekToNodeMessage = SeekToNodeMessageBase;
export type SetAuthTokenMessage = SetAuthTokenMessageBase;

export type GameToEditorMessage = GameToEditorMessageBase;
export type SceneLoadedMessage = SceneLoadedMessageBase;
export type SceneErrorMessage = SceneErrorMessageBase;
export type PlaybackStateMessage = PlaybackStateMessageBase;
export type NodeChangedMessage = NodeChangedMessageBase;

export {
  isEditorToGameMessage,
  isGameToEditorMessage,
} from "@pixsim7/shared.preview-protocol";
