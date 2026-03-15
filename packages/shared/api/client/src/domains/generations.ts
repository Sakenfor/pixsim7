import type { PixSimApiClient } from '../client';
import type {
  CreateGenerationRequest,
  GenerationListResponse,
  GenerationNodeConfigSchema,
  GenerationResponse,
  GenerationSocialContextSchema,
  GenerationStatus,
  ListGenerationsApiV1GenerationsGetParams,
  OperationType,
  PlayerContextSnapshotSchema,
  SceneRefSchema,
} from '@pixsim7/shared.api.model';
export type {
  CreateGenerationRequest,
  GenerationListResponse,
  GenerationNodeConfigSchema,
  GenerationResponse,
  GenerationStatus,
  OperationType,
};
export type GenerationSocialContext = GenerationSocialContextSchema;
export type SceneRef = SceneRefSchema;
export type PlayerContextSnapshot = PlayerContextSnapshotSchema;

export type ListGenerationsQuery = ListGenerationsApiV1GenerationsGetParams;

export interface GenerationBatchSummary {
  batch_id: string;
  created_at: string;
  item_count: number;
  first_item_index: number;
  last_item_index: number;
}

export interface GenerationBatchItem {
  asset_id: number;
  item_index: number;
  generation_id?: number | null;
  prompt_version_id?: string | null;
  block_template_id?: string | null;
  template_slug?: string | null;
  roll_seed?: number | null;
  selected_block_ids: string[];
  slot_results: Record<string, any>[];
  assembled_prompt?: string | null;
  mode?: string | null;
  strategy?: string | null;
  input_asset_ids: number[];
  manifest_metadata: Record<string, any>;
  created_at: string;
}

export interface GenerationBatchListResponse {
  batches: GenerationBatchSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface GenerationBatchDetailResponse {
  batch: GenerationBatchSummary;
  items: GenerationBatchItem[];
}

export interface ListGenerationBatchesQuery {
  limit?: number;
  offset?: number;
}

export function createGenerationsApi(client: PixSimApiClient) {
  return {
    async createGeneration(request: CreateGenerationRequest): Promise<GenerationResponse> {
      return client.post<GenerationResponse>('/generations?_=new', request);
    },

    async getGeneration(id: number): Promise<GenerationResponse> {
      return client.get<GenerationResponse>(`/generations/${id}?_=details`);
    },

    async listGenerations(query?: ListGenerationsQuery): Promise<GenerationListResponse> {
      return client.get<GenerationListResponse>('/generations', {
        params: { ...(query as any), _: 'list' },
      });
    },

    async cancelGeneration(id: number): Promise<GenerationResponse> {
      return client.post<GenerationResponse>(`/generations/${id}/cancel?_=cancel`);
    },

    async pauseGeneration(id: number): Promise<GenerationResponse> {
      return client.post<GenerationResponse>(`/generations/${id}/pause?_=pause`);
    },

    async resumeGeneration(id: number): Promise<GenerationResponse> {
      return client.post<GenerationResponse>(`/generations/${id}/resume?_=resume`);
    },

    async retryGeneration(id: number): Promise<GenerationResponse> {
      return client.post<GenerationResponse>(`/generations/${id}/retry?_=retry`);
    },

    async deleteGeneration(id: number): Promise<void> {
      await client.delete<void>(`/generations/${id}?_=delete`);
    },

    async patchGenerationPrompt(id: number, prompt: string): Promise<GenerationResponse> {
      return client.patch<GenerationResponse>(`/generations/${id}/prompt`, { prompt });
    },

    async validateGenerationConfig(
      request: CreateGenerationRequest
    ): Promise<{ valid: boolean; errors: string[]; warnings: string[]; suggestions: string[] }> {
      return client.post('/generations/validate?_=validate', request);
    },

    async buildSocialContext(params: {
      world_id: number;
      session_id?: number;
      npc_id?: string;
      user_max_rating?: string;
    }): Promise<GenerationSocialContext> {
      return client.post<GenerationSocialContext>('/generations/social-context/build', null, {
        params: { ...params, _: 'social' },
      });
    },

    async listGenerationBatches(
      query?: ListGenerationBatchesQuery,
    ): Promise<GenerationBatchListResponse> {
      return client.get<GenerationBatchListResponse>('/generation-batches', {
        params: { ...(query as any), _: 'batch-list' },
      });
    },

    async getGenerationBatch(batchId: string): Promise<GenerationBatchDetailResponse> {
      return client.get<GenerationBatchDetailResponse>(`/generation-batches/${batchId}?_=batch-detail`);
    },
  };
}
