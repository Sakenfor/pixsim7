/**
 * Runtime API Adapter
 *
 * Adapts the frontend API functions to the GameApiClient interface
 * required by GameRuntime from @pixsim7/game.engine.
 *
 * Hybrid execution strategy:
 * 1. Backend-first: Uses backend APIs for gating, availability, and outcome execution
 * 2. Client-side fallback: Falls back to interactionRegistry plugins when:
 *    - Backend is unavailable (network error)
 *    - Interaction has underlyingPluginId for client-side UI handling
 */

import type { GameApiClient, SessionStorage } from '@pixsim7/game.engine';
import { SessionId as toSessionId } from '@pixsim7/shared.types';

import type {
  GameSessionDTO,
  GameWorldDetail,
  TemplateKind,
  ListInteractionsRequest,
  ListInteractionsResponse,
  ExecuteInteractionRequest,
  ExecuteInteractionResponse,
  InteractionInstance,
} from '@lib/registries';

import {
  getGameSession,
  updateGameSession,
  getGameWorld,
  advanceGameWorldTime,
  resolveTemplate,
  resolveTemplateBatch,
} from '../../api/game';

import {
  listInteractions as backendListInteractions,
  executeInteraction as backendExecuteInteraction,
} from '../../api/interactions';

import { interactionRegistry, type InteractionContext as PluginContext } from '../interactions';

/**
 * Build client-side plugin context from request
 */
function buildPluginContext(
  req: ExecuteInteractionRequest,
  session?: GameSessionDTO | null
): PluginContext {
  return {
    sessionId: req.sessionId,
    worldId: req.worldId,
    worldTime: session?.world_time ?? 0,
    npcId: req.target?.id as number | undefined,
    locationId: undefined, // Could be passed in context
    flags: session?.flags ?? {},
    stats: session?.stats ?? {},
  };
}

/**
 * Try to execute interaction via client-side plugin
 */
async function tryClientSideExecution(
  interactionId: string,
  req: ExecuteInteractionRequest,
  session?: GameSessionDTO | null
): Promise<ExecuteInteractionResponse | null> {
  try {
    const plugin = await interactionRegistry.getAsync(interactionId);
    if (!plugin) {
      return null;
    }

    const context = buildPluginContext(req, session);
    const config = req.context ?? {};

    // Execute via plugin
    const result = await plugin.execute(config, context);

    return {
      success: result.success ?? true,
      message: result.message,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.warn('[GameRuntime] Client-side plugin execution failed:', interactionId, error);
    return null;
  }
}

/**
 * Get client-side interactions from registry (fallback when backend unavailable)
 */
async function getClientSideInteractions(
  req: ListInteractionsRequest
): Promise<InteractionInstance[]> {
  const plugins = interactionRegistry.getAll();
  const interactions: InteractionInstance[] = [];

  for (const plugin of plugins) {
    // Check if plugin is available in current context
    const context = buildPluginContext(
      {
        worldId: req.worldId,
        sessionId: req.sessionId,
        target: req.target,
        interactionId: plugin.id,
      },
      null
    );

    const available = plugin.isAvailable ? plugin.isAvailable(context) : true;

    interactions.push({
      id: `client:${plugin.id}`,
      definitionId: plugin.id,
      target: req.target,
      participants: req.participants,
      primaryRole: req.primaryRole,
      worldId: req.worldId,
      sessionId: req.sessionId,
      surface: plugin.uiMode === 'dialogue' ? 'dialogue' : 'notification',
      label: plugin.name,
      icon: plugin.icon,
      available,
      priority: plugin.priority ?? 0,
    });
  }

  return interactions;
}

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
    try {
      // Try backend first (has full gating context)
      const response = await backendListInteractions(req);

      // Merge with client-side plugins if backend returned results
      // This allows both backend-defined and client-only interactions
      if (response.interactions.length > 0) {
        return response;
      }

      // If backend returned empty, try client-side plugins as supplement
      const clientInteractions = await getClientSideInteractions(req);
      if (clientInteractions.length > 0) {
        return {
          ...response,
          interactions: clientInteractions,
        };
      }

      return response;
    } catch (error) {
      // Backend unavailable - fallback to client-side plugins
      console.warn('[GameRuntime] Backend listInteractions failed, using client-side fallback:', error);

      const clientInteractions = await getClientSideInteractions(req);
      return {
        interactions: clientInteractions,
        target: req.target,
        participants: req.participants,
        primaryRole: req.primaryRole,
        worldId: req.worldId,
        sessionId: req.sessionId,
        timestamp: Date.now(),
      };
    }
  },

  async executeInteraction(req: ExecuteInteractionRequest): Promise<ExecuteInteractionResponse> {
    // Check if this is a client-side only interaction (prefixed with "client:")
    if (req.interactionId.startsWith('client:')) {
      const pluginId = req.interactionId.slice('client:'.length);
      const result = await tryClientSideExecution(pluginId, req);
      if (result) {
        return result;
      }
      return {
        success: false,
        message: `Client-side plugin '${pluginId}' not found`,
        timestamp: Date.now(),
      };
    }

    try {
      // Try backend first (handles outcomes: stat deltas, flags, inventory, etc.)
      const response = await backendExecuteInteraction(req);

      // If backend succeeded and interaction has underlyingPluginId,
      // the UI layer (Game2D) should invoke that plugin for rendering
      // The response includes all the data needed for that
      return response;
    } catch (error) {
      // Backend failed - try client-side plugin as fallback
      console.warn('[GameRuntime] Backend executeInteraction failed, trying client-side fallback:', error);

      const clientResult = await tryClientSideExecution(req.interactionId, req);
      if (clientResult) {
        return clientResult;
      }

      // No fallback available
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Interaction execution failed',
        timestamp: Date.now(),
      };
    }
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
