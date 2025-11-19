/**
 * NPC Interactions API Client
 *
 * Phase 17.3+: Client-side API for listing and executing NPC interactions
 */

import type {
  ListInteractionsRequest,
  ListInteractionsResponse,
  ExecuteInteractionRequest,
  ExecuteInteractionResponse,
  NpcInteractionInstance,
} from '@pixsim7/types';
import { apiClient } from './client';

/**
 * List available interactions for an NPC
 */
export async function listNpcInteractions(
  req: ListInteractionsRequest
): Promise<ListInteractionsResponse> {
  const response = await apiClient.post<ListInteractionsResponse>(
    '/api/v1/game/interactions/list',
    req
  );
  return response.data;
}

/**
 * Execute an NPC interaction
 */
export async function executeNpcInteraction(
  req: ExecuteInteractionRequest
): Promise<ExecuteInteractionResponse> {
  const response = await apiClient.post<ExecuteInteractionResponse>(
    '/api/v1/game/interactions/execute',
    req
  );
  return response.data;
}

/**
 * Get available interactions (convenience wrapper)
 */
export async function getAvailableInteractions(
  worldId: number,
  sessionId: number,
  npcId: number,
  locationId?: number
): Promise<NpcInteractionInstance[]> {
  const response = await listNpcInteractions({
    worldId,
    sessionId,
    npcId,
    locationId,
    includeUnavailable: false,
  });
  return response.interactions;
}

/**
 * Get all interactions including unavailable (for debugging)
 */
export async function getAllInteractions(
  worldId: number,
  sessionId: number,
  npcId: number,
  locationId?: number
): Promise<NpcInteractionInstance[]> {
  const response = await listNpcInteractions({
    worldId,
    sessionId,
    npcId,
    locationId,
    includeUnavailable: true,
  });
  return response.interactions;
}
