import { apiClient } from './client';

export interface GenerateAssetRequest {
  prompt: string;
  providerId?: string;
  presetId?: string;
}

export interface GenerateAssetResponse {
  job_id: string;
  asset_id?: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  message?: string;
}

/**
 * Trigger quick generation of an asset via the control center.
 * Returns a job ID that can be tracked via websocket or polling.
 */
export async function generateAsset(req: GenerateAssetRequest): Promise<GenerateAssetResponse> {
  const response = await apiClient.post<GenerateAssetResponse>('/generate', {
    prompt: req.prompt,
    provider_id: req.providerId,
    preset_id: req.presetId,
  });
  return response.data;
}
