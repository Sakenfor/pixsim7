/**
 * Internal Asset Model
 *
 * This is the canonical asset shape for use throughout the app's UI layer.
 * All fields are camelCase. API boundary types (AssetResponse) remain snake_case
 * and should only be used at the fetch boundary.
 */

import type { AssetResponse } from '@pixsim7/api-client/domains';
import type { ViewerAsset } from '../stores/assetViewerStore';

// Re-export the media type for convenience
export type AssetMediaType = 'video' | 'image' | 'audio' | '3d_model';
export type AssetSyncStatus = 'remote' | 'downloading' | 'downloaded' | 'error';
export type AssetProviderStatus = 'ok' | 'local_only' | 'unknown' | 'flagged';

export interface TagSummary {
  id: number;
  name: string;
  namespace: string;
  slug: string;
  displayName?: string | null;
}

/**
 * Internal asset model with camelCase fields.
 * Use this throughout UI/feature code instead of AssetResponse.
 */
export interface AssetModel {
  id: number;
  createdAt: string;
  description?: string | null;
  durationSec?: number | null;
  fileSizeBytes?: number | null;
  fileUrl?: string | null;
  height?: number | null;
  isArchived: boolean;
  lastUploadStatusByProvider?: Record<string, 'success' | 'error'> | null;
  localPath?: string | null;
  mediaType: AssetMediaType;
  mimeType?: string | null;
  previewKey?: string | null;
  previewUrl?: string | null;
  providerAssetId: string;
  providerId: string;
  providerStatus?: AssetProviderStatus | null;
  /** Map of provider_id -> uploaded asset URL/ID for cross-provider operations */
  providerUploads?: Record<string, string> | null;
  remoteUrl?: string | null;
  sourceGenerationId?: number | null;
  storedKey?: string | null;
  syncStatus: AssetSyncStatus;
  tags?: TagSummary[];
  thumbnailKey?: string | null;
  thumbnailUrl?: string | null;
  userId: number;
  width?: number | null;
}

/**
 * Maps an API AssetResponse to internal AssetModel.
 * This is the only place where snake_case -> camelCase conversion happens.
 */
export function fromAssetResponse(response: AssetResponse): AssetModel {
  return {
    id: response.id,
    createdAt: response.created_at,
    description: response.description,
    durationSec: response.duration_sec,
    fileSizeBytes: response.file_size_bytes,
    fileUrl: response.file_url,
    height: response.height,
    isArchived: response.is_archived,
    lastUploadStatusByProvider: response.last_upload_status_by_provider as
      | Record<string, 'success' | 'error'>
      | null
      | undefined,
    localPath: response.local_path,
    mediaType: response.media_type,
    mimeType: response.mime_type,
    previewKey: response.preview_key,
    previewUrl: response.preview_url,
    providerAssetId: response.provider_asset_id,
    providerId: response.provider_id,
    providerStatus: response.provider_status,
    providerUploads: (response as any).provider_uploads as Record<string, string> | null | undefined,
    remoteUrl: response.remote_url,
    sourceGenerationId: response.source_generation_id,
    storedKey: response.stored_key,
    syncStatus: response.sync_status,
    tags: response.tags?.map((tag) => ({
      id: tag.id,
      name: tag.name,
      namespace: tag.namespace,
      slug: tag.slug,
      displayName: tag.display_name,
    })),
    thumbnailKey: response.thumbnail_key,
    thumbnailUrl: response.thumbnail_url,
    userId: response.user_id,
    width: response.width,
  };
}

/**
 * Maps an array of API AssetResponses to internal AssetModels.
 */
export function fromAssetResponses(responses: AssetResponse[]): AssetModel[] {
  return responses.map(fromAssetResponse);
}

/**
 * Maps an AssetModel to ViewerAsset format.
 * ViewerAsset only supports 'image' | 'video' types, so audio and 3d_model
 * are mapped to 'image' as a fallback (viewer will show thumbnail).
 */
export function toViewerAsset(asset: AssetModel): ViewerAsset {
  // ViewerAsset only supports image/video - map others to image as fallback
  const viewerType: 'image' | 'video' =
    asset.mediaType === 'video' ? 'video' : 'image';

  return {
    id: asset.id,
    name: asset.description || `Asset ${asset.id}`,
    type: viewerType,
    url: asset.thumbnailUrl || asset.remoteUrl || asset.fileUrl || '',
    fullUrl: asset.remoteUrl || undefined,
    source: 'gallery',
    sourceGenerationId: asset.sourceGenerationId ?? undefined,
    metadata: {
      description: asset.description ?? undefined,
      tags: asset.tags?.map((t) => t.name),
      size: asset.fileSizeBytes ?? undefined,
      createdAt: asset.createdAt,
      providerId: asset.providerId,
      duration: asset.durationSec ?? undefined,
    },
  };
}

/**
 * Maps an array of AssetModels to ViewerAssets.
 */
export function toViewerAssets(assets: AssetModel[]): ViewerAsset[] {
  return assets.map(toViewerAsset);
}
