/**
 * Generations API Client
 *
 * Canonical API client for the unified /api/v1/generations endpoint.
 * Replaces legacy jobs API.
 */
import { apiClient } from './client';

// Re-export types from @pixsim7/types for convenience
export type {
  GenerationNodeConfig,
  GenerateContentRequest,
  GenerateContentResponse,
  GenerationSocialContext,
  SceneRef,
  PlayerContextSnapshot,
} from '@pixsim7/types';

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

// Request type for creating generations (matches backend schema)
export interface CreateGenerationRequest {
  // Required
  config: any; // GenerationNodeConfig
  provider_id: string;

  // Scene context
  from_scene?: any; // SceneRef
  to_scene?: any; // SceneRef

  // Player context
  player_context?: any; // PlayerContextSnapshot

  // Social context
  social_context?: any; // GenerationSocialContext

  // Prompt versioning
  prompt_version_id?: string;
  template_id?: string;
  template_variables?: Record<string, any>;

  // Workspace and metadata
  workspace_id?: number;
  name?: string;
  description?: string;

  // Scheduling
  priority?: number;
  scheduled_at?: string;
  parent_generation_id?: number;
}

// ===== API FUNCTIONS =====

/**
 * Create a new generation
 */
export async function createGeneration(
  request: CreateGenerationRequest
): Promise<GenerationResponse> {
  const res = await apiClient.post<GenerationResponse>('/generations', request);
  return res.data;
}

/**
 * Get generation by ID
 */
export async function getGeneration(id: number): Promise<GenerationResponse> {
  const res = await apiClient.get<GenerationResponse>(`/generations/${id}`);
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
  const res = await apiClient.get<GenerationListResponse>('/generations', { params });
  return res.data;
}

/**
 * Cancel a generation
 */
export async function cancelGeneration(id: number): Promise<GenerationResponse> {
  const res = await apiClient.post<GenerationResponse>(`/generations/${id}/cancel`);
  return res.data;
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
  const res = await apiClient.post('/generations/validate', request);
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
}): Promise<any> {
  const res = await apiClient.post('/generations/social-context/build', null, { params });
  return res.data;
}
