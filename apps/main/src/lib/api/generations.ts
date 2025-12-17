/**
 * Generations API Client
 *
 * Canonical API client for the unified /api/v1/generations endpoint.
 * Uses OpenAPI-generated types for type safety and contract alignment.
 */
import { apiClient } from './client';
import { usePromptSettingsStore } from '@/stores/promptSettingsStore';
import type { ApiComponents, ApiOperations } from '@pixsim7/shared.types';

// ============================================================================
// OpenAPI-Derived Types (Generated from backend contract)
// ============================================================================

export type GenerationResponse = ApiComponents['schemas']['GenerationResponse'];
export type GenerationListResponse = ApiComponents['schemas']['GenerationListResponse'];
export type CreateGenerationRequest = ApiComponents['schemas']['CreateGenerationRequest'];
export type GenerationStatus = ApiComponents['schemas']['GenerationStatus'];
export type OperationType = ApiComponents['schemas']['OperationType'];
export type GenerationNodeConfigSchema = ApiComponents['schemas']['GenerationNodeConfigSchema'];
export type GenerationSocialContext = ApiComponents['schemas']['GenerationSocialContextSchema'];
export type SceneRef = ApiComponents['schemas']['SceneRefSchema'];
export type PlayerContextSnapshot = ApiComponents['schemas']['PlayerContextSnapshotSchema'];

export type ListGenerationsQuery =
  ApiOperations['list_generations_api_v1_generations_get']['parameters']['query'];

// ============================================================================
// Legacy Type Re-exports (for backward compatibility)
// ============================================================================

export type {
  GenerationNodeConfig,
  GenerateContentRequest,
  GenerateContentResponse,
} from '@lib/registries';

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

  const res = await apiClient.post<GenerationResponse>('/generations?_=new', enrichedRequest);
  return res.data;
}

/**
 * Get generation by ID
 */
export async function getGeneration(id: number): Promise<GenerationResponse> {
  const res = await apiClient.get<GenerationResponse>(`/generations/${id}?_=details`);
  return res.data;
}

/**
 * List generations with filters
 */
export async function listGenerations(query?: ListGenerationsQuery): Promise<GenerationListResponse> {
  const res = await apiClient.get<GenerationListResponse>('/generations', {
    params: { ...query, _: 'list' },
  });
  return res.data;
}

/**
 * Cancel a generation
 */
export async function cancelGeneration(id: number): Promise<GenerationResponse> {
  const res = await apiClient.post<GenerationResponse>(`/generations/${id}/cancel?_=cancel`);
  return res.data;
}

/**
 * Retry a failed generation
 *
 * Creates a new generation with the same parameters.
 * Useful for content filter rejections or temporary errors.
 */
export async function retryGeneration(id: number): Promise<GenerationResponse> {
  const res = await apiClient.post<GenerationResponse>(`/generations/${id}/retry?_=retry`);
  return res.data;
}

/**
 * Delete a generation
 *
 * Permanently removes a generation from the database.
 * Only terminal generations (completed, failed, cancelled) can be deleted.
 */
export async function deleteGeneration(id: number): Promise<void> {
  await apiClient.delete(`/generations/${id}?_=delete`);
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
  const res = await apiClient.post('/generations/validate?_=validate', request);
  return res.data;
}

/**
 * Build social context from relationship state
 */
export async function buildSocialContext(params: {
  world_id: number;
  session_id?: number;
  npc_id?: string;
  user_max_rating?: string;
}): Promise<GenerationSocialContext> {
  const res = await apiClient.post<GenerationSocialContext>(
    '/generations/social-context/build',
    null,
    { params: { ...params, _: 'social' } }
  );
  return res.data;
}
