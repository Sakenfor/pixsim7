/**
 * Game State helpers for GameMode and GameContext
 * Task 22 - Game Mode & ViewState Model
 */

import { GameContext, GameMode } from '@pixsim7/shared.types';

/**
 * Check if the current game mode is 'conversation'
 */
export function isConversationMode(context: GameContext | null): boolean {
  return context?.mode === 'conversation';
}

/**
 * Check if the current game mode is 'scene'
 */
export function isSceneMode(context: GameContext | null): boolean {
  return context?.mode === 'scene';
}

/**
 * Check if the current game mode is 'room'
 */
export function isRoomMode(context: GameContext | null): boolean {
  return context?.mode === 'room';
}

/**
 * Check if the current game mode is 'map'
 */
export function isMapMode(context: GameContext | null): boolean {
  return context?.mode === 'map';
}

/**
 * Check if the current game mode is 'menu'
 */
export function isMenuMode(context: GameContext | null): boolean {
  return context?.mode === 'menu';
}

/**
 * Check if the player is in an interactive mode (room, conversation, or scene)
 * Excludes map browsing and menu
 */
export function isInteractiveMode(context: GameContext | null): boolean {
  if (!context) return false;
  return context.mode === 'room' || context.mode === 'conversation' || context.mode === 'scene';
}

/**
 * Check if the player is currently focused on a specific NPC
 */
export function hasFocusedNpc(context: GameContext | null): boolean {
  return context?.npcId !== undefined && context?.npcId !== null;
}

/**
 * Get the focused NPC ID if available
 */
export function getFocusedNpcId(context: GameContext | null): number | undefined {
  return context?.npcId;
}

/**
 * Check if a narrative program is currently active
 */
export function hasActiveNarrativeProgram(context: GameContext | null): boolean {
  return context?.narrativeProgramId !== undefined && context?.narrativeProgramId !== null;
}

/**
 * Get the active narrative program ID if available
 */
export function getActiveNarrativeProgramId(context: GameContext | null): string | undefined {
  return context?.narrativeProgramId;
}

/**
 * Create a new GameContext with the specified mode
 */
export function createGameContext(
  mode: GameMode,
  worldId: number,
  sessionId: number,
  options?: {
    locationId?: string;
    sceneId?: number;
    npcId?: number;
    narrativeProgramId?: string;
  }
): GameContext {
  return {
    mode,
    worldId,
    sessionId,
    ...options,
  };
}

/**
 * Update an existing GameContext with partial changes
 */
export function updateGameContext(
  context: GameContext,
  updates: Partial<GameContext>
): GameContext {
  return {
    ...context,
    ...updates,
  };
}
