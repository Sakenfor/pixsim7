import { apiClient } from './client';

export interface GenerationOperationMetadataItem {
  generation_type: string;
  operation_type: string;
}

/**
 * Fetch generation_type → OperationType mapping metadata from the backend.
 *
 * This mirrors the registry in pixsim7/backend/main/shared/operation_mapping.py
 * so that frontends and tools don't need to duplicate the mapping.
 */
export async function getGenerationOperationMetadata(): Promise<GenerationOperationMetadataItem[]> {
  const response = await apiClient.get<GenerationOperationMetadataItem[]>('/api/v1/generation-operations');
  return response.data;
}

