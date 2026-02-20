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

    async retryGeneration(id: number): Promise<GenerationResponse> {
      return client.post<GenerationResponse>(`/generations/${id}/retry?_=retry`);
    },

    async deleteGeneration(id: number): Promise<void> {
      await client.delete<void>(`/generations/${id}?_=delete`);
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
  };
}

