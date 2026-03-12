import type { AssetUploadState } from '@/components/media/AssetGallery';

import type { LocalAsset } from '../stores/localFoldersStore';

export type LocalUploadStatusMap = Readonly<Record<string, AssetUploadState | undefined>>;

function isAssetUploadState(value: unknown): value is AssetUploadState {
  return value === 'idle'
    || value === 'uploading'
    || value === 'success'
    || value === 'error';
}

export function resolveLocalUploadState(
  asset: Pick<LocalAsset, 'key' | 'last_upload_status'>,
  uploadStatusMap: LocalUploadStatusMap,
): AssetUploadState {
  const inMemoryState = uploadStatusMap[asset.key];
  if (isAssetUploadState(inMemoryState)) {
    return inMemoryState;
  }

  const persistedState = asset.last_upload_status;
  if (isAssetUploadState(persistedState)) {
    return persistedState;
  }

  return 'idle';
}

export function isPendingUploadState(state: AssetUploadState): boolean {
  return state === 'idle';
}

export function isFailedUploadState(state: AssetUploadState): boolean {
  return state === 'error';
}

export function canUploadToLibraryFromState(state: AssetUploadState): boolean {
  return state === 'idle' || state === 'error';
}
