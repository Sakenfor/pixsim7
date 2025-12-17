/**
 * Assets API Client
 *
 * Typed API client for /api/v1/assets endpoint.
 * Uses OpenAPI-generated types for type safety and contract alignment.
 */
import { apiClient } from './client';
import type { ApiComponents, ApiOperations } from '@pixsim7/shared.types';

// ============================================================================
// OpenAPI-Derived Types (Generated from backend contract)
// ============================================================================

export type AssetResponse = ApiComponents['schemas']['AssetResponse'];
export type AssetListResponse = ApiComponents['schemas']['AssetListResponse'];
export type ExtractFrameRequest = ApiComponents['schemas']['ExtractFrameRequest'];
export type ReuploadAssetRequest = ApiComponents['schemas']['ReuploadAssetRequest'];

export type ListAssetsQuery =
  ApiOperations['list_assets_api_v1_assets_get']['parameters']['query'];

// ============================================================================
// Helper Functions
// ============================================================================

function buildQueryString(query?: Record<string, unknown>): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

// ============================================================================
// API Functions
// ============================================================================

export async function listAssets(query?: ListAssetsQuery): Promise<AssetListResponse> {
  const res = await apiClient.get<AssetListResponse>(`/assets${buildQueryString(query as any)}`);
  return res.data;
}

export async function getAsset(assetId: number): Promise<AssetResponse> {
  const res = await apiClient.get<AssetResponse>(`/assets/${assetId}`);
  return res.data;
}

export async function deleteAsset(assetId: number): Promise<void> {
  await apiClient.delete(`/assets/${assetId}`);
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
  const payload: ReuploadAssetRequest = { provider_id: providerId };
  await apiClient.post(`/assets/${assetId}/reupload`, payload);
}

/**
 * Download an asset to the user's device.
 * Uses the asset's remote_url or falls back to the file endpoint.
 */
export async function downloadAsset(asset: AssetResponse): Promise<void> {
  const downloadUrl = asset.remote_url || asset.file_url || `/api/v1/assets/${asset.id}/file`;

  const link = document.createElement('a');
  link.href = downloadUrl;

  const urlParts = downloadUrl.split('/');
  const filename = urlParts[urlParts.length - 1] || `asset_${asset.id}`;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

