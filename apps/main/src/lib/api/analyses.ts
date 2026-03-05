/**
 * Analyses API Client (web wrapper)
 *
 * Delegates to environment-neutral domain client in @pixsim7/shared.api.client.
 */
import { createAnalysesApi } from '@pixsim7/shared.api.client/domains';

import { pixsimClient } from './client';

export type {
  AnalysisStatus,
  AnalysisBackfillStatus,
  CreateAnalysisRequest,
  AnalysisResponse,
  AnalysisListResponse,
  CreateAnalysisBackfillRequest,
  AnalysisBackfillResponse,
  AnalysisBackfillListResponse,
  ListAssetAnalysesOptions,
  ListAnalysisBackfillsOptions,
} from '@pixsim7/shared.api.client/domains';

const analysesApi = createAnalysesApi(pixsimClient);

export const createAnalysis = analysesApi.createAnalysis;
export const listAssetAnalyses = analysesApi.listAssetAnalyses;
export const getAnalysis = analysesApi.getAnalysis;
export const cancelAnalysis = analysesApi.cancelAnalysis;
export const createAnalysisBackfill = analysesApi.createAnalysisBackfill;
export const listAnalysisBackfills = analysesApi.listAnalysisBackfills;
export const getAnalysisBackfill = analysesApi.getAnalysisBackfill;
export const pauseAnalysisBackfill = analysesApi.pauseAnalysisBackfill;
export const resumeAnalysisBackfill = analysesApi.resumeAnalysisBackfill;
export const cancelAnalysisBackfill = analysesApi.cancelAnalysisBackfill;
