import type { PixSimApiClient } from '../client';

export type AnalyzerKind = 'parser' | 'llm' | 'vision';
export type AnalyzerTarget = 'prompt' | 'asset';

export interface AnalyzerInfo {
  id: string;
  name: string;
  description: string;
  kind: AnalyzerKind;
  target: AnalyzerTarget;
  enabled: boolean;
  is_default: boolean;
}

export interface AnalyzersListResponse {
  analyzers: AnalyzerInfo[];
  default_id: string;
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
  };
}

