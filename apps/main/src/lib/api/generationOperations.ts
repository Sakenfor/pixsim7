/**
 * Generation Operations API Client (web wrapper)
 *
 * Delegates to environment-neutral domain client in @pixsim7/shared.api-client.
 */
import { createGenerationOperationsApi } from '@pixsim7/shared.api-client/domains';

import { pixsimClient } from './client';

export type { GenerationOperationMetadataItem } from '@pixsim7/shared.api-client/domains';

const generationOperationsApi = createGenerationOperationsApi(pixsimClient);

export const getGenerationOperationMetadata = generationOperationsApi.getGenerationOperationMetadata;

