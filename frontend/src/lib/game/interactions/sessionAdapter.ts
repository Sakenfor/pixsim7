/**
 * Session Adapter
 *
 * Creates SessionHelpers instance for InteractionContext.
 * Binds game-core helpers to a specific GameSession, providing
 * a clean API for plugins without requiring direct imports.
 *
 * Implements optimistic updates:
 * 1. Apply change locally (instant UI)
 * 2. Send to backend for validation
 * 3. Apply server truth or rollback on error
 */

import type { GameSessionDTO } from '../../api/game';
import type { SessionHelpers, SessionAPI } from './types';
import {
  getNpcRelationshipState,
  setNpcRelationshipState,
  getInventory,
  addInventoryItem as addInventoryItemCore,
  removeInventoryItem as removeInventoryItemCore,
  updateArcStage as updateArcStageCore,
  markSceneSeen as markSceneSeenCore,
  updateQuestStatus as updateQuestStatusCore,
  incrementQuestSteps as incrementQuestStepsCore,
  triggerEvent as triggerEventCore,
  endEvent as endEventCore,
  isEventActive,
} from '@pixsim7/game-core';

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
      getNpcRelationship: () => null,
      updateNpcRelationship: async () => gameSession!,
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
   * Generic optimistic update pattern with conflict resolution
   * @param localUpdate - Function to apply change optimistically
   * @param backendUpdate - Partial session update to send to backend
   */
  const applyOptimisticUpdate = async (
    localUpdate: (session: GameSessionDTO) => GameSessionDTO,
    backendUpdate: Partial<GameSessionDTO>
  ): Promise<GameSessionDTO> => {
    // 1. Optimistic update (instant UI)
    const optimistic = localUpdate(gameSession);
    onUpdate?.(optimistic);

    // 2. Backend validation (if API available)
    if (api) {
      try {
        // Include version for optimistic locking
        const response = await api.updateSession(gameSession.id, {
          ...backendUpdate,
          expectedVersion: (gameSession as any).version,
        });

        // 3a. Handle version conflicts
        if (response.conflict && response.serverSession) {
          // Server session is newer - apply conflict resolution
          const resolved = await resolveConflict(gameSession, response.serverSession, localUpdate);

          // Retry update with resolved state
          const retryResponse = await api.updateSession(gameSession.id, {
            ...backendUpdate,
            expectedVersion: (response.serverSession as any).version,
          });

          onUpdate?.(retryResponse);
          return retryResponse;
        }

        // 3b. No conflict - apply server truth
        onUpdate?.(response);
        return response;
      } catch (err) {
        // 3c. Rollback on error
        onUpdate?.(gameSession);
        throw err;
      }
    }

    return optimistic;
  };

  /**
   * Resolve conflicts between local and server state
   * Strategy: Apply local changes on top of server state (last-write-wins with merge)
   */
  const resolveConflict = async (
    localSession: GameSessionDTO,
    serverSession: GameSessionDTO,
    localUpdate: (session: GameSessionDTO) => GameSessionDTO
  ): Promise<GameSessionDTO> => {
    // Re-apply local changes on top of server state
    const resolved = localUpdate(serverSession);
    return resolved;
  };

  // Return real helpers bound to this session
  return {
    getNpcRelationship: (npcId) => getNpcRelationshipState(gameSession, npcId),

    updateNpcRelationship: async (npcId, patch) => {
      return applyOptimisticUpdate(
        (session) => setNpcRelationshipState(session, npcId, patch),
        {
          relationships: {
            ...gameSession.relationships,
            [`npc:${npcId}`]: {
              ...(gameSession.relationships[`npc:${npcId}`] || {}),
              ...patch,
            },
          },
        }
      );
    },

    getInventory: () => getInventory(gameSession),

    addInventoryItem: async (itemId, quantity = 1) => {
      return applyOptimisticUpdate(
        (session) => addInventoryItemCore(session, itemId, quantity),
        { flags: addInventoryItemCore(gameSession, itemId, quantity).flags }
      );
    },

    removeInventoryItem: async (itemId, quantity = 1) => {
      return applyOptimisticUpdate(
        (session) => removeInventoryItemCore(session, itemId, quantity),
        { flags: removeInventoryItemCore(gameSession, itemId, quantity).flags }
      );
    },

    updateArcStage: async (arcId, stage) => {
      return applyOptimisticUpdate(
        (session) => updateArcStageCore(session, arcId, stage),
        { flags: updateArcStageCore(gameSession, arcId, stage).flags }
      );
    },

    markSceneSeen: async (arcId, sceneId) => {
      return applyOptimisticUpdate(
        (session) => markSceneSeenCore(session, arcId, sceneId),
        { flags: markSceneSeenCore(gameSession, arcId, sceneId).flags }
      );
    },

    updateQuestStatus: async (questId, status) => {
      return applyOptimisticUpdate(
        (session) => updateQuestStatusCore(session, questId, status),
        { flags: updateQuestStatusCore(gameSession, questId, status).flags }
      );
    },

    incrementQuestSteps: async (questId, increment = 1) => {
      return applyOptimisticUpdate(
        (session) => incrementQuestStepsCore(session, questId, increment),
        { flags: incrementQuestStepsCore(gameSession, questId, increment).flags }
      );
    },

    triggerEvent: async (eventId) => {
      return applyOptimisticUpdate(
        (session) => triggerEventCore(session, eventId),
        { flags: triggerEventCore(gameSession, eventId).flags }
      );
    },

    endEvent: async (eventId) => {
      return applyOptimisticUpdate(
        (session) => endEventCore(session, eventId),
        { flags: endEventCore(gameSession, eventId).flags }
      );
    },

    isEventActive: (eventId) => isEventActive(gameSession, eventId),
  };
}
