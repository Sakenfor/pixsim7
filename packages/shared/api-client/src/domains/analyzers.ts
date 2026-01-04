import type { PixSimApiClient } from '../client';

export type AnalyzerKind = 'parser' | 'llm' | 'vision';
export type AnalyzerTarget = 'prompt' | 'asset';

export interface AnalyzerInfo {
  id: string;
  name: string;
  description: string;
  kind: AnalyzerKind;
  target: AnalyzerTarget;
  provider_id?: string | null;
  model_id?: string | null;
  source_plugin_id?: string | null;
  enabled: boolean;
  is_default: boolean;
}

export interface AnalyzersListResponse {
  analyzers: AnalyzerInfo[];
  default_id: string;
}

export interface AnalyzerInstance {
  id: number;
  analyzer_id: string;
  provider_id: string;
  model_id?: string | null;
  label: string;
  description?: string | null;
  config: Record<string, any>;
  enabled: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface AnalyzerInstanceListResponse {
  instances: AnalyzerInstance[];
}

export interface CreateAnalyzerInstanceRequest {
  analyzer_id: string;
  provider_id?: string;
  model_id?: string;
  label: string;
  description?: string | null;
  config?: Record<string, any>;
  enabled?: boolean;
  priority?: number;
}

export interface UpdateAnalyzerInstanceRequest {
  provider_id?: string;
  model_id?: string;
  label?: string;
  description?: string | null;
  config?: Record<string, any>;
  enabled?: boolean;
  priority?: number;
}

export interface ListAnalyzersOptions {
  target?: AnalyzerTarget;
  include_legacy?: boolean;
}

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
