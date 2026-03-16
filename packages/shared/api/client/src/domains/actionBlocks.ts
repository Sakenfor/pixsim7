/**
 * Legacy Action Blocks domain client.
 *
 * Deprecated: primitives-first code should use block-template/primitive APIs.
 * Kept for compatibility with older API consumers.
 */
import type { PixSimApiClient } from '../client';
import type {
  ActionBlockResponse,
  EmbedBatchRequest,
  EmbedBlockApiV1ActionBlocksBlockIdEmbedPost200,
  EmbedBlockApiV1ActionBlocksBlockIdEmbedPostParams,
  EmbedBlocksBatchApiV1ActionBlocksEmbedBatchPost200,
  FindSimilarBlocksApiV1ActionBlocksBlockIdSimilarGetParams,
  SearchActionBlocksApiV1ActionBlocksGetParams,
  SimilarBlockResponse,
  SimilarByTextRequest,
} from '@pixsim7/shared.api.model';

export type ActionBlockSummary = ActionBlockResponse;
export type EmbedActionBlocksBatchRequest = EmbedBatchRequest;
export type EmbedActionBlockResponse = EmbedBlockApiV1ActionBlocksBlockIdEmbedPost200;
export type EmbedActionBlockQuery = EmbedBlockApiV1ActionBlocksBlockIdEmbedPostParams;
export type EmbedActionBlocksBatchResponse = EmbedBlocksBatchApiV1ActionBlocksEmbedBatchPost200;
export type SimilarActionBlockQuery = FindSimilarBlocksApiV1ActionBlocksBlockIdSimilarGetParams;
export type ActionBlockSearchQuery = SearchActionBlocksApiV1ActionBlocksGetParams;
export type SimilarActionBlockMatch = SimilarBlockResponse;
export type SimilarActionBlocksByTextRequest = SimilarByTextRequest;

export function createActionBlocksApi(client: PixSimApiClient) {
  return {
    async searchBlocks(query?: ActionBlockSearchQuery): Promise<ActionBlockSummary[]> {
      const response = await client.get<readonly ActionBlockSummary[]>('/action-blocks', { params: query });
      return [...response];
    },

    async findSimilar(
      blockId: string,
      query?: SimilarActionBlockQuery
    ): Promise<SimilarActionBlockMatch[]> {
      const response = await client.get<readonly SimilarActionBlockMatch[]>(
        `/action-blocks/${encodeURIComponent(blockId)}/similar`,
        { params: query }
      );
      return [...response];
    },

    async findSimilarByText(
      request: SimilarActionBlocksByTextRequest
    ): Promise<SimilarActionBlockMatch[]> {
      const response = await client.post<readonly SimilarActionBlockMatch[]>(
        '/action-blocks/similar/by-text',
        request
      );
      return [...response];
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
      request: EmbedActionBlocksBatchRequest
    ): Promise<EmbedActionBlocksBatchResponse> {
      return client.post<EmbedActionBlocksBatchResponse>('/action-blocks/embed/batch', request);
    },
  };
}
