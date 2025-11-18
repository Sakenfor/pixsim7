/**
 * Session Adapter
 *
 * Creates SessionHelpers instance for InteractionContext.
 * Binds game-core helpers to a specific GameSession, providing
 * a clean API for plugins without requiring direct imports.
 */

import type { GameSessionDTO } from '../../api/game';
import type { SessionHelpers } from './types';
import {
  getNpcRelationshipState,
  setNpcRelationshipState,
  getInventory,
  addInventoryItem,
  removeInventoryItem,
  updateArcStage,
  markSceneSeen,
  updateQuestStatus,
  incrementQuestSteps,
  triggerEvent,
  endEvent,
  isEventActive,
} from '@pixsim7/game-core';

/**
 * Create session helpers bound to a specific game session
 */
export function createSessionHelpers(gameSession: GameSessionDTO | null): SessionHelpers {
  // If no session, return no-op helpers
  if (!gameSession) {
    return {
      getNpcRelationship: () => null,
      updateNpcRelationship: () => gameSession!,
      getInventory: () => [],
      addInventoryItem: () => gameSession!,
      removeInventoryItem: () => gameSession!,
      updateArcStage: () => gameSession!,
      markSceneSeen: () => gameSession!,
      updateQuestStatus: () => gameSession!,
      incrementQuestSteps: () => gameSession!,
      triggerEvent: () => gameSession!,
      endEvent: () => gameSession!,
      isEventActive: () => false,
    };
  }

  // Return real helpers bound to this session
  return {
    getNpcRelationship: (npcId) => getNpcRelationshipState(gameSession, npcId),

    updateNpcRelationship: (npcId, patch) =>
      setNpcRelationshipState(gameSession, npcId, patch),

    getInventory: () => getInventory(gameSession),

    addInventoryItem: (itemId, quantity = 1) =>
      addInventoryItem(gameSession, itemId, quantity),

    removeInventoryItem: (itemId, quantity = 1) =>
      removeInventoryItem(gameSession, itemId, quantity),

    updateArcStage: (arcId, stage) => updateArcStage(gameSession, arcId, stage),

    markSceneSeen: (arcId, sceneId) => markSceneSeen(gameSession, arcId, sceneId),

    updateQuestStatus: (questId, status) =>
      updateQuestStatus(gameSession, questId, status),

    incrementQuestSteps: (questId, increment = 1) =>
      incrementQuestSteps(gameSession, questId, increment),

    triggerEvent: (eventId) => triggerEvent(gameSession, eventId),

    endEvent: (eventId) => endEvent(gameSession, eventId),

    isEventActive: (eventId) => isEventActive(gameSession, eventId),
  };
}
