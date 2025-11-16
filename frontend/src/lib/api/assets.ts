import { apiClient } from './api/client';

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

