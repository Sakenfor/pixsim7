import {
  GameContext,
  LocationId,
  NpcId,
  SceneId,
  SessionId,
  WorldId,
} from '@pixsim7/shared.types';
import { create } from 'zustand';

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

type RuntimeGameContext = GameContext & {
  worldTimeSeconds?: number | null;
};

interface GameStateStore {
  // Current game context (null if not in game)
  context: RuntimeGameContext | null;

  // Actions
  setContext: (ctx: RuntimeGameContext) => void;
  updateContext: (patch: Partial<RuntimeGameContext>) => void;
  clearContext: () => void;

  // Mode-specific actions for convenience
  enterMap: (worldId: number, sessionId: number) => void;
  enterRoom: (worldId: number, sessionId: number, locationId: number | string) => void;
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
        worldId: WorldId(worldId),
        sessionId: SessionId(sessionId),
      },
    }),

  enterRoom: (worldId, sessionId, locationId) =>
    set({
      context: {
        mode: 'room',
        worldId: WorldId(worldId),
        sessionId: SessionId(sessionId),
        locationId: LocationId(Number(locationId)),
      },
    }),

  enterScene: (worldId, sessionId, sceneId, npcId) =>
    set({
      context: {
        mode: 'scene',
        worldId: WorldId(worldId),
        sessionId: SessionId(sessionId),
        sceneId: SceneId(sceneId),
        npcId: npcId !== undefined ? NpcId(npcId) : undefined,
      },
    }),

  enterConversation: (worldId, sessionId, npcId, narrativeProgramId) =>
    set({
      context: {
        mode: 'conversation',
        worldId: WorldId(worldId),
        sessionId: SessionId(sessionId),
        npcId: NpcId(npcId),
        narrativeProgramId,
      },
    }),

  enterMenu: (worldId, sessionId) =>
    set({
      context: {
        mode: 'menu',
        worldId: WorldId(worldId),
        sessionId: SessionId(sessionId),
      },
    }),
}));
