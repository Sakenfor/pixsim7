/**
 * Interactions API Domain Client
 *
 * Uses canonical interaction contracts from @pixsim7/shared.types.
 * Request/response payloads are normalized at the boundary to tolerate
 * snake_case and camelCase backend serialization differences.
 */
import type { PixSimApiClient } from '../client';
import type {
  InteractionParticipant as SharedInteractionParticipant,
  InteractionTarget as SharedInteractionTarget,
  InteractionInstance as SharedInteractionInstance,
  ListInteractionsRequest as SharedListInteractionsRequest,
  ListInteractionsResponse as SharedListInteractionsResponse,
  ExecuteInteractionRequest as SharedExecuteInteractionRequest,
  ExecuteInteractionResponse as SharedExecuteInteractionResponse,
} from '@pixsim7/shared.types';
import { toCamelCaseDeep } from '@pixsim7/shared.helpers.core';

// ===== Canonical Shared Types =====

export type InteractionParticipant = SharedInteractionParticipant;
export type InteractionTarget = SharedInteractionTarget;
export type InteractionInstance = SharedInteractionInstance;
export type ListInteractionsRequest = SharedListInteractionsRequest;
export type ListInteractionsResponse = SharedListInteractionsResponse;
export type ExecuteInteractionRequest = SharedExecuteInteractionRequest;
export type ExecuteInteractionResponse = SharedExecuteInteractionResponse;

// ===== Backward-compatible Legacy Types =====

/**
 * @deprecated Legacy pre-unified shape; keep only for compatibility.
 */
export interface InteractionCondition {
  type: string;
  params: Record<string, unknown>;
  satisfied: boolean;
  reason?: string;
}

/**
 * @deprecated Legacy pre-unified shape; keep only for compatibility.
 */
export interface InteractionEffect {
  type: string;
  params: Record<string, unknown>;
}

/**
 * @deprecated Pending dialogue is stored on session flags and read via app wrapper.
 */
export interface PendingDialogueRequest {
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
}

export interface DialogueExecutionResponse {
  text: string;
  cached: boolean;
  generationTimeMs?: number;
  generation_time_ms?: number;
}

interface DialogueExecutionResponseDto {
  text?: string;
  cached?: boolean;
  generation_time_ms?: number;
  generationTimeMs?: number;
}

function normalizeListInteractionsResponse(raw: unknown): ListInteractionsResponse {
  return toCamelCaseDeep(raw as Record<string, unknown>) as unknown as ListInteractionsResponse;
}

function normalizeExecuteInteractionResponse(raw: unknown): ExecuteInteractionResponse {
  return toCamelCaseDeep(raw as Record<string, unknown>) as unknown as ExecuteInteractionResponse;
}

function normalizeDialogueExecutionResponse(raw: DialogueExecutionResponseDto): DialogueExecutionResponse {
  const camel = toCamelCaseDeep(raw as Record<string, unknown>) as {
    text?: string;
    cached?: boolean;
    generationTimeMs?: number;
  };
  return {
    text: camel.text ?? '',
    cached: Boolean(camel.cached),
    generationTimeMs: camel.generationTimeMs,
    generation_time_ms: camel.generationTimeMs,
  };
}

// ===== Interactions API Factory =====

export function createInteractionsApi(client: PixSimApiClient) {
  return {
    /**
     * List available interactions for a target.
     */
    async listInteractions(req: ListInteractionsRequest): Promise<ListInteractionsResponse> {
      const raw = await client.post<unknown>('/game/interactions/list', req);
      return normalizeListInteractionsResponse(raw);
    },

    /**
     * Execute an interaction.
     */
    async executeInteraction(req: ExecuteInteractionRequest): Promise<ExecuteInteractionResponse> {
      const raw = await client.post<unknown>('/game/interactions/execute', req);
      return normalizeExecuteInteractionResponse(raw);
    },

    /**
     * Get available interactions (convenience method, filters unavailable).
     */
    async getAvailableInteractions(
      worldId: number,
      sessionId: number,
      options?: {
        target?: InteractionTarget;
        locationId?: number;
        participants?: InteractionParticipant[];
        primaryRole?: string;
      }
    ): Promise<InteractionInstance[]> {
      const response = await this.listInteractions({
        worldId,
        sessionId,
        target: options?.target,
        locationId: options?.locationId,
        participants: options?.participants,
        primaryRole: options?.primaryRole,
        includeUnavailable: false,
      });
      return response.interactions || [];
    },

    /**
     * Get all interactions including unavailable (for debugging/dev tools).
     */
    async getAllInteractions(
      worldId: number,
      sessionId: number,
      options?: {
        target?: InteractionTarget;
        locationId?: number;
        participants?: InteractionParticipant[];
        primaryRole?: string;
      }
    ): Promise<InteractionInstance[]> {
      const response = await this.listInteractions({
        worldId,
        sessionId,
        target: options?.target,
        locationId: options?.locationId,
        participants: options?.participants,
        primaryRole: options?.primaryRole,
        includeUnavailable: true,
      });
      return response.interactions || [];
    },

    // ===== Dialogue =====

    /**
     * Execute dialogue generation for an NPC.
     */
    async executeDialogue(params: {
      npcId: number;
      sessionId: number;
      playerInput?: string;
      programId?: string;
    }): Promise<DialogueExecutionResponse> {
      const raw = await client.post<DialogueExecutionResponseDto>('/game/dialogue/next-line/execute', {
        npc_id: params.npcId,
        session_id: params.sessionId,
        player_input: params.playerInput,
        program_id: params.programId,
      });
      return normalizeDialogueExecutionResponse(raw);
    },
  };
}
