/**
 * Input Display Utilities
 *
 * Centralized helpers for resolving display assets from per-operation inputs.
 */

import type { AssetModel } from '@features/assets';

import type { OperationType } from '@/types/operations';

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
 * 1. Return all input assets.
 * 2. Fallback to lastSelectedAsset if it matches the operation type.
 * 3. Empty array if nothing available.
 */
export function resolveDisplayAssets({
  operationType,
  inputs,
  lastSelectedAsset,
  allowAnySelected = false,
}: DisplayAssetsParams): AssetModel[] {
  if (inputs.length > 0) {
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
