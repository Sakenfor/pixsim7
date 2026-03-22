/**
 * Convert a LocalAsset to an AssetModel.
 *
 * This is the single conversion point for local folder files → the
 * canonical asset model used throughout the app. Unuploaded files get
 * a stable negative ID and `providerId: 'local'`. Once a file has been
 * uploaded (`last_upload_asset_id` is set), the real backend ID and
 * provider are used instead.
 *
 * The returned AssetModel can be passed to MediaCard, generation,
 * viewer, and any other component that accepts AssetModel — no special
 * local-folder handling required downstream.
 */

import type { AssetModel } from '../models/asset';
import type { LocalAsset } from '../stores/localFoldersStore';

/**
 * Deterministic negative ID for unuploaded local files.
 * Stable across renders for the same asset key.
 */
export function hashStringToStableNegativeId(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  const normalized = Math.abs(hash) || 1;
  return -normalized;
}

export interface LocalAssetConvertOptions {
  /** Resolved blob URL for preview/thumbnail (from controller previews cache) */
  previewUrl?: string;
  /** Default provider ID to use for uploaded assets when none stored on the asset */
  defaultProviderId?: string;
}

export function localAssetToAssetModel(
  asset: LocalAsset,
  options: LocalAssetConvertOptions = {},
): AssetModel {
  const { previewUrl, defaultProviderId } = options;

  const uploadedAssetId =
    typeof asset.last_upload_asset_id === 'number' && asset.last_upload_asset_id > 0
      ? asset.last_upload_asset_id
      : undefined;

  const id = uploadedAssetId ?? hashStringToStableNegativeId(asset.key);
  const isUploaded = !!uploadedAssetId;

  const mediaType = asset.kind === 'video' ? 'video' : 'image';
  const providerId = isUploaded
    ? (asset.last_upload_provider_id || defaultProviderId || 'library')
    : 'local';
  const providerStatus = isUploaded ? 'ok' : 'local_only';

  return {
    id,
    createdAt: new Date(asset.lastModified || Date.now()).toISOString(),
    description: asset.name,
    durationSec: null,
    fileSizeBytes: asset.size ?? null,
    fileUrl: previewUrl ?? null,
    height: asset.height ?? null,
    isArchived: false,
    localPath: asset.relativePath,
    mediaType,
    previewUrl: previewUrl ?? null,
    providerAssetId: isUploaded ? String(uploadedAssetId) : asset.key,
    providerId,
    providerStatus,
    remoteUrl: previewUrl ?? null,
    syncStatus: 'downloaded',
    thumbnailUrl: previewUrl ?? null,
    userId: 0,
    width: asset.width ?? null,
    sha256: asset.sha256 ?? null,
  };
}
