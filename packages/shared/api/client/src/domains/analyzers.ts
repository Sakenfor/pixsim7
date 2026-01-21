import type { PixSimApiClient } from '../client';
import type { ApiComponents } from '@pixsim7/shared.types';

// ============================================================================
// OpenAPI-generated types
// ============================================================================

export type AnalyzerResponse = ApiComponents['schemas']['AnalyzerResponse'];
export type AnalyzersListResponse = ApiComponents['schemas']['AnalyzersListResponse'];
export type AnalyzerInstanceResponse = ApiComponents['schemas']['AnalyzerInstanceResponse'];
export type AnalyzerInstanceListResponse = ApiComponents['schemas']['AnalyzerInstanceListResponse'];
export type CreateAnalyzerInstanceRequest = ApiComponents['schemas']['AnalyzerInstanceCreate'];
export type UpdateAnalyzerInstanceRequest = ApiComponents['schemas']['AnalyzerInstanceUpdate'];

// ============================================================================
// Frontend-only types (UX helpers, not in OpenAPI)
// ============================================================================

/**
 * Analyzer kind enum.
 * [frontend-only] Backend returns string; this provides autocomplete.
 * TODO: Define as enum in backend for strict OpenAPI typing.
 */
export type AnalyzerKind = 'parser' | 'llm' | 'vision';

/**
 * Analyzer target enum.
 * [frontend-only] Backend returns string; this provides autocomplete.
 * TODO: Define as enum in backend for strict OpenAPI typing.
 */
export type AnalyzerTarget = 'prompt' | 'asset';

/**
 * Options for listing analyzers.
 * [frontend-only] Query parameter helper.
 */
export interface ListAnalyzersOptions {
  target?: AnalyzerTarget;
  include_legacy?: boolean;
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
