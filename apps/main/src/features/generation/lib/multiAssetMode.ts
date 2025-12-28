/**
 * Multi-Asset Mode Utilities
 *
 * Consolidated logic for determining input mode (single vs multi) and
 * resolving display assets based on operation type and queue state.
 *
 * This module is the single source of truth for multi-asset mode decisions,
 * used by QuickGenerateModule, QuickGeneratePanels, and useQuickGenerateController.
 */

import { OPERATION_METADATA, type OperationType } from '@/types/operations';
import type { AssetModel } from '@features/assets';
import type { QueuedAsset, InputMode } from '../stores/generationQueueStore';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface InputModeParams {
  operationType: OperationType;
  multiAssetQueueLength: number;
  operationInputModePrefs?: Partial<Record<OperationType, InputMode>>;
}

export interface InputModeResult {
  inputMode: InputMode;
  isInMultiMode: boolean;
  isOptionalMultiAsset: boolean;
  isRequiredMultiAsset: boolean;
}

export interface SelectedAssetLike {
  id: number;
  type: 'image' | 'video';
  url: string;
}

export interface DisplayAssetsParams {
  operationType: OperationType;
  mainQueue: QueuedAsset[];
  mainQueueIndex: number;
  multiAssetQueue: QueuedAsset[];
  lastSelectedAsset?: SelectedAssetLike;
  inputMode?: InputMode;
  /** If true, accepts lastSelectedAsset regardless of type match */
  allowAnySelected?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Input Mode Resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves whether an operation should run in single or multi-asset mode.
 *
 * Logic:
 * - `multiAssetMode: 'required'` → always 'multi' (e.g., video_transition)
 * - `multiAssetMode: 'single'` → always 'single' (e.g., video_extend)
 * - `multiAssetMode: 'optional'` → 'multi' if:
 *   - multiAssetQueue has items (auto-multi), OR
 *   - user preference is 'multi'
 *
 * @returns InputModeResult with inputMode and derived flags
 */
export function resolveInputMode({
  operationType,
  multiAssetQueueLength,
  operationInputModePrefs,
}: InputModeParams): InputModeResult {
  const metadata = OPERATION_METADATA[operationType];
  const isOptionalMultiAsset = metadata?.multiAssetMode === 'optional';
  const isRequiredMultiAsset = metadata?.multiAssetMode === 'required';

  // Auto-multi: optional operations with items in queue
  const autoMulti = isOptionalMultiAsset && multiAssetQueueLength > 0;

  // Determine input mode
  let inputMode: InputMode;
  if (isRequiredMultiAsset || autoMulti) {
    inputMode = 'multi';
  } else if (isOptionalMultiAsset && operationInputModePrefs?.[operationType] === 'multi') {
    inputMode = 'multi';
  } else {
    inputMode = 'single';
  }

  return {
    inputMode,
    isInMultiMode: inputMode === 'multi',
    isOptionalMultiAsset,
    isRequiredMultiAsset,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Display Assets Resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a fallback AssetModel from a selected asset reference.
 * Used when no queued assets are available but an asset is selected in the gallery.
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
 * Resolves which assets to display based on operation type and queue state.
 *
 * Priority:
 * 1. Multi-asset mode: return all assets from multiAssetQueue
 * 2. Single-asset mode with mainQueue: return current item from mainQueue
 * 3. Fallback to multiAssetQueue[0] if available (for transition from multi to single)
 * 4. Fallback to lastSelectedAsset if it matches the operation type
 * 5. Empty array if nothing available
 */
export function resolveDisplayAssets({
  operationType,
  mainQueue,
  mainQueueIndex,
  multiAssetQueue,
  lastSelectedAsset,
  inputMode,
  allowAnySelected = false,
}: DisplayAssetsParams): AssetModel[] {
  // Resolve input mode if not provided
  const { isInMultiMode } = inputMode
    ? { isInMultiMode: inputMode === 'multi' }
    : resolveInputMode({
        operationType,
        multiAssetQueueLength: multiAssetQueue.length,
      });

  // Multi-asset mode: return all from multiAssetQueue
  if ((operationType === 'video_transition' || isInMultiMode) && multiAssetQueue.length > 0) {
    return multiAssetQueue.map(item => item.asset);
  }

  // Single-asset mode: return current from mainQueue
  if (mainQueue.length > 0) {
    const index = Math.max(0, Math.min(mainQueueIndex - 1, mainQueue.length - 1));
    return [mainQueue[index].asset];
  }

  // Fallback: check multiAssetQueue (handles transition from multi to single mode)
  if (multiAssetQueue.length > 0) {
    return [multiAssetQueue[0].asset];
  }

  // Fallback: use lastSelectedAsset if it matches the operation
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
