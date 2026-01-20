/**
 * Analyzers API Client (web wrapper)
 *
 * Delegates to environment-neutral domain client in @pixsim7/shared.api.client.
 */
import { createAnalyzersApi } from '@pixsim7/shared.api.client/domains';

import { pixsimClient } from './client';

export type {
  AnalyzerInfo,
  AnalyzerInstance,
  AnalyzerInstanceListResponse,
  CreateAnalyzerInstanceRequest,
  UpdateAnalyzerInstanceRequest,
  AnalyzerKind,
  AnalyzerTarget,
  AnalyzersListResponse,
  ListAnalyzersOptions,
} from '@pixsim7/shared.api.client/domains';

const analyzersApi = createAnalyzersApi(pixsimClient);

export const listAnalyzers = analyzersApi.listAnalyzers;
export const listPromptAnalyzers = analyzersApi.listPromptAnalyzers;
export const listAssetAnalyzers = analyzersApi.listAssetAnalyzers;
export const getAnalyzer = analyzersApi.getAnalyzer;
export const listAnalyzerInstances = analyzersApi.listAnalyzerInstances;
export const createAnalyzerInstance = analyzersApi.createAnalyzerInstance;
export const getAnalyzerInstance = analyzersApi.getAnalyzerInstance;
export const updateAnalyzerInstance = analyzersApi.updateAnalyzerInstance;
export const deleteAnalyzerInstance = analyzersApi.deleteAnalyzerInstance;
