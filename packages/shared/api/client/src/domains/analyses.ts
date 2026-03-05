import type { PixSimApiClient } from '../client';

export type AnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type AnalysisBackfillStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface CreateAnalysisRequest {
  analyzer_id?: string;
  analyzer_intent?: string;
  analysis_point?: string;
  prompt?: string;
  params?: Record<string, unknown>;
  priority?: number;
}

export interface AnalysisResponse {
  id: number;
  asset_id: number;
  user_id: number;
  analyzer_id: string;
  model_id?: string | null;
  provider_id: string;
  prompt?: string | null;
  params: Record<string, unknown>;
  analysis_point: string;
  analyzer_definition_version?: string | null;
  effective_config_hash?: string | null;
  input_fingerprint?: string | null;
  dedupe_key?: string | null;
  status: AnalysisStatus;
  priority: number;
  result?: Record<string, unknown> | null;
  error_message?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface AnalysisListResponse {
  items: AnalysisResponse[];
  total: number;
}

export interface CreateAnalysisBackfillRequest {
  media_type?: 'image' | 'video' | 'audio' | '3d_model';
  analyzer_id?: string;
  analyzer_intent?: string;
  analysis_point?: string;
  prompt?: string;
  params?: Record<string, unknown>;
  priority?: number;
  batch_size?: number;
}

export interface AnalysisBackfillResponse {
  id: number;
  user_id: number;
  status: AnalysisBackfillStatus;
  media_type?: string | null;
  analyzer_id?: string | null;
  analyzer_intent?: string | null;
  analysis_point?: string | null;
  prompt?: string | null;
  params: Record<string, unknown>;
  priority: number;
  batch_size: number;
  cursor_asset_id: number;
  total_assets: number;
  processed_assets: number;
  created_analyses: number;
  deduped_assets: number;
  failed_assets: number;
  started_at?: string | null;
  completed_at?: string | null;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnalysisBackfillListResponse {
  items: AnalysisBackfillResponse[];
  total: number;
}

export interface ListAssetAnalysesOptions {
  analyzer_id?: string;
  status?: AnalysisStatus;
  limit?: number;
}

export interface ListAnalysisBackfillsOptions {
  status?: AnalysisBackfillStatus;
  limit?: number;
}

export function createAnalysesApi(client: PixSimApiClient) {
  return {
    async createAnalysis(assetId: number, payload: CreateAnalysisRequest): Promise<AnalysisResponse> {
      return client.post<AnalysisResponse>(`/assets/${assetId}/analyze`, payload);
    },

    async listAssetAnalyses(assetId: number, options?: ListAssetAnalysesOptions): Promise<AnalysisListResponse> {
      return client.get<AnalysisListResponse>(`/assets/${assetId}/analyses`, {
        params: options,
      });
    },

    async getAnalysis(analysisId: number): Promise<AnalysisResponse> {
      return client.get<AnalysisResponse>(`/analyses/${analysisId}`);
    },

    async cancelAnalysis(analysisId: number): Promise<AnalysisResponse> {
      return client.post<AnalysisResponse>(`/analyses/${analysisId}/cancel`);
    },

    async createAnalysisBackfill(
      payload: CreateAnalysisBackfillRequest
    ): Promise<AnalysisBackfillResponse> {
      return client.post<AnalysisBackfillResponse>('/analyses/backfills', payload);
    },

    async listAnalysisBackfills(
      options?: ListAnalysisBackfillsOptions
    ): Promise<AnalysisBackfillListResponse> {
      return client.get<AnalysisBackfillListResponse>('/analyses/backfills', {
        params: options,
      });
    },

    async getAnalysisBackfill(runId: number): Promise<AnalysisBackfillResponse> {
      return client.get<AnalysisBackfillResponse>(`/analyses/backfills/${runId}`);
    },

    async pauseAnalysisBackfill(runId: number): Promise<AnalysisBackfillResponse> {
      return client.post<AnalysisBackfillResponse>(`/analyses/backfills/${runId}/pause`);
    },

    async resumeAnalysisBackfill(runId: number): Promise<AnalysisBackfillResponse> {
      return client.post<AnalysisBackfillResponse>(`/analyses/backfills/${runId}/resume`);
    },

    async cancelAnalysisBackfill(runId: number): Promise<AnalysisBackfillResponse> {
      return client.post<AnalysisBackfillResponse>(`/analyses/backfills/${runId}/cancel`);
    },
  };
}
