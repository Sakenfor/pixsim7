/**
 * Input Display Utilities
 *
 * Centralized helpers for resolving display assets from per-operation inputs.
 */

import type { AssetModel } from '@features/assets';

import { OPERATION_METADATA, type OperationType } from '@/types/operations';

import type { InputItem } from '../stores/generationInputStore';

export interface SelectedAssetLike {
  id: number;
  type: 'image' | 'video';
  url: string;
}

export interface DisplayAssetsParams {
  operationType: OperationType;
  inputs: InputItem[];
  currentIndex: number;
  lastSelectedAsset?: SelectedAssetLike;
  /** If true, accepts lastSelectedAsset regardless of type match */
  allowAnySelected?: boolean;
}

/**
 * Builds a fallback AssetModel from a selected asset reference.
 * Used when no inputs are available but an asset is selected in the gallery.
 */
export function buildFallbackAsset(asset: SelectedAssetLike): AssetModel {
  return {
    id: asset.id,
    createdAt: new Date().toISOString(),
    description: null,
    durationSec: null,
    fileSizeBytes: null,
    fileUrl: asset.url,
    height: null,
    isArchived: false,
    lastUploadStatusByProvider: null,
    localPath: null,
    mediaType: asset.type,
    mimeType: null,
    previewKey: null,
    previewUrl: asset.url,
    providerAssetId: String(asset.id),
    providerId: 'local',
    providerStatus: null,
    remoteUrl: asset.url,
    sourceGenerationId: null,
    storedKey: null,
    syncStatus: 'remote',
    tags: undefined,
    thumbnailKey: null,
    thumbnailUrl: asset.url,
    userId: 0,
    width: null,
  };
}

/**
 * Resolves which assets to display based on operation type and input state.
 *
 * Priority:
 * 1. Single-mode ops: return current input (by index).
 * 2. Multi-mode ops: return all input assets.
 * 3. Fallback to lastSelectedAsset if it matches the operation type.
 * 4. Empty array if nothing available.
 */
export function resolveDisplayAssets({
  operationType,
  inputs,
  currentIndex,
  lastSelectedAsset,
  allowAnySelected = false,
}: DisplayAssetsParams): AssetModel[] {
  const metadata = OPERATION_METADATA[operationType];
  const isSingleMode = metadata?.multiAssetMode === 'single';

  if (inputs.length > 0) {
    if (isSingleMode) {
      const index = Math.max(0, Math.min(currentIndex - 1, inputs.length - 1));
      return [inputs[index].asset];
    }
    return inputs.map(item => item.asset);
  }

  if (lastSelectedAsset) {
    const matchesOperation =
      (operationType === 'image_to_video' && lastSelectedAsset.type === 'image') ||
      (operationType === 'image_to_image' && lastSelectedAsset.type === 'image') ||
      (operationType === 'video_extend' && lastSelectedAsset.type === 'video');

    if (matchesOperation || allowAnySelected) {
      return [buildFallbackAsset(lastSelectedAsset)];
    }
  }

  return [];
}
