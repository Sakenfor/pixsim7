/**
 * Generations API Client
 *
 * Canonical API client for the unified /api/v1/generations endpoint.
 * Replaces legacy jobs API.
 */
import { apiClient } from './client';
import { usePromptSettingsStore } from '@/stores/promptSettingsStore';
import type {
  GenerationNodeConfig,
  GenerateContentRequest,
  GenerateContentResponse,
  GenerationSocialContext,
  SceneRef,
  PlayerContextSnapshot,
} from '@/lib/registries';

// Re-export types from @pixsim7/shared.types for convenience
export type {
  GenerationNodeConfig,
  GenerateContentRequest,
  GenerateContentResponse,
  GenerationSocialContext,
  SceneRef,
  PlayerContextSnapshot,
};

// Backend response types (match backend schemas)
export interface GenerationResponse {
  id: number;
  user_id: number;
  workspace_id?: number | null;

  // Operation
  operation_type: string;
  provider_id: string;

  // Params
  raw_params: Record<string, any>;
  canonical_params: Record<string, any>;

  // Inputs & reproducibility
  inputs: Array<Record<string, any>>;
  reproducible_hash?: string | null;

  // Prompt versioning
  prompt_version_id?: string | null;
  final_prompt?: string | null;
  prompt_config?: Record<string, any> | null;
  prompt_source_type?: string | null;

  // Lifecycle
  status: 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  priority: number;
  scheduled_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
  retry_count: number;
  parent_generation_id?: number | null;

  // Result
  asset_id?: number | null;

  // Metadata
  name?: string | null;
  description?: string | null;
  created_at: string;
  updated_at: string;
}

export interface GenerationListResponse {
  generations: GenerationResponse[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Extended config type for generation requests.
 *
 * Extends GenerationNodeConfig with additional fields used by the control center
 * that aren't in the strict schema (prompt, image_url, video_url, etc.).
 * These extra fields are passed through to the provider adapter.
 */
export interface GenerationConfig extends Partial<GenerationNodeConfig> {
  // Provider-specific params (passed through to adapter)
  prompt?: string;
  image_url?: string;
  image_urls?: string[];
  video_url?: string;
  original_video_id?: string;
  prompts?: string[];
  fusion_assets?: string[];
  [key: string]: unknown;
}

// Request type for creating generations (matches backend schema)
export interface CreateGenerationRequest {
  // Required
  config: GenerationConfig;
  provider_id: string;

  // Scene context
  from_scene?: SceneRef;
  to_scene?: SceneRef;

  // Player context
  player_context?: PlayerContextSnapshot;

  // Social context
  social_context?: GenerationSocialContext;

  // Prompt versioning
  prompt_version_id?: string;
  template_id?: string;
  template_variables?: Record<string, unknown>;

  // Workspace and metadata
  workspace_id?: number;
  name?: string;
  description?: string;

  // Scheduling
  priority?: number;
  scheduled_at?: string;
  parent_generation_id?: number;

  // Deduplication control
  force_new?: boolean;

  // Prompt analysis settings (see GET /api/v1/analyzers for available options)
  analyzer_id?: string;
}

// ===== API FUNCTIONS =====

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
export async function listGenerations(params?: {
  workspace_id?: number;
  status?: string;
  operation_type?: string;
  limit?: number;
  offset?: number;
}): Promise<GenerationListResponse> {
  const res = await apiClient.get<GenerationListResponse>('/generations', { params: { ...params, _: 'list' } });
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
  const res = await apiClient.post<GenerationSocialContext>('/generations/social-context/build', null, { params: { ...params, _: 'social' } });
  return res.data;
}
