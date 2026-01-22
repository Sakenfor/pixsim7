/**
 * Session Adapter
 *
 * Creates SessionHelpers instance for InteractionContext.
 * Binds game engine helpers to a specific GameSession, providing
 * a clean API for plugins without requiring direct imports.
 *
 * Implements optimistic updates:
 * 1. Apply change locally (instant UI)
 * 2. Send to backend for validation
 * 3. Apply server truth or rollback on error
 */

import {
  getInventory,
  addInventoryItem as addInventoryItemCore,
  removeInventoryItem as removeInventoryItemCore,
  updateArcStage as updateArcStageCore,
  markSceneSeen as markSceneSeenCore,
  updateQuestStatus as updateQuestStatusCore,
  updateQuestSteps as updateQuestStepsCore,
  getQuestState,
  triggerEvent as triggerEventCore,
  endEvent as endEventCore,
  isEventActive,
  sessionHelperRegistry,
  getAdapterBySource,
  type StatSource,
} from '@pixsim7/game.engine';

import type { GameSessionDTO, SessionUpdatePayload } from '../../api/game';

import type { SessionHelpers, SessionAPI } from './types';

/** Maximum number of retry attempts for conflict resolution */
const MAX_RETRIES = 3;

/** Base delay in ms for exponential backoff (doubles each retry) */
const BASE_RETRY_DELAY_MS = 100;

/**
 * Simple logger for session operations
 * In production, could be replaced with proper logging service
 */
const logger = {
  info: (msg: string, data?: any) => {
    if (import.meta.env?.DEV) {
      console.log(`[SessionAdapter] ${msg}`, data ?? '');
    }
  },
  warn: (msg: string, data?: any) => {
    console.warn(`[SessionAdapter] ${msg}`, data ?? '');
  },
  error: (msg: string, err?: any) => {
    console.error(`[SessionAdapter] ${msg}`, err ?? '');
  },
};

/**
 * Sleep utility for exponential backoff
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Build optimistic update payload from session path
 *
 * Takes a dot-notation path like "stats.relationships.npc:42" and builds
 * a nested object structure for the optimistic update.
 *
 * @param session - Current session state
 * @param path - Dot-notation path (e.g., "stats.relationships.npc:42")
 * @param patch - Data to merge at the path
 */
function buildOptimisticPayload(
  session: GameSessionDTO,
  path: string,
  patch: unknown
): Partial<GameSessionDTO> {
  const parts = path.split('.');
  if (parts.length === 0) return {};

  // Get current value at path
  let current: any = session;
  for (const part of parts) {
    current = current?.[part];
  }

  // Build nested update object
  const result: any = {};
  let target = result;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const sessionValue = getNestedValue(session, parts.slice(0, i + 1));
    target[part] = { ...sessionValue };
    target = target[part];
  }

  // Set the final value (merge with current)
  const lastPart = parts[parts.length - 1];
  const patchObject =
    typeof patch === 'object' && patch !== null
      ? (patch as Record<string, unknown>)
      : null;
  target[lastPart] = patchObject ? { ...(current ?? {}), ...patchObject } : patch;

  return result;
}

/**
 * Get nested value from object using path parts
 */
function getNestedValue(obj: any, parts: string[]): any {
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Create session helpers bound to a specific game session
 *
 * @param gameSession - Current game session state
 * @param onUpdate - Callback when session is updated (for React state sync)
 * @param api - Optional backend API client for validation
 */
export function createSessionHelpers(
  gameSession: GameSessionDTO | null,
  onUpdate?: (session: GameSessionDTO) => void,
  api?: SessionAPI
): SessionHelpers {
  // If no session, return no-op helpers
  if (!gameSession) {
    return {
      getStat: () => null,
      updateStat: async () => gameSession!,
      getInventory: () => [],
      addInventoryItem: async () => gameSession!,
      removeInventoryItem: async () => gameSession!,
      updateArcStage: async () => gameSession!,
      markSceneSeen: async () => gameSession!,
      updateQuestStatus: async () => gameSession!,
      incrementQuestSteps: async () => gameSession!,
      triggerEvent: async () => gameSession!,
      endEvent: async () => gameSession!,
      isEventActive: () => false,
    };
  }

  /**
   * Generic optimistic update pattern with conflict resolution and retry logic
   * @param localUpdate - Function to apply change optimistically
   * @param backendUpdate - Partial session update to send to backend
   * @param retryCount - Internal retry counter (starts at 0)
   */
  const applyOptimisticUpdate = async (
    localUpdate: (session: GameSessionDTO) => GameSessionDTO,
    backendUpdate: Partial<GameSessionDTO>,
    retryCount = 0
  ): Promise<GameSessionDTO> => {
    // 1. Optimistic update (instant UI) - only on first attempt
    if (retryCount === 0) {
      const optimistic = localUpdate(gameSession);
      onUpdate?.(optimistic);
    }

    // 2. Backend validation (if API available)
    if (api) {
      try {
        // Include version for optimistic locking
        const payload: SessionUpdatePayload = {
          ...(backendUpdate as SessionUpdatePayload),
          expected_version: gameSession.version,
          ...(backendUpdate.stats
            ? { stats: backendUpdate.stats as SessionUpdatePayload['stats'] }
            : {}),
        };
        const response = await api.updateSession(gameSession.id, payload);

        // 3a. Handle version conflicts with retry limit
        if (response.conflict && response.serverSession) {
          if (retryCount >= MAX_RETRIES) {
            logger.error(
              `Max retries (${MAX_RETRIES}) exceeded for session update. Giving up.`,
              { sessionId: gameSession.id, retryCount }
            );
            // Rollback to original state
            onUpdate?.(gameSession);
            throw new Error('Session update failed: too many conflicts');
          }

          logger.info(
            `Version conflict detected (attempt ${retryCount + 1}/${MAX_RETRIES}), resolving...`,
            { sessionId: gameSession.id, expectedVersion: gameSession.version, serverVersion: response.serverSession.version }
          );

          // Exponential backoff: wait before retrying
          const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount);
          await sleep(delayMs);

          // Re-apply local changes on top of server state
          const serverState = response.serverSession;
          const resolvedUpdate = localUpdate(serverState);

          // Update our local reference to server state
          const newBackendUpdate = {
            ...backendUpdate,
            // Extract only the fields we're updating from the resolved state
            ...(backendUpdate.flags && { flags: resolvedUpdate.flags }),
            ...(backendUpdate.stats && { stats: resolvedUpdate.stats }),
            ...(backendUpdate.world_time && { world_time: resolvedUpdate.world_time }),
          };

          // Recursively retry with incremented counter
          return applyOptimisticUpdate(
            () => resolvedUpdate, // Use pre-resolved update
            newBackendUpdate,
            retryCount + 1
          );
        }

        // 3b. No conflict - apply server truth
        if (response.session) {
          logger.info('Session update successful', { sessionId: gameSession.id, version: response.session.version });
          onUpdate?.(response.session);
          return response.session;
        }
      } catch (err) {
        // 3c. Rollback on error
        logger.error('Update failed, rolling back', err);
        onUpdate?.(gameSession);
        throw err;
      }
    }

    return localUpdate(gameSession);
  };

  // Build dynamic helpers from registry (allows custom extensions)
  const dynamicHelpers = sessionHelperRegistry.buildHelpersObject(gameSession);

  const cloneFlags = (flags: GameSessionDTO['flags']): GameSessionDTO['flags'] => {
    return JSON.parse(JSON.stringify(flags ?? {})) as GameSessionDTO['flags'];
  };

  const buildFlagsUpdate = (mutate: (session: GameSessionDTO) => void) => {
    const sessionCopy: GameSessionDTO = { ...gameSession, flags: cloneFlags(gameSession.flags) };
    mutate(sessionCopy);
    return { flags: sessionCopy.flags };
  };

  const toQuestStatus = (
    status: 'pending' | 'active' | 'completed' | 'failed' | 'not_started' | 'in_progress'
  ): 'not_started' | 'in_progress' | 'completed' | 'failed' => {
    if (status === 'pending') return 'not_started';
    if (status === 'active') return 'in_progress';
    return status;
  };

  const incrementQuestStepsBy = (
    session: GameSessionDTO,
    questId: string,
    increment: number
  ) => {
    if (increment <= 0) return;
    const current = getQuestState(session, questId);
    const currentSteps = current?.stepsCompleted ?? 0;
    updateQuestStepsCore(session, questId, currentSteps + increment);
  };

  /**
   * Generic stat update - works with any registered stat adapter.
   * New stat packs only need to register an adapter; no changes here.
   */
  const updateStat = async (
    source: StatSource,
    entityId: number | undefined,
    patch: unknown
  ): Promise<GameSessionDTO> => {
    const adapter = getAdapterBySource(source);

    if (!adapter?.set) {
      logger.warn(`Adapter for source "${source}" does not support writes`);
      return gameSession;
    }

    // Build optimistic update payload using adapter's session path
    const sessionPath = adapter.getSessionPath?.(entityId);

    // Use buildSessionPatch to transform high-level patch into storage shape
    // This ensures optimistic payload matches what set() actually stores
    const storagePatch = adapter.buildSessionPatch
      ? adapter.buildSessionPatch(patch, entityId)
      : patch;

    const optimisticPayload = sessionPath
      ? buildOptimisticPayload(gameSession, sessionPath, storagePatch)
      : { stats: gameSession.stats };

    return applyOptimisticUpdate(
      (session) => adapter.set!(session, entityId, patch),
      optimisticPayload
    );
  };

  /**
   * Generic stat read - looks up adapter by source and calls get().
   */
  const getStat = (source: StatSource, entityId?: number): unknown | null => {
    const adapter = getAdapterBySource(source);
    if (!adapter) {
      logger.warn(`No adapter registered for source "${source}"`);
      return null;
    }
    return adapter.get(gameSession, entityId);
  };

  // Return real helpers bound to this session
  // Generic getStat/updateStat for extensibility
  // Dynamic helpers are spread at the end to allow custom extensions
  return {
    // Generic stat read/write (extensible for new stat packs)
    getStat,
    updateStat,

    getInventory: () => getInventory(gameSession),

    addInventoryItem: async (itemId, quantity = 1) => {
      return applyOptimisticUpdate(
        (session) => {
          addInventoryItemCore(session, itemId, quantity);
          return session;
        },
        buildFlagsUpdate((session) => addInventoryItemCore(session, itemId, quantity))
      );
    },

    removeInventoryItem: async (itemId, quantity = 1) => {
      return applyOptimisticUpdate(
        (session) => {
          removeInventoryItemCore(session, itemId, quantity);
          return session;
        },
        buildFlagsUpdate((session) => removeInventoryItemCore(session, itemId, quantity))
      );
    },

    updateArcStage: async (arcId, stage) => {
      return applyOptimisticUpdate(
        (session) => {
          updateArcStageCore(session, arcId, stage);
          return session;
        },
        buildFlagsUpdate((session) => updateArcStageCore(session, arcId, stage))
      );
    },

    markSceneSeen: async (arcId, sceneId) => {
      return applyOptimisticUpdate(
        (session) => {
          markSceneSeenCore(session, arcId, sceneId);
          return session;
        },
        buildFlagsUpdate((session) => markSceneSeenCore(session, arcId, sceneId))
      );
    },

    updateQuestStatus: async (questId, status) => {
      const mappedStatus = toQuestStatus(status);
      return applyOptimisticUpdate(
        (session) => {
          updateQuestStatusCore(session, questId, mappedStatus);
          return session;
        },
        buildFlagsUpdate((session) => updateQuestStatusCore(session, questId, mappedStatus))
      );
    },

    incrementQuestSteps: async (questId, increment = 1) => {
      return applyOptimisticUpdate(
        (session) => {
          incrementQuestStepsBy(session, questId, increment);
          return session;
        },
        buildFlagsUpdate((session) => {
          incrementQuestStepsBy(session, questId, increment);
        })
      );
    },

    triggerEvent: async (eventId) => {
      return applyOptimisticUpdate(
        (session) => {
          triggerEventCore(session, eventId);
          return session;
        },
        buildFlagsUpdate((session) => triggerEventCore(session, eventId))
      );
    },

    endEvent: async (eventId) => {
      return applyOptimisticUpdate(
        (session) => {
          endEventCore(session, eventId);
          return session;
        },
        buildFlagsUpdate((session) => endEventCore(session, eventId))
      );
    },

    isEventActive: (eventId) => isEventActive(gameSession, eventId),

    // Spread dynamic helpers from registry (allows custom extensions)
    ...dynamicHelpers,
  } as SessionHelpers;
}
