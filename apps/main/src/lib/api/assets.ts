/**
 * Assets API Client
 *
 * Typed API client for /api/v1/assets endpoint.
 * Uses OpenAPI-generated types for type safety and contract alignment.
 */
import { pixsimClient } from './client';
import { createAssetsApi } from '@pixsim7/api-client/domains';
import type {
  AssetListResponse,
  AssetResponse,
  EnrichAssetResponse,
  ExtractFrameRequest,
  FilterDefinition,
  FilterMetadataResponse,
  FilterMetadataQueryOptions,
  FilterOptionValue,
  ListAssetsQuery,
  ReuploadAssetRequest,
} from '@pixsim7/api-client/domains';

export type {
  AssetListResponse,
  AssetResponse,
  EnrichAssetResponse,
  ExtractFrameRequest,
  ReuploadAssetRequest,
  ListAssetsQuery,
  FilterDefinition,
  FilterOptionValue,
  FilterMetadataResponse,
  FilterMetadataQueryOptions,
} from '@pixsim7/api-client/domains';

const assetsApi = createAssetsApi(pixsimClient);

// ============================================================================
// API Functions
// ============================================================================

export const listAssets = assetsApi.listAssets;
export const getAsset = assetsApi.getAsset;
export const deleteAsset = assetsApi.deleteAsset;

/**
 * Archive or unarchive an asset.
 * Archived assets are soft-hidden from the default gallery view.
 */
export const archiveAsset = assetsApi.archiveAsset;

/**
 * Extract a frame from a video at a specific timestamp.
 * Returns an image asset that can be used for image_to_video or transitions.
 * The extracted frame is linked to the parent video via PAUSED_FRAME lineage.
 */
export const extractFrame = assetsApi.extractFrame;

export const uploadAssetToProvider = assetsApi.uploadAssetToProvider;

/**
 * Enrich an asset by fetching metadata from the provider.
 * Creates a synthetic Generation record with prompt/params.
 */
export const enrichAsset = assetsApi.enrichAsset;

/**
 * Download an asset to the user's device.
 * Uses the asset's remote_url or falls back to the file endpoint.
 */
/**
 * Get available filter definitions and options for the assets gallery.
 * Returns filter schema + available values for enum types.
 */
export const getFilterMetadata: (
  options?: FilterMetadataQueryOptions
) => Promise<FilterMetadataResponse> =
  assetsApi.getFilterMetadata;

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
