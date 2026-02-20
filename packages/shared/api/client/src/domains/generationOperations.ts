import type { PixSimApiClient } from '../client';
import type { GenerationOperationMetadataItem } from '@pixsim7/shared.api.model';
export type { GenerationOperationMetadataItem };

export function createGenerationOperationsApi(client: PixSimApiClient) {
  return {
    async getGenerationOperationMetadata(): Promise<GenerationOperationMetadataItem[]> {
      return client.get<GenerationOperationMetadataItem[]>('/generation-operations');
    },
  };
}

