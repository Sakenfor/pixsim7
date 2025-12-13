import { apiClient } from '@lib/api/client';

export interface PixverseCostEstimateRequest {
  kind?: 'video' | 'image';
  quality: string;
  duration: number;
  model: string;
  motion_mode?: string | null;
  multi_shot?: boolean;
  audio?: boolean;
  api_method?: string;
}

export interface PixverseCostEstimateResponse {
  estimated_credits: number;
  estimated_cost_usd?: number | null;
}

/**
 * Estimate Pixverse credits (and approximate USD) for the given settings.
 *
 * This calls the backend /providers/pixverse/estimate-cost endpoint, which
 * uses pixverse-py's pricing helper under the hood.
 */
export async function estimatePixverseCost(
  body: PixverseCostEstimateRequest
): Promise<PixverseCostEstimateResponse> {
  const res = await apiClient.post<PixverseCostEstimateResponse>(
    '/providers/pixverse/estimate-cost',
    {
      kind: body.kind ?? 'video',
      api_method: body.api_method ?? 'web-api',
      quality: body.quality,
      duration: Math.max(1, Math.round(body.duration)),
      model: body.model,
      motion_mode: body.motion_mode ?? null,
      multi_shot: !!body.multi_shot,
      audio: !!body.audio,
    }
  );
  return res.data;
}
