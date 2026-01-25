/**
 * Interactions API Client
 *
 * Phase 17.3+: Client-side API for listing and executing interactions
 */

import { toSnakeCaseDeep } from '@pixsim7/shared.helpers.core';
import { IDs } from '@pixsim7/shared.types';
import type {
  ListInteractionsRequest,
  ListInteractionsResponse,
  ExecuteInteractionRequest,
  ExecuteInteractionResponse,
  InteractionParticipant,
  InteractionTarget,
  InteractionInstance,
  GameSessionDTO,
} from '@pixsim7/shared.types';

import { apiClient } from './client';

/**
 * List available interactions for a target
 */
export async function listInteractions(
  req: ListInteractionsRequest
): Promise<ListInteractionsResponse> {
  const response = await apiClient.post<ListInteractionsResponse>(
    '/game/interactions/list',
    req
  );
  return response.data;
}

/**
 * Execute an interaction
 */
export async function executeInteraction(
  req: ExecuteInteractionRequest
): Promise<ExecuteInteractionResponse> {
  const response = await apiClient.post<ExecuteInteractionResponse>(
    '/game/interactions/execute',
    req
  );
  return response.data;
}

/**
 * Get available interactions (convenience wrapper)
 */
export async function getAvailableInteractions(
  worldId: IDs.WorldId,
  sessionId: IDs.SessionId,
  target?: InteractionTarget,
  locationId?: IDs.LocationId,
  participants?: InteractionParticipant[],
  primaryRole?: string
): Promise<InteractionInstance[]> {
  const response = await listInteractions({
    worldId,
    sessionId,
    target,
    participants,
    primaryRole,
    locationId,
    includeUnavailable: false,
  });
  return response.interactions;
}

/**
 * Get all interactions including unavailable (for debugging)
 */
export async function getAllInteractions(
  worldId: IDs.WorldId,
  sessionId: IDs.SessionId,
  target?: InteractionTarget,
  locationId?: IDs.LocationId,
  participants?: InteractionParticipant[],
  primaryRole?: string
): Promise<InteractionInstance[]> {
  const response = await listInteractions({
    worldId,
    sessionId,
    target,
    participants,
    primaryRole,
    locationId,
    includeUnavailable: true,
  });
  return response.interactions;
}

/**
 * Get pending dialogue requests from a session
 */
export async function getPendingDialogue(
  sessionId: IDs.SessionId
): Promise<Array<{
  requestId: string;
  npcId: IDs.NpcId;
  programId: string;
  systemPrompt?: string;
  llmPrompt: string;
  visualPrompt?: string;
  playerInput?: string;
  branchIntent?: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}>> {
  const response = await apiClient.get<GameSessionDTO>(
    `/game/sessions/${sessionId}`
  );
  const session = response.data;
  const pending = session.flags?.pendingDialogue as Array<{
    requestId: string;
    npcId: IDs.NpcId;
    programId: string;
    systemPrompt?: string;
    llmPrompt: string;
    visualPrompt?: string;
    playerInput?: string;
    branchIntent?: string;
    createdAt: number;
    metadata?: Record<string, unknown>;
  }> | undefined;
  return pending ?? [];
}

/**
 * Execute a pending dialogue request via LLM
 */
export async function executePendingDialogue(
  sessionId: IDs.SessionId,
  requestId: string
): Promise<{
  text: string;
  cached: boolean;
  generationTimeMs?: number;
  requestId: string;
}> {
  const pending = await getPendingDialogue(sessionId);
  const request = pending.find((r) => r.requestId === requestId);

  if (!request) {
    throw new Error(`Pending dialogue request ${requestId} not found`);
  }

  // Call the dialogue generation endpoint directly
  const payload = toSnakeCaseDeep({
    npcId: request.npcId,
    sessionId,
    playerInput: request.playerInput,
    programId: request.programId,
  });
  const response = await apiClient.post<{
    text: string;
    cached: boolean;
    generation_time_ms?: number;
  }>('/game/dialogue/next-line/execute', payload);

  return {
    text: response.data.text,
    cached: response.data.cached,
    generationTimeMs: response.data.generation_time_ms,
    requestId,
  };
}

/**
 * Clear a pending dialogue request from session
 */
export async function clearPendingDialogue(
  sessionId: IDs.SessionId,
  requestId: string
): Promise<void> {
  // This would need a backend endpoint to modify session flags
  // For now, we'll handle it client-side by filtering
  const response = await apiClient.get<GameSessionDTO>(
    `/game/sessions/${sessionId}`
  );
  const session = response.data;
  const pending = (session.flags?.pendingDialogue as Array<{ requestId: string }> | undefined) ?? [];
  const filtered = pending.filter((r) => r.requestId !== requestId);

  await apiClient.patch(`/game/sessions/${sessionId}`, {
    flags: {
      ...session.flags,
      pendingDialogue: filtered,
    },
  });
}
