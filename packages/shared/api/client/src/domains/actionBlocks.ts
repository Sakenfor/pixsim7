import type { PixSimApiClient } from '../client';

export interface ActionBlockSummary {
  id: string;
  block_id: string;
  kind: string;
  prompt: string;
  description?: string | null;
  package_name?: string | null;
  source_type?: string | null;
  role?: string | null;
  category?: string | null;
}

export interface ActionBlockSearchQuery {
  kind?: string;
  complexity_level?: string;
  package_name?: string;
  source_type?: string;
  is_public?: boolean;
  location?: string;
  mood?: string;
  min_rating?: number;
  limit?: number;
  offset?: number;
}

export interface SimilarActionBlockQuery {
  role?: string;
  kind?: string;
  category?: string;
  limit?: number;
  threshold?: number;
}

export interface SimilarActionBlocksByTextRequest extends SimilarActionBlockQuery {
  text: string;
  model_id?: string;
}

export interface SimilarActionBlockMatch {
  id: string;
  block_id: string;
  kind: string;
  role?: string | null;
  category?: string | null;
  prompt: string;
  description?: string | null;
  distance: number;
  similarity_score: number;
}

export interface EmbedActionBlockQuery {
  model_id?: string;
  force?: boolean;
}

export interface EmbedActionBlockResponse {
  success: boolean;
  block_id: string;
  embedding_model?: string | null;
  has_embedding: boolean;
}

export interface EmbedActionBlocksBatchRequest {
  model_id?: string;
  force?: boolean;
  role?: string;
  kind?: string;
}

export interface EmbedActionBlocksBatchResponse {
  embedded_count: number;
  skipped_count: number;
  total: number;
  model_id: string;
}

export function createActionBlocksApi(client: PixSimApiClient) {
  return {
    async searchBlocks(query?: ActionBlockSearchQuery): Promise<ActionBlockSummary[]> {
      return client.get<ActionBlockSummary[]>('/action-blocks', { params: query });
    },

    async findSimilar(
      blockId: string,
      query?: SimilarActionBlockQuery
    ): Promise<SimilarActionBlockMatch[]> {
      return client.get<SimilarActionBlockMatch[]>(
        `/action-blocks/${encodeURIComponent(blockId)}/similar`,
        { params: query }
      );
    },

    async findSimilarByText(
      request: SimilarActionBlocksByTextRequest
    ): Promise<SimilarActionBlockMatch[]> {
      return client.post<SimilarActionBlockMatch[]>('/action-blocks/similar/by-text', request);
    },

    async embedBlock(
      blockId: string,
      query?: EmbedActionBlockQuery
    ): Promise<EmbedActionBlockResponse> {
      return client.post<EmbedActionBlockResponse>(
        `/action-blocks/${encodeURIComponent(blockId)}/embed`,
        undefined,
        { params: query }
      );
    },

    async embedBatch(
      request: EmbedActionBlocksBatchRequest = {}
    ): Promise<EmbedActionBlocksBatchResponse> {
      return client.post<EmbedActionBlocksBatchResponse>('/action-blocks/embed/batch', request);
    },
  };
}
