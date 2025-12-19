import type { PixSimApiClient } from '../client';

export interface GenerationOperationMetadataItem {
  generation_type: string;
  operation_type: string;
}

export function createGenerationOperationsApi(client: PixSimApiClient) {
  return {
    async getGenerationOperationMetadata(): Promise<GenerationOperationMetadataItem[]> {
      return client.get<GenerationOperationMetadataItem[]>('/generation-operations');
    },
  };
}

