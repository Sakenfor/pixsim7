/**
 * Generation Operations API Client (web wrapper)
 *
 * Delegates to environment-neutral domain client in @pixsim7/api-client.
 */
import { pixsimClient } from './client';
import { createGenerationOperationsApi } from '@pixsim7/api-client/domains';

export type { GenerationOperationMetadataItem } from '@pixsim7/api-client/domains';

const generationOperationsApi = createGenerationOperationsApi(pixsimClient);

export const getGenerationOperationMetadata = generationOperationsApi.getGenerationOperationMetadata;

