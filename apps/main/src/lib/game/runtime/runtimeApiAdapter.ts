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

import {
  createSessionHelpers,
  interactionRegistry,
  type GameApiClient,
  type SessionStorage,
  type InteractionContext as EngineInteractionContext,
  type NpcSlotAssignment,
} from '@pixsim7/game.engine';
import {
  SessionId as toSessionId,
  SceneId as toSceneId,
  type SessionUpdatePayload,
} from '@pixsim7/shared.types';

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
  createGameSession,
  updateGameSession,
  getGameWorld,
  getGameScene,
  attemptPickpocket,
  attemptSensualTouch,
  advanceGameWorldTime,
  resolveTemplate,
  resolveTemplateBatch,
} from '../../api/game';
import {
  listInteractions as backendListInteractions,
  executeInteraction as backendExecuteInteraction,
} from '../../api/interactions';

const FALLBACK_SLOT: NpcSlotAssignment = {
  slot: {
    id: 'runtime-fallback',
    x: 0,
    y: 0,
    interactions: {},
  },
  npcId: null,
};

function toWorldTime(seconds: number | undefined): { day: number; hour: number } {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds ?? 0)) : 0;
  return {
    day: Math.floor(safeSeconds / 86400) + 1,
    hour: Math.floor((safeSeconds % 86400) / 3600),
  };
}

function getTargetNpcId(req: { target?: { id?: number | string } }): number | null {
  const id = req.target?.id;
  if (typeof id === 'number') return id;
  if (typeof id === 'string') {
    const parsed = Number(id);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

async function loadSessionSafely(sessionId: number): Promise<GameSessionDTO | null> {
  try {
    return await getGameSession(toSessionId(sessionId));
  } catch {
    return null;
  }
}

/**
 * Build engine InteractionContext for fallback plugin execution.
 */
function buildPluginContext(
  req: Pick<ListInteractionsRequest, 'worldId' | 'sessionId' | 'target' | 'participants' | 'primaryRole' | 'locationId'>,
  session: GameSessionDTO | null
): EngineInteractionContext {
  const npcId = getTargetNpcId(req);
  const assignment: NpcSlotAssignment = {
    ...FALLBACK_SLOT,
    npcId,
  };

  const sessionApi = {
    updateSession: async (sessionId: number, updates: SessionUpdatePayload) => {
      return await updateGameSession(toSessionId(sessionId), updates);
    },
  };

  const sessionHelpers = createSessionHelpers(session, undefined, sessionApi);

  return {
    state: {
      assignment,
      gameSession: session,
      sessionFlags: (session?.flags as Record<string, unknown>) ?? {},
      relationships: (session?.stats?.relationships as Record<string, unknown>) ?? {},
      worldId: req.worldId ?? null,
      worldTime: toWorldTime(session?.world_time),
      locationId: req.locationId ?? 0,
      locationNpcs: [],
    },
    api: {
      getSession: async (id: number) => await getGameSession(toSessionId(id)),
      updateSession: async (id: number, updates: Partial<GameSessionDTO>) => {
        const response = await updateGameSession(toSessionId(id), {
          world_time: updates.world_time,
          flags: updates.flags,
          stats: updates.stats as Record<string, Record<string, unknown>> | undefined,
        });
        if (response.session) return response.session;
        if (response.serverSession) return response.serverSession;
        throw new Error('Session update failed');
      },
      attemptPickpocket,
      attemptSensualTouch,
      getScene: async (id: number) => await getGameScene(toSceneId(id)),
    },
    session: sessionHelpers,
    onSceneOpen: async () => {
      throw new Error('Scene opening requires UI context and is unavailable in runtime fallback');
    },
    onError: (msg: string) => {
      console.warn('[GameRuntime] Plugin fallback error:', msg);
    },
    onSuccess: (msg: string) => {
      console.info('[GameRuntime] Plugin fallback success:', msg);
    },
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

    const resolvedSession = session ?? (await loadSessionSafely(req.sessionId));
    const context = buildPluginContext(
      {
        worldId: req.worldId,
        sessionId: req.sessionId,
        target: req.target,
        participants: req.participants,
        primaryRole: req.primaryRole,
        locationId: typeof req.context?.locationId === 'number' ? req.context.locationId : undefined,
      },
      resolvedSession
    );
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
  const session = await loadSessionSafely(req.sessionId);
  const plugins = interactionRegistry.getAll();
  const interactions: InteractionInstance[] = [];

  for (const plugin of plugins) {
    // Check if plugin is available in current context
    const context = buildPluginContext(
      {
        worldId: req.worldId,
        sessionId: req.sessionId,
        target: req.target,
        participants: req.participants,
        primaryRole: req.primaryRole,
        locationId: req.locationId,
      },
      session
    );

    const available = plugin.isAvailable ? plugin.isAvailable(context) : true;

    interactions.push({
      id: `client:${plugin.id}`,
      definitionId: plugin.id,
      target: req.target ?? {},
      participants: req.participants,
      primaryRole: req.primaryRole,
      worldId: req.worldId,
      sessionId: req.sessionId,
      surface: plugin.uiMode === 'dialogue' ? 'dialogue' : 'notification',
      label: plugin.name,
      icon: plugin.icon,
      available,
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

  async createSession(
    sceneId: number,
    flags?: Record<string, unknown>
  ): Promise<GameSessionDTO> {
    return await createGameSession(toSceneId(sceneId), flags);
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
