/**
 * Generations API Client
 *
 * Canonical API client for the unified /api/v1/generations endpoint.
 * Uses OpenAPI-generated types for type safety and contract alignment.
 */
import { createGenerationsApi } from '@pixsim7/shared.api.client/domains';
import type {
  CreateGenerationRequest,
  GenerationListResponse,
  GenerationResponse,
  ListGenerationsQuery,
  GenerationSocialContext,
} from '@pixsim7/shared.api.client/domains';
import { toSnakeCaseDeep } from '@pixsim7/shared.helpers.core';

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
} from '@pixsim7/shared.api.client/domains';

// ============================================================================
// Legacy Type Re-exports (for backward compatibility)
// ============================================================================

export type {
  GenerationNodeConfig,
  GenerateContentRequest,
  GenerateContentResponse,
} from '@pixsim7/shared.types';

const generationsApi = createGenerationsApi(pixsimClient);

// ============================================================================
// API Functions
// ============================================================================

/**
 * Create a new generation
 */
export async function createGeneration(
  request: CreateGenerationRequest
): Promise<GenerationResponse> {
  return generationsApi.createGeneration(toSnakeCaseDeep(request));
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

/** Backend statuses that are still "active" (running or queued to run). `paused`
 *  is intentionally excluded — a paused generation isn't consuming a slot and is
 *  resumed explicitly, so it isn't part of "cancel everything running". */
const ACTIVE_BACKEND_STATUSES = ['pending', 'processing'] as const;
const ACTIVE_FETCH_PAGE_SIZE = 200;
/** Safety cap so a paging bug can never loop forever (200 * 50 = 10k rows/status). */
const ACTIVE_FETCH_MAX_PAGES = 50;

/**
 * Fetch the IDs of every active (pending/processing) generation for the current
 * user, paging past the panel's fixed display window.
 *
 * The activity panel only loads a bounded page of generations, so a batch cancel
 * driven off the store misses anything outside that window — fanout/"Each" items
 * that registered after the fetch, older still-running rows, etc. "Cancel all
 * active" uses this to reach them so a cancel can't silently leave work running.
 */
export async function fetchAllActiveGenerationIds(): Promise<number[]> {
  const ids = new Set<number>();
  for (const status of ACTIVE_BACKEND_STATUSES) {
    let offset = 0;
    for (let page = 0; page < ACTIVE_FETCH_MAX_PAGES; page++) {
      const res = await listGenerations({
        status: status as ListGenerationsQuery['status'],
        limit: ACTIVE_FETCH_PAGE_SIZE,
        offset,
      });
      const batch = res.generations ?? [];
      for (const g of batch) {
        if (typeof g.id === 'number') ids.add(g.id);
      }
      if (batch.length < ACTIVE_FETCH_PAGE_SIZE) break;
      offset += ACTIVE_FETCH_PAGE_SIZE;
    }
  }
  return Array.from(ids);
}

/**
 * Cancel a generation
 */
export async function cancelGeneration(id: number): Promise<GenerationResponse> {
  return generationsApi.cancelGeneration(id);
}

/**
 * Pause a pending generation
 */
export async function pauseGeneration(id: number): Promise<GenerationResponse> {
  return generationsApi.pauseGeneration(id);
}

/**
 * Resume a paused generation
 */
export async function resumeGeneration(id: number): Promise<GenerationResponse> {
  return generationsApi.resumeGeneration(id);
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
 * Patch a generation's prompt text.
 *
 * Updates final_prompt, raw_params.prompt, and canonical_params.prompt on the server.
 */
export async function patchGenerationPrompt(id: number, prompt: string): Promise<GenerationResponse> {
  return generationsApi.patchGenerationPrompt(id, prompt);
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
