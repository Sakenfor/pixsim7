/**
 * Auto-upload local-only assets before generation.
 *
 * Local folder assets that haven't been uploaded to the library yet have
 * negative IDs (from hashStringToStableNegativeId) and blob: preview URLs.
 * The backend can't resolve blob: URLs, so we upload them first and
 * patch the InputItem with the real asset ID and backend file URL.
 */

import { uploadAsset } from '@lib/api/upload';

import { useLocalFolders, type LocalAssetModel } from '@features/assets';

import type { InputItem } from '../stores/generationInputStore';

/**
 * Check whether an asset is a local-only asset that needs uploading.
 * Local assets have `_localKey` and a non-positive ID.
 */
function isLocalOnlyAsset(asset: InputItem['asset']): asset is LocalAssetModel {
  const local = asset as Partial<LocalAssetModel>;
  if (!local._localKey) return false;
  const id = typeof asset.id === 'number' ? asset.id : NaN;
  return !Number.isFinite(id) || id <= 0;
}

/**
 * Upload a single local-only asset and return an updated InputItem.
 * Returns the original item if upload fails or the asset is already uploaded.
 */
async function uploadLocalInput(item: InputItem): Promise<InputItem> {
  const asset = item.asset as LocalAssetModel;

  const file = await useLocalFolders.getState().getFileForAsset(asset._localKey);
  if (!file) {
    console.warn('[ensureInputsUploaded] Could not retrieve file for', asset._localKey);
    return item;
  }

  try {
    const response = await uploadAsset({
      file,
      filename: file.name,
      saveTarget: 'library',
      uploadMethod: 'local',
      uploadContext: {
        client: 'web_app',
        feature: 'quickgen_auto_upload',
      },
      sourceFolderId: asset._folderId,
      sourceRelativePath: asset.relativePath,
    });

    if (typeof response?.asset_id !== 'number') {
      console.warn('[ensureInputsUploaded] Upload succeeded but no asset_id returned');
      return item;
    }

    const backendFileUrl = `/api/v1/assets/${response.asset_id}/file`;

    // Update local folder meta so future uses skip re-upload
    useLocalFolders.getState().updateAssetUploadStatus(asset._localKey, 'success', undefined, {
      providerId: response.provider_id,
      assetId: response.asset_id,
    });

    return {
      ...item,
      asset: {
        ...item.asset,
        id: response.asset_id,
        fileUrl: backendFileUrl,
        remoteUrl: backendFileUrl,
      },
    };
  } catch (err) {
    console.warn('[ensureInputsUploaded] Upload failed for', asset._localKey, err);
    return item;
  }
}

/**
 * Ensure all inputs have valid (positive) asset IDs by auto-uploading
 * any local-only assets. Returns a new array with patched items.
 * Items that are already uploaded or fail upload are passed through unchanged.
 */
export async function ensureInputsUploaded(inputs: InputItem[]): Promise<InputItem[]> {
  const localIndices: number[] = [];
  for (let i = 0; i < inputs.length; i++) {
    if (isLocalOnlyAsset(inputs[i].asset)) {
      localIndices.push(i);
    }
  }

  if (localIndices.length === 0) return inputs;

  // Upload in parallel
  const uploadPromises = localIndices.map((i) => uploadLocalInput(inputs[i]));
  const uploadedItems = await Promise.all(uploadPromises);

  const result = [...inputs];
  for (let j = 0; j < localIndices.length; j++) {
    result[localIndices[j]] = uploadedItems[j];
  }
  return result;
}
