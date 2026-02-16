import type { PixSimApiClient } from '../client';
import type { ApiComponents } from '@pixsim7/shared.types';

export type GenerationOperationMetadataItem = ApiComponents['schemas']['GenerationOperationMetadataItem'];

export function createGenerationOperationsApi(client: PixSimApiClient) {
  return {
    async getGenerationOperationMetadata(): Promise<GenerationOperationMetadataItem[]> {
      return client.get<GenerationOperationMetadataItem[]>('/generation-operations');
    },
  };
}
