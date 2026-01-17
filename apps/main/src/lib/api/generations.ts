/**
 * Generations API Client
 *
 * Canonical API client for the unified /api/v1/generations endpoint.
 * Uses OpenAPI-generated types for type safety and contract alignment.
 */
import { createGenerationsApi } from '@pixsim7/shared.api-client/domains';
import type {
  CreateGenerationRequest,
  GenerationListResponse,
  GenerationResponse,
  ListGenerationsQuery,
  GenerationSocialContext,
} from '@pixsim7/shared.api-client/domains';

import { toSnakeCaseDeep } from '@pixsim7/shared.helpers.core';

import { usePromptSettingsStore } from '@features/prompts';

import { pixsimClient } from './client';

export type {
  GenerationResponse,
  GenerationListResponse,
  CreateGenerationRequest,
  GenerationStatus,
  OperationType,
  GenerationNodeConfigSchema,
  GenerationSocialContext,
  SceneRef,
  PlayerContextSnapshot,
  ListGenerationsQuery,
} from '@pixsim7/shared.api-client/domains';

// ============================================================================
// Legacy Type Re-exports (for backward compatibility)
// ============================================================================

export type {
  GenerationNodeConfig,
  GenerateContentRequest,
  GenerateContentResponse,
} from '@lib/registries';

const generationsApi = createGenerationsApi(pixsimClient);

// ============================================================================
// API Functions
// ============================================================================

/**
 * Create a new generation
 *
 * Automatically includes analyzer_id from prompt settings if not explicitly provided.
 */
export async function createGeneration(
  request: CreateGenerationRequest
): Promise<GenerationResponse> {
  // Auto-include analyzer_id from settings if not provided and auto-analyze is enabled
  const settings = usePromptSettingsStore.getState();
  const enrichedRequest = { ...request };

  if (!enrichedRequest.analyzer_id && settings.autoAnalyze) {
    enrichedRequest.analyzer_id = settings.defaultAnalyzer;
  }

  return generationsApi.createGeneration(toSnakeCaseDeep(enrichedRequest));
}

/**
 * Get generation by ID
 */
export async function getGeneration(id: number): Promise<GenerationResponse> {
  return generationsApi.getGeneration(id);
}

/**
 * List generations with filters
 */
export async function listGenerations(query?: ListGenerationsQuery): Promise<GenerationListResponse> {
  return generationsApi.listGenerations(query);
}

/**
 * Cancel a generation
 */
export async function cancelGeneration(id: number): Promise<GenerationResponse> {
  return generationsApi.cancelGeneration(id);
}

/**
 * Retry a failed generation
 *
 * Creates a new generation with the same parameters.
 * Useful for content filter rejections or temporary errors.
 */
export async function retryGeneration(id: number): Promise<GenerationResponse> {
  return generationsApi.retryGeneration(id);
}

/**
 * Delete a generation
 *
 * Permanently removes a generation from the database.
 * Only terminal generations (completed, failed, cancelled) can be deleted.
 */
export async function deleteGeneration(id: number): Promise<void> {
  await generationsApi.deleteGeneration(id);
}

/**
 * Validate a generation config without creating it
 */
export async function validateGenerationConfig(
  request: CreateGenerationRequest
): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}> {
  return generationsApi.validateGenerationConfig(toSnakeCaseDeep(request));
}

/**
 * Build social context from relationship state
 */
type BuildSocialContextParams =
  | {
      world_id: number;
      session_id?: number;
      npc_id?: string;
      user_max_rating?: string;
    }
  | {
      worldId: number;
      sessionId?: number;
      npcId?: string;
      userMaxRating?: string;
    };

export async function buildSocialContext(
  params: BuildSocialContextParams
): Promise<GenerationSocialContext> {
  return generationsApi.buildSocialContext(
    toSnakeCaseDeep(params) as {
      world_id: number;
      session_id?: number;
      npc_id?: string;
      user_max_rating?: string;
    }
  );
}
