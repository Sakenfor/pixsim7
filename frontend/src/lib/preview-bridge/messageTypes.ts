/**
 * PostMessage Bridge - Message Types
 *
 * Defines the communication protocol between the Scene Editor (frontend)
 * and the Game Player (game-frontend) via postMessage.
 */

import type { Scene } from '@pixsim7/types';

// ============================================================================
// Editor → Game Messages
// ============================================================================

export type EditorToGameMessage =
  | LoadSceneMessage
  | PlaySceneMessage
  | PauseSceneMessage
  | StopSceneMessage
  | SeekToNodeMessage
  | SetAuthTokenMessage;

/**
 * Load a scene into the game player (doesn't auto-play)
 */
export interface LoadSceneMessage {
  type: 'load-scene';
  payload: {
    scene: Scene;
    autoPlay?: boolean; // If true, start playing immediately
  };
}

/**
 * Start/resume playback
 */
export interface PlaySceneMessage {
  type: 'play-scene';
}

/**
 * Pause playback
 */
export interface PauseSceneMessage {
  type: 'pause-scene';
}

/**
 * Stop playback and reset
 */
export interface StopSceneMessage {
  type: 'stop-scene';
}

/**
 * Jump to a specific node
 */
export interface SeekToNodeMessage {
  type: 'seek-to-node';
  payload: {
    nodeId: string;
  };
}

export interface SetAuthTokenMessage {
  type: 'set-auth-token';
  payload: {
    token: string | null;
  };
}

// ============================================================================
// Game → Editor Messages
// ============================================================================

export type GameToEditorMessage =
  | SceneLoadedMessage
  | SceneErrorMessage
  | PlaybackStateMessage
  | NodeChangedMessage;

/**
 * Scene successfully loaded
 */
export interface SceneLoadedMessage {
  type: 'scene-loaded';
  payload: {
    sceneId: string;
    nodeCount: number;
  };
}

/**
 * Error loading or playing scene
 */
export interface SceneErrorMessage {
  type: 'scene-error';
  payload: {
    error: string;
    details?: string;
  };
}

/**
 * Playback state changed
 */
export interface PlaybackStateMessage {
  type: 'playback-state';
  payload: {
    state: 'playing' | 'paused' | 'stopped';
    currentNodeId?: string;
  };
}

/**
 * Current node changed during playback
 */
export interface NodeChangedMessage {
  type: 'node-changed';
  payload: {
    nodeId: string;
    nodeType: string;
  };
}

// ============================================================================
// Type Guards
// ============================================================================

export function isEditorToGameMessage(msg: any): msg is EditorToGameMessage {
  return (
    msg &&
    typeof msg === 'object' &&
    typeof msg.type === 'string' &&
    ['load-scene', 'play-scene', 'pause-scene', 'stop-scene', 'seek-to-node', 'set-auth-token'].includes(msg.type)
  );
}

export function isGameToEditorMessage(msg: any): msg is GameToEditorMessage {
  return (
    msg &&
    typeof msg === 'object' &&
    typeof msg.type === 'string' &&
    ['scene-loaded', 'scene-error', 'playback-state', 'node-changed'].includes(msg.type)
  );
}
