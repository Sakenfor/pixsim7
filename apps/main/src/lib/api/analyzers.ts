/**
 * Analyzers API Client (web wrapper)
 *
 * Delegates to environment-neutral domain client in @pixsim7/api-client.
 */
import { pixsimClient } from './client';
import { createAnalyzersApi } from '@pixsim7/api-client/domains';

export type {
  AnalyzerInfo,
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

