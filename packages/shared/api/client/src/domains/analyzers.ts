import type { PixSimApiClient } from '../client';
import type {
  AnalyzerInputModality,
  AnalyzerInstanceCreate,
  AnalyzerInstanceListResponse,
  AnalyzerInstanceResponse,
  AnalyzerInstanceUpdate,
  AnalyzerKind,
  AnalyzerResponse,
  AnalyzerTarget,
  AnalyzerTaskFamily,
  AnalyzersListResponse,
} from '@pixsim7/shared.api.model';
export type {
  AnalyzerInputModality,
  AnalyzerInstanceListResponse,
  AnalyzerInstanceResponse,
  AnalyzerKind,
  AnalyzerResponse,
  AnalyzerTarget,
  AnalyzerTaskFamily,
  AnalyzersListResponse,
};

// ============================================================================
// OpenAPI-generated types
// ============================================================================

export type CreateAnalyzerInstanceRequest = AnalyzerInstanceCreate;
export type UpdateAnalyzerInstanceRequest = AnalyzerInstanceUpdate;

/**
 * Options for listing analyzers.
 * [frontend-only] Query parameter helper.
 */
export interface ListAnalyzersOptions {
  target?: AnalyzerTarget;
  include_legacy?: boolean;
}

export type AnalysisPointGroup = 'prompt' | 'asset' | 'system';
export type AnalysisPointControl =
  | 'prompt_default'
  | 'image_default'
  | 'video_default'
  | 'intent_override'
  | 'similarity_threshold';

export interface AnalysisPointInfo {
  id: string;
  label: string;
  description: string;
  group: AnalysisPointGroup;
  target: AnalyzerTarget | null;
  control: AnalysisPointControl;
  intent_key?: string | null;
  media_type?: 'image' | 'video' | null;
  supports_chain: boolean;
  source?: 'system' | 'user' | 'plugin';
  editable?: boolean;
}

export interface AnalysisPointsListResponse {
  analysis_points: AnalysisPointInfo[];
}

export interface CreateAnalysisPointRequest {
  id?: string;
  label: string;
  description?: string;
  group?: AnalysisPointGroup;
  target?: AnalyzerTarget | null;
  control: AnalysisPointControl;
  intent_key?: string | null;
  media_type?: 'image' | 'video' | null;
  supports_chain?: boolean;
  default_analyzer_ids?: string[] | null;
}

export interface UpdateAnalysisPointRequest {
  label?: string;
  description?: string;
  group?: AnalysisPointGroup;
  target?: AnalyzerTarget | null;
  control?: AnalysisPointControl;
  intent_key?: string | null;
  media_type?: 'image' | 'video' | null;
  supports_chain?: boolean;
  default_analyzer_ids?: string[] | null;
}

// Backward compatibility alias
export type AnalyzerInfo = AnalyzerResponse;
export type AnalyzerInstance = AnalyzerInstanceResponse;

export function createAnalyzersApi(client: PixSimApiClient) {
  return {
    async listAnalyzers(options?: ListAnalyzersOptions): Promise<AnalyzersListResponse> {
      const params: Record<string, string | boolean> = {};
      if (options?.target) params.target = options.target;
      if (options?.include_legacy) params.include_legacy = true;
      return client.get<AnalyzersListResponse>('/analyzers', {
        params: Object.keys(params).length ? params : undefined,
      });
    },

    async listPromptAnalyzers(): Promise<AnalyzersListResponse> {
      return client.get<AnalyzersListResponse>('/analyzers', { params: { target: 'prompt' } });
    },

    async listAssetAnalyzers(): Promise<AnalyzersListResponse> {
      return client.get<AnalyzersListResponse>('/analyzers', { params: { target: 'asset' } });
    },

    async getAnalyzer(analyzerId: string): Promise<AnalyzerInfo> {
      return client.get<AnalyzerInfo>(`/analyzers/${analyzerId}`);
    },

    async listAnalysisPoints(
      params?: {
        target?: AnalysisPointGroup;
      }
    ): Promise<AnalysisPointsListResponse> {
      return client.get<AnalysisPointsListResponse>('/analysis-points', {
        params,
      });
    },

    async createAnalysisPoint(payload: CreateAnalysisPointRequest): Promise<AnalysisPointInfo> {
      return client.post<AnalysisPointInfo>('/analysis-points', payload);
    },

    async updateAnalysisPoint(
      pointId: string,
      payload: UpdateAnalysisPointRequest
    ): Promise<AnalysisPointInfo> {
      return client.patch<AnalysisPointInfo>(`/analysis-points/${encodeURIComponent(pointId)}`, payload);
    },

    async deleteAnalysisPoint(pointId: string): Promise<void> {
      await client.delete(`/analysis-points/${encodeURIComponent(pointId)}`);
    },

    async listAnalyzerInstances(
      params?: {
        analyzer_id?: string;
        provider_id?: string;
        include_disabled?: boolean;
      }
    ): Promise<AnalyzerInstanceListResponse> {
      return client.get<AnalyzerInstanceListResponse>('/analyzer-instances', {
        params,
      });
    },

    async createAnalyzerInstance(
      payload: CreateAnalyzerInstanceRequest
    ): Promise<AnalyzerInstance> {
      return client.post<AnalyzerInstance>('/analyzer-instances', payload);
    },

    async getAnalyzerInstance(instanceId: number): Promise<AnalyzerInstance> {
      return client.get<AnalyzerInstance>(`/analyzer-instances/${instanceId}`);
    },

    async updateAnalyzerInstance(
      instanceId: number,
      payload: UpdateAnalyzerInstanceRequest
    ): Promise<AnalyzerInstance> {
      return client.patch<AnalyzerInstance>(`/analyzer-instances/${instanceId}`, payload);
    },

    async deleteAnalyzerInstance(instanceId: number): Promise<void> {
      await client.delete(`/analyzer-instances/${instanceId}`);
    },
  };
}
