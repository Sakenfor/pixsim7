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

/**
 * Execute an interaction (convenience wrapper)
 */
export async function executeInteraction(
  worldId: number,
  sessionId: number,
  npcId: number,
  interactionId: string,
  playerInput?: string,
  context?: Record<string, unknown>
): Promise<ExecuteInteractionResponse> {
  return executeNpcInteraction({
    worldId,
    sessionId,
    npcId,
    interactionId,
    playerInput,
    context,
  });
}

/**
 * Get pending dialogue requests from a session
 */
export async function getPendingDialogue(
  sessionId: number
): Promise<Array<{
  requestId: string;
  npcId: number;
  programId: string;
  systemPrompt?: string;
  llmPrompt: string;
  visualPrompt?: string;
  playerInput?: string;
  branchIntent?: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}>> {
  const response = await apiClient.get(
    `/api/v1/game/sessions/${sessionId}`
  );
  const session = response.data;
  return session.flags?.pendingDialogue || [];
}

/**
 * Execute a pending dialogue request via LLM
 */
export async function executePendingDialogue(
  sessionId: number,
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
  const response = await apiClient.post('/api/v1/game/dialogue/next-line/execute', {
    npc_id: request.npcId,
    session_id: sessionId,
    player_input: request.playerInput,
    program_id: request.programId,
  });

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
  sessionId: number,
  requestId: string
): Promise<void> {
  // This would need a backend endpoint to modify session flags
  // For now, we'll handle it client-side by filtering
  const response = await apiClient.get(
    `/api/v1/game/sessions/${sessionId}`
  );
  const session = response.data;
  const pending = session.flags?.pendingDialogue || [];
  const filtered = pending.filter((r: any) => r.requestId !== requestId);

  await apiClient.patch(`/api/v1/game/sessions/${sessionId}`, {
    flags: {
      ...session.flags,
      pendingDialogue: filtered,
    },
  });
}
