/**
 * Interactions API Client
 *
 * Wraps the shared domain client with app-specific helpers for dialogue management.
 */
import { createInteractionsApi, createGameApi } from '@pixsim7/shared.api.client/domains';
import { IDs } from '@pixsim7/shared.types';
import type {
  ListInteractionsRequest,
  ListInteractionsResponse,
  ExecuteInteractionRequest,
  ExecuteInteractionResponse,
  InteractionParticipant,
  InteractionTarget,
  InteractionInstance,
} from '@pixsim7/shared.types';

import { pixsimClient } from './client';

// Create shared domain API instances
const interactionsApi = createInteractionsApi(pixsimClient);
const gameApi = createGameApi(pixsimClient);

// =============================================================================
// Core Interactions API (delegating to shared client)
// =============================================================================

/**
 * List available interactions for a target
 */
export async function listInteractions(
  req: ListInteractionsRequest
): Promise<ListInteractionsResponse> {
  return interactionsApi.listInteractions(req);
}

/**
 * Execute an interaction
 */
export async function executeInteraction(
  req: ExecuteInteractionRequest
): Promise<ExecuteInteractionResponse> {
  return interactionsApi.executeInteraction(req);
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
  return interactionsApi.getAvailableInteractions(worldId, sessionId, {
    target,
    locationId,
    participants,
    primaryRole,
  });
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
  return interactionsApi.getAllInteractions(worldId, sessionId, {
    target,
    locationId,
    participants,
    primaryRole,
  });
}

// =============================================================================
// App-specific Dialogue Management
// =============================================================================

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
  const session = await gameApi.getSession(sessionId);
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

  // Use the shared dialogue execution
  const response = await interactionsApi.executeDialogue({
    npcId: request.npcId,
    sessionId,
    playerInput: request.playerInput,
    programId: request.programId,
  });

  return {
    text: response.text,
    cached: response.cached,
    generationTimeMs: response.generationTimeMs ?? response.generation_time_ms,
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
  const session = await gameApi.getSession(sessionId);
  const pending = (session.flags?.pendingDialogue as Array<{ requestId: string }> | undefined) ?? [];
  const filtered = pending.filter((r) => r.requestId !== requestId);

  await pixsimClient.patch(`/game/sessions/${sessionId}`, {
    flags: {
      ...session.flags,
      pendingDialogue: filtered,
    },
  });
}
