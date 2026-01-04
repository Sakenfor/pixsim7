/**
 * Analyzers API Client (web wrapper)
 *
 * Delegates to environment-neutral domain client in @pixsim7/api-client.
 */
import { pixsimClient } from './client';
import { createAnalyzersApi } from '@pixsim7/api-client/domains';

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
} from '@pixsim7/api-client/domains';

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
