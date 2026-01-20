import type { PixSimApiClient } from '../client';
import type { ApiComponents, ApiOperations } from '@pixsim7/shared.types';

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

