/**
 * Action Blocks API Client (web wrapper)
 *
 * Delegates to environment-neutral domain client in @pixsim7/shared.api.client.
 */
import { createActionBlocksApi } from '@pixsim7/shared.api.client/domains';

import { pixsimClient } from './client';

export type {
  ActionBlockSummary,
  ActionBlockSearchQuery,
  SimilarActionBlockQuery,
  SimilarActionBlocksByTextRequest,
  SimilarActionBlockMatch,
  EmbedActionBlockQuery,
  EmbedActionBlockResponse,
  EmbedActionBlocksBatchRequest,
  EmbedActionBlocksBatchResponse,
} from '@pixsim7/shared.api.client/domains';

const actionBlocksApi = createActionBlocksApi(pixsimClient);

export const searchActionBlocks = actionBlocksApi.searchBlocks;
export const findSimilarActionBlocks = actionBlocksApi.findSimilar;
export const findSimilarActionBlocksByText = actionBlocksApi.findSimilarByText;
export const embedActionBlock = actionBlocksApi.embedBlock;
export const embedActionBlocksBatch = actionBlocksApi.embedBatch;
