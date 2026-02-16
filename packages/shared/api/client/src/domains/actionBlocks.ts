import type { PixSimApiClient } from '../client';
import type { ApiComponents, ApiOperations } from '@pixsim7/shared.types';

type Schemas = ApiComponents['schemas'];

export type ActionBlockSummary = Schemas['ActionBlockResponse'];

type ActionBlockSearchQuerySchema =
  ApiOperations['search_action_blocks_api_v1_action_blocks_get']['parameters']['query'];
export type ActionBlockSearchQuery = ActionBlockSearchQuerySchema;

type SimilarActionBlockQuerySchema =
  ApiOperations['find_similar_blocks_api_v1_action_blocks__block_id__similar_get']['parameters']['query'];
export type SimilarActionBlockQuery = SimilarActionBlockQuerySchema;

export type SimilarActionBlocksByTextRequest = Schemas['SimilarByTextRequest'];

export type SimilarActionBlockMatch = Schemas['SimilarBlockResponse'];

type EmbedActionBlockQuerySchema =
  ApiOperations['embed_block_api_v1_action_blocks__block_id__embed_post']['parameters']['query'];
export type EmbedActionBlockQuery = EmbedActionBlockQuerySchema;
export type EmbedActionBlockResponse =
  ApiOperations['embed_block_api_v1_action_blocks__block_id__embed_post']['responses'][200]['content']['application/json'];
export type EmbedActionBlocksBatchRequest = Schemas['EmbedBatchRequest'];
export type EmbedActionBlocksBatchResponse =
  ApiOperations['embed_blocks_batch_api_v1_action_blocks_embed_batch_post']['responses'][200]['content']['application/json'];

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
