import { create } from 'zustand';
import { GameContext, GameMode } from '@pixsim7/types';

/**
 * Game State Store (Task 22)
 *
 * Central store for the current game mode and view state.
 * Provides a unified answer to "what mode is the player in right now?"
 *
 * This is the single source of truth for:
 * - Map vs room vs scene vs conversation vs menu
 * - Current world/session
 * - Focused NPC/scene/program where relevant
 */

interface GameStateStore {
  // Current game context (null if not in game)
  context: GameContext | null;

  // Actions
  setContext: (ctx: GameContext) => void;
  updateContext: (patch: Partial<GameContext>) => void;
  clearContext: () => void;

  // Mode-specific actions for convenience
  enterMap: (worldId: number, sessionId: number) => void;
  enterRoom: (worldId: number, sessionId: number, locationId: string) => void;
  enterScene: (worldId: number, sessionId: number, sceneId: number, npcId?: number) => void;
  enterConversation: (worldId: number, sessionId: number, npcId: number, narrativeProgramId?: string) => void;
  enterMenu: (worldId: number, sessionId: number) => void;
}

export const useGameStateStore = create<GameStateStore>((set) => ({
  context: null,

  setContext: (ctx) => set({ context: ctx }),

  updateContext: (patch) =>
    set((state) => ({
      context: state.context ? { ...state.context, ...patch } : null,
    })),

  clearContext: () => set({ context: null }),

  enterMap: (worldId, sessionId) =>
    set({
      context: {
        mode: 'map',
        worldId,
        sessionId,
      },
    }),

  enterRoom: (worldId, sessionId, locationId) =>
    set({
      context: {
        mode: 'room',
        worldId,
        sessionId,
        locationId,
      },
    }),

  enterScene: (worldId, sessionId, sceneId, npcId) =>
    set({
      context: {
        mode: 'scene',
        worldId,
        sessionId,
        sceneId,
        npcId,
      },
    }),

  enterConversation: (worldId, sessionId, npcId, narrativeProgramId) =>
    set({
      context: {
        mode: 'conversation',
        worldId,
        sessionId,
        npcId,
        narrativeProgramId,
      },
    }),

  enterMenu: (worldId, sessionId) =>
    set({
      context: {
        mode: 'menu',
        worldId,
        sessionId,
      },
    }),
}));
