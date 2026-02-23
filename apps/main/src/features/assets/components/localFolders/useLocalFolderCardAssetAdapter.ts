import { useLinkedCardAssetAdapter } from '@features/assets/lib/useLinkedCardAssetAdapter';
import type { AssetModel } from '@features/assets/models/asset';
import type { LocalAsset } from '@features/assets/stores/localFoldersStore';

interface UseLocalFolderCardAssetAdapterOptions {
  visibleAssets: LocalAsset[];
  toFallbackAsset: (asset: LocalAsset) => AssetModel;
}

function getLinkedAssetId(asset: LocalAsset): number | null {
  return typeof asset.last_upload_asset_id === 'number' && asset.last_upload_asset_id > 0
    ? asset.last_upload_asset_id
    : null;
}

function mergeLinkedWithLocal(
  localAsset: LocalAsset,
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
  // Mirror successful provider upload into canonical fields so generation
  // widgets (quick-gen visibility) behave consistently.
  if (localAsset.last_upload_status === 'success' && localAsset.last_upload_provider_id) {
    const providerId = localAsset.last_upload_provider_id;
    if (providerId !== 'library') {
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
  return useLinkedCardAssetAdapter<LocalAsset>({
    visibleItems: visibleAssets,
    getItemKey: (asset) => asset.key,
    getLinkedAssetId,
    toFallbackAsset,
    mergeLinkedWithSource: mergeLinkedWithLocal,
  });
}
