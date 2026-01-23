/**
 * Runtime API Adapter
 *
 * Adapts the frontend API functions to the GameApiClient interface
 * required by GameRuntime from @pixsim7/game.engine.
 */

import type { GameApiClient, SessionStorage } from '@pixsim7/game.engine';
import { SessionId as toSessionId } from '@pixsim7/shared.types';

import type { GameSessionDTO, GameWorldDetail, TemplateKind, ListInteractionsRequest, ListInteractionsResponse, ExecuteInteractionRequest, ExecuteInteractionResponse } from '@lib/registries';

import {
  getGameSession,
  updateGameSession,
  getGameWorld,
  advanceGameWorldTime,
  resolveTemplate,
  resolveTemplateBatch,
} from '../../api/game';

/**
 * GameApiClient implementation using frontend API functions
 */
export const gameRuntimeApiClient: GameApiClient = {
  async fetchSession(sessionId: number): Promise<GameSessionDTO> {
    return await getGameSession(toSessionId(sessionId));
  },

  async updateSession(
    sessionId: number,
    payload: Partial<GameSessionDTO>
  ): Promise<GameSessionDTO> {
    const result = await updateGameSession(toSessionId(sessionId), {
      world_time: payload.world_time,
      flags: payload.flags,
      stats: payload.stats as Record<string, Record<string, unknown>> | undefined,
    });

    if (result.conflict) {
      // Handle conflict by returning the server's version
      // The caller can detect this via version mismatch
      if (result.serverSession) {
        return result.serverSession;
      }
      throw new Error('Session update conflict');
    }

    if (!result.session) {
      throw new Error('Session update failed');
    }

    return result.session;
  },

  async getWorld(worldId: number): Promise<GameWorldDetail> {
    return await getGameWorld(worldId);
  },

  async advanceWorldTime(worldId: number, deltaSeconds: number): Promise<GameWorldDetail> {
    return await advanceGameWorldTime(worldId, deltaSeconds);
  },

  async listInteractions(req: ListInteractionsRequest): Promise<ListInteractionsResponse> {
    // Not used by useGameRuntime - interactions are handled at route level
    return {
      interactions: [],
      target: req.target,
      worldId: req.worldId,
      sessionId: req.sessionId,
      timestamp: Date.now(),
    };
  },

  async executeInteraction(req: ExecuteInteractionRequest): Promise<ExecuteInteractionResponse> {
    // Not used by useGameRuntime - interactions are handled at route level
    void req;
    return {
      success: false,
      message: 'executeInteraction not implemented in runtime adapter',
      timestamp: Date.now(),
    };
  },

  // Template Resolution APIs (ObjectLink system)
  async resolveTemplate(
    templateKind: TemplateKind,
    templateId: string,
    context?: Record<string, unknown>
  ) {
    return await resolveTemplate(templateKind, templateId, context);
  },

  async resolveTemplateBatch(
    refs: Array<{
      templateKind: TemplateKind;
      templateId: string;
      context?: Record<string, unknown>;
    }>,
    sharedContext?: Record<string, unknown>
  ) {
    return await resolveTemplateBatch(refs, sharedContext);
  },
};

/**
 * SessionStorage implementation using localStorage
 */
export const gameRuntimeStorage: SessionStorage = {
  async loadLocalSession(sessionId: number): Promise<GameSessionDTO | null> {
    try {
      const key = `pixsim7:runtime:session:${sessionId}`;
      const data = localStorage.getItem(key);
      if (!data) return null;
      return JSON.parse(data) as GameSessionDTO;
    } catch (error) {
      console.error('[GameRuntime] Failed to load session from localStorage:', error);
      return null;
    }
  },

  async saveLocalSession(session: GameSessionDTO): Promise<void> {
    try {
      const key = `pixsim7:runtime:session:${session.id}`;
      localStorage.setItem(key, JSON.stringify(session));
    } catch (error) {
      console.error('[GameRuntime] Failed to save session to localStorage:', error);
    }
  },

  async clearLocalSession(sessionId: number): Promise<void> {
    try {
      const key = `pixsim7:runtime:session:${sessionId}`;
      localStorage.removeItem(key);
    } catch (error) {
      console.error('[GameRuntime] Failed to clear session from localStorage:', error);
    }
  },
};
