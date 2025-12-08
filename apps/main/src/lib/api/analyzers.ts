/**
 * Analyzers API Client
 *
 * Fetch available analyzers (prompt and asset) from the backend.
 */
import { apiClient } from './client';

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

/**
 * Fetch available analyzers
 *
 * @param options.target - Filter by 'prompt' or 'asset'
 * @param options.include_legacy - Include legacy IDs (parser:*, llm:*)
 */
export async function listAnalyzers(
  options?: ListAnalyzersOptions
): Promise<AnalyzersListResponse> {
  const params: Record<string, string | boolean> = {};
  if (options?.target) params.target = options.target;
  if (options?.include_legacy) params.include_legacy = true;

  const res = await apiClient.get<AnalyzersListResponse>('/analyzers', { params });
  return res.data;
}

/**
 * Fetch prompt analyzers (convenience)
 */
export async function listPromptAnalyzers(): Promise<AnalyzersListResponse> {
  return listAnalyzers({ target: 'prompt' });
}

/**
 * Fetch asset analyzers (convenience)
 */
export async function listAssetAnalyzers(): Promise<AnalyzersListResponse> {
  return listAnalyzers({ target: 'asset' });
}

/**
 * Get a specific analyzer by ID
 */
export async function getAnalyzer(analyzerId: string): Promise<AnalyzerInfo> {
  const res = await apiClient.get<AnalyzerInfo>(`/analyzers/${analyzerId}`);
  return res.data;
}
