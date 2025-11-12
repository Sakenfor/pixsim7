import { apiClient } from './client';

export interface GenerateAssetRequest {
  prompt: string;
  providerId?: string;
  presetId?: string;
}

export interface GenerateAssetResponse {
  job_id: number;
  status: 'queued' | 'pending' | 'processing' | 'completed' | 'failed';
  message?: string;
  raw?: any; // backend JobResponse for advanced callers
}

/**
 * Trigger quick generation of an asset via the control center.
 * Returns a job ID that can be tracked via websocket or polling.
 */
export async function generateAsset(req: GenerateAssetRequest): Promise<GenerateAssetResponse> {
  // Align with backend /api/v1/jobs CreateJobRequest
  const body = {
    operation_type: 'text_to_video',
    provider_id: req.providerId || 'pixverse',
    params: {
      prompt: req.prompt,
      preset_id: req.presetId,
    },
  };
  const response = await apiClient.post<any>('/jobs', body);
  const job = response.data; // JobResponse
  return {
    job_id: job.id,
    status: (job.status || 'queued') as GenerateAssetResponse['status'],
    raw: job,
  };
}
