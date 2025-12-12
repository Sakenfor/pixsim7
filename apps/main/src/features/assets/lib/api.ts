import { apiClient, BACKEND_BASE } from './client';

export interface AssetResponse {
  id: number;
  media_type: 'video' | 'image' | 'audio' | '3d_model';
  remote_url?: string | null;
  thumbnail_url?: string | null;
  file_url?: string | null;
  mime_type?: string | null;
}

export async function getAsset(assetId: number): Promise<AssetResponse> {
  const res = await apiClient.get<AssetResponse>(`/assets/${assetId}`);
  return res.data;
}

export async function deleteAsset(assetId: number): Promise<void> {
  await apiClient.delete(`/assets/${assetId}`);
}

export interface ExtractFrameRequest {
  video_asset_id: number;
  timestamp: number;
  frame_number?: number;
}

/**
 * Extract a frame from a video at a specific timestamp.
 * Returns an image asset that can be used for image_to_video or transitions.
 * The extracted frame is linked to the parent video via PAUSED_FRAME lineage.
 */
export async function extractFrame(request: ExtractFrameRequest): Promise<AssetResponse> {
  const res = await apiClient.post<AssetResponse>('/assets/extract-frame', request);
  return res.data;
}

export async function uploadAssetToProvider(assetId: number, providerId: string): Promise<void> {
  await apiClient.post(`/assets/${assetId}/reupload`, {
    provider_id: providerId,
  });
}
