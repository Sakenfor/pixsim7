import { useLinkedCardAssetAdapter } from '@features/assets/lib/useLinkedCardAssetAdapter';
import type { AssetModel } from '@features/assets/models/asset';
import type { LocalAssetModel } from '@features/assets/types/localFolderMeta';

interface UseLocalFolderCardAssetAdapterOptions {
  visibleAssets: LocalAssetModel[];
  toFallbackAsset: (asset: LocalAssetModel) => AssetModel;
}

function getLinkedAssetId(asset: LocalAssetModel): number | null {
  return typeof asset.last_upload_asset_id === 'number' && asset.last_upload_asset_id > 0
    ? asset.last_upload_asset_id
    : null;
}

function mergeLinkedWithLocal(
  localAsset: LocalAssetModel,
  linkedAsset: AssetModel,
  fallbackAsset: AssetModel,
): AssetModel {
  const merged: AssetModel = {
    ...linkedAsset,
    // Prefer local previews/paths in local-folder views so rendering remains fast
    // and continues to work even if remote preview generation lags behind.
    previewUrl: fallbackAsset.previewUrl ?? linkedAsset.previewUrl,
    thumbnailUrl: fallbackAsset.thumbnailUrl ?? linkedAsset.thumbnailUrl,
    fileUrl: fallbackAsset.fileUrl ?? linkedAsset.fileUrl,
    remoteUrl: fallbackAsset.remoteUrl ?? linkedAsset.remoteUrl,
    localPath: fallbackAsset.localPath ?? linkedAsset.localPath,
    sha256: fallbackAsset.sha256 ?? linkedAsset.sha256,
    description: linkedAsset.description ?? fallbackAsset.description,
  };

  // Local upload metadata can be fresher than the library asset fetch result.
  // Mirror provider upload status into canonical fields so generation
  // widgets (quick-gen visibility) and status badges behave consistently.
  if (localAsset.last_upload_provider_id) {
    const providerId = localAsset.last_upload_provider_id;
    if (providerId !== 'library') {
      if (localAsset.last_upload_status === 'success') {
        merged.providerUploads = {
          ...(linkedAsset.providerUploads ?? {}),
          [providerId]:
            linkedAsset.providerUploads?.[providerId]
            ?? linkedAsset.providerAssetId
            ?? String(linkedAsset.id),
        };
        merged.lastUploadStatusByProvider = {
          ...(linkedAsset.lastUploadStatusByProvider ?? {}),
          [providerId]: 'success',
        };
        // Backend asset may still say local_only if it was uploaded to library
        // first — override with the fresher local upload status.
        if (merged.providerStatus === 'local_only' || merged.providerStatus === 'unknown') {
          merged.providerStatus = 'ok';
        }
      } else if (localAsset.last_upload_status === 'error') {
        merged.lastUploadStatusByProvider = {
          ...(linkedAsset.lastUploadStatusByProvider ?? {}),
          [providerId]: 'error',
        };
      }
    }
  }

  return merged;
}

/**
 * Prefer linked library AssetModel for local-folder cards when available, while
 * preserving local preview/path metadata and falling back to a local-converted
 * pseudo-asset before hydration completes.
 */
export function useLocalFolderCardAssetAdapter({
  visibleAssets,
  toFallbackAsset,
}: UseLocalFolderCardAssetAdapterOptions) {
  return useLinkedCardAssetAdapter<LocalAssetModel>({
    visibleItems: visibleAssets,
    getItemKey: (asset) => asset.key,
    getLinkedAssetId,
    toFallbackAsset,
    mergeLinkedWithSource: mergeLinkedWithLocal,
  });
}
