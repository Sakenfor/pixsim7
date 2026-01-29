/**
 * Interactions API Domain Client
 *
 * Provides typed access to NPC interaction endpoints including
 * listing available interactions, executing them, and handling dialogue.
 */
import type { PixSimApiClient } from '../client';

// ===== Interaction Types =====

export interface InteractionParticipant {
  role: string;
  npcId?: number;
  entityId?: string;
}

export interface InteractionTarget {
  type: 'npc' | 'location' | 'item' | 'self';
  id?: number | string;
}

export interface InteractionCondition {
  type: string;
  params: Record<string, unknown>;
  satisfied: boolean;
  reason?: string;
}

export interface InteractionEffect {
  type: string;
  params: Record<string, unknown>;
}

export interface InteractionInstance {
  id: string;
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  available: boolean;
  conditions: InteractionCondition[];
  effects: InteractionEffect[];
  priority?: number;
  tags?: string[];
  pluginId?: string;
}

export interface ListInteractionsRequest {
  worldId: number;
  sessionId: number;
  target?: InteractionTarget;
  participants?: InteractionParticipant[];
  primaryRole?: string;
  locationId?: number;
  includeUnavailable?: boolean;
}

export interface ListInteractionsResponse {
  interactions: InteractionInstance[];
  total: number;
  availableCount: number;
}

export interface ExecuteInteractionRequest {
  worldId: number;
  sessionId: number;
  interactionId: string;
  target?: InteractionTarget;
  participants?: InteractionParticipant[];
  params?: Record<string, unknown>;
}

export interface ExecuteInteractionResponse {
  success: boolean;
  effects: Array<{
    type: string;
    applied: boolean;
    result?: unknown;
    error?: string;
  }>;
  sessionUpdated: boolean;
  newSessionVersion?: number;
}

// ===== Dialogue Types =====

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
  generation_time_ms?: number;
}

// ===== Interactions API Factory =====

export function createInteractionsApi(client: PixSimApiClient) {
  return {
    /**
     * List available interactions for a target.
     */
    async listInteractions(req: ListInteractionsRequest): Promise<ListInteractionsResponse> {
      return client.post<ListInteractionsResponse>('/game/interactions/list', req);
    },

    /**
     * Execute an interaction.
     */
    async executeInteraction(req: ExecuteInteractionRequest): Promise<ExecuteInteractionResponse> {
      return client.post<ExecuteInteractionResponse>('/game/interactions/execute', req);
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
      return response.interactions;
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
      return response.interactions;
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
      return client.post<DialogueExecutionResponse>('/game/dialogue/next-line/execute', {
        npc_id: params.npcId,
        session_id: params.sessionId,
        player_input: params.playerInput,
        program_id: params.programId,
      });
    },
  };
}
