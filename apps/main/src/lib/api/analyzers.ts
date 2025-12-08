/**
 * Analyzers API Client
 *
 * Fetch available prompt analyzers from the backend.
 */
import { apiClient } from './client';

export interface AnalyzerInfo {
  id: string;
  name: string;
  description: string;
  kind: 'parser' | 'llm';
  enabled: boolean;
  is_default: boolean;
}

export interface AnalyzersListResponse {
  analyzers: AnalyzerInfo[];
  default_id: string;
}

/**
 * Fetch available prompt analyzers
 */
export async function listAnalyzers(): Promise<AnalyzersListResponse> {
  const res = await apiClient.get<AnalyzersListResponse>('/analyzers');
  return res.data;
}

/**
 * Get a specific analyzer by ID
 */
export async function getAnalyzer(analyzerId: string): Promise<AnalyzerInfo> {
  const res = await apiClient.get<AnalyzerInfo>(`/analyzers/${analyzerId}`);
  return res.data;
}
