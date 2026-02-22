import { createAssetActions } from '@pixsim7/shared.assets.core';
import { useToast } from '@pixsim7/shared.ui';
import { useCallback, useMemo } from 'react';

import { useMediaGenerationActions } from '@features/generation/hooks/useMediaGenerationActions';

import type { AssetUploadState } from '@/components/media/AssetGallery';
import type { MediaCardActions } from '@/components/media/MediaCard';
import type { LocalFoldersController } from '@/types/localSources';

import { extractUploadError, notifyGalleryOfNewAsset, resolveProviderLabel } from '../../lib/uploadActions';
import type { AssetModel } from '../../models/asset';
import type { LocalAsset } from '../../stores/localFoldersStore';

import type { HashFilterState, UploadFilterState } from './constants';
import { hashStringToStableNegativeId } from './utils';

export interface UseLocalFolderCallbacksParams {
  controller: LocalFoldersController;
  openLocalAsset: (
    asset: LocalAsset,
    previewUrl: string | undefined,
    viewerItems: LocalAsset[],
    previews: Record<string, string>,
    fullUrl?: string,
  ) => void;
}

export function useLocalFolderCallbacks({
  controller,
  openLocalAsset,
}: UseLocalFolderCallbacksParams) {
  const toast = useToast();
  const {
    queueImageToImage,
    queueImageToVideo,
    queueVideoExtend,
    queueAddToTransition,
    queueAutoGenerate,
    quickGenerate,
  } = useMediaGenerationActions();

  const controllerPreviews = controller.previews;
  const controllerGetFileForAsset = controller.getFileForAsset;
  const controllerUploadOne = controller.uploadOne;
  const controllerUploadOneToLibrary = controller.uploadOneToLibrary;

  const getAssetKey = useCallback((asset: LocalAsset) => asset.key, []);
  const getPreviewUrl = useCallback(
    (asset: LocalAsset) => controllerPreviews[asset.key],
    [controllerPreviews]
  );
  const getMediaType = useCallback(
    (asset: LocalAsset): 'video' | 'image' => (asset.kind === 'video' ? 'video' : 'image'),
    []
  );

  const shaDuplicates = useMemo(() => {
    const counts = new Map<string, number>();
    for (const asset of controller.assets) {
      if (asset.sha256) {
        counts.set(asset.sha256, (counts.get(asset.sha256) || 0) + 1);
      }
    }
    return counts;
  }, [controller.assets]);

  const getDescription = useCallback((asset: LocalAsset) => {
    const parts = [asset.name];

    if (asset.size) {
      const sizeKB = asset.size / 1024;
      const sizeMB = sizeKB / 1024;
      const sizeStr = sizeMB >= 1
        ? `${sizeMB.toFixed(1)}MB`
        : `${Math.round(sizeKB)}KB`;
      parts.push(`(${sizeStr})`);
    }

    if (asset.sha256) {
      parts.push(`• #${asset.sha256.slice(0, 6)}`);
    }

    return parts.join(' ');
  }, []);

  const getTags = useCallback(
    (asset: LocalAsset) => {
      const tags: string[] = [];

      const folderPath = asset.relativePath.split('/').slice(0, -1).join('/');
      if (folderPath) {
        tags.push(`📁 ${folderPath}`);
      }

      if (asset.size) {
        const sizeKB = asset.size / 1024;
        const sizeMB = sizeKB / 1024;
        const sizeStr = sizeMB >= 1
          ? `${sizeMB.toFixed(1)} MB`
          : `${Math.round(sizeKB)} KB`;
        tags.push(sizeStr);
      }

      if (asset.sha256) {
        const dupCount = shaDuplicates.get(asset.sha256) || 1;
        if (dupCount > 1) {
          tags.push(`⚠️ ${dupCount} copies`);
        }
        tags.push(`#${asset.sha256.slice(0, 8)}`);
      }

      if (asset.last_upload_status === 'success') {
        tags.push('✓ uploaded');
      } else if (asset.last_upload_asset_id) {
        tags.push(`→ asset:${asset.last_upload_asset_id}`);
      }

      return tags;
    },
    [shaDuplicates]
  );

  const getCreatedAt = useCallback(
    (asset: LocalAsset) => new Date(asset.lastModified || Date.now()).toISOString(),
    []
  );

  const getUploadState = useCallback(
    (asset: LocalAsset): AssetUploadState =>
      controller.uploadStatus[asset.key] || asset.last_upload_status || 'idle',
    [controller.uploadStatus]
  );

  const getUploadFilterState = useCallback((asset: LocalAsset): UploadFilterState => {
    const state = getUploadState(asset);
    if (state === 'success') return 'uploaded';
    if (state === 'uploading') return 'uploading';
    if (state === 'error') return 'failed';
    return 'pending';
  }, [getUploadState]);

  const getHashFilterState = useCallback((asset: LocalAsset): HashFilterState => {
    if (!asset.sha256) {
      return controller.hashingProgress ? 'hashing' : 'unhashed';
    }
    const dupCount = shaDuplicates.get(asset.sha256) || 1;
    return dupCount > 1 ? 'duplicate' : 'unique';
  }, [controller.hashingProgress, shaDuplicates]);

  const getHashStatus = useCallback(
    (asset: LocalAsset): 'unique' | 'duplicate' | 'hashing' | undefined => {
      if (controller.uploadStatus[asset.key] === 'success') return undefined;
      if (!asset.sha256) {
        return controller.hashingProgress ? 'hashing' : undefined;
      }
      const dupCount = shaDuplicates.get(asset.sha256) || 1;
      return dupCount > 1 ? 'duplicate' : 'unique';
    },
    [shaDuplicates, controller.uploadStatus, controller.hashingProgress]
  );

  const openAssetInViewer = useCallback(
    async (
      asset: LocalAsset,
      viewerItems: LocalAsset[],
      resolvedPreviewUrl?: string,
    ) => {
      const previewUrl = resolvedPreviewUrl || controllerPreviews[asset.key];
      let fullUrl: string | undefined;
      try {
        const file = await controllerGetFileForAsset(asset);
        if (file) {
          fullUrl = URL.createObjectURL(file);
        }
      } catch {
        // Fall back to preview URL if file access fails
      }
      openLocalAsset(asset, previewUrl, viewerItems, controllerPreviews, fullUrl);
    },
    [openLocalAsset, controllerPreviews, controllerGetFileForAsset]
  );

  const handleUpload = useCallback(
    (asset: LocalAsset) => {
      if (controllerUploadOneToLibrary) {
        return controllerUploadOneToLibrary(asset);
      }
      return controllerUploadOne(asset);
    },
    [controllerUploadOne, controllerUploadOneToLibrary]
  );

  const handleUploadToProvider = useCallback(
    async (asset: LocalAsset, providerId: string) => {
      try {
        let assetId: number | undefined;
        if (providerId === 'library') {
          if (controllerUploadOneToLibrary) {
            await controllerUploadOneToLibrary(asset);
          } else {
            await controllerUploadOne(asset);
          }
          toast.success('Saved to library');
        } else {
          const result = await controller.uploadOneToProvider(asset, providerId);
          assetId = result?.asset_id;
          toast.success(`Uploaded to ${resolveProviderLabel(providerId)}`);
        }
        // Notify gallery so the new/updated asset appears without a page refresh
        if (assetId) {
          try {
            await notifyGalleryOfNewAsset(assetId);
          } catch { /* best-effort */ }
        }
      } catch (e: unknown) {
        toast.error(extractUploadError(e));
      }
    },
    [controller, controllerUploadOne, controllerUploadOneToLibrary, toast],
  );

  const getIsFavorite = useCallback(
    (asset: LocalAsset) => controller.favoriteStatus[asset.key] ?? false,
    [controller.favoriteStatus],
  );

  const handleToggleFavorite = useCallback(async (asset: LocalAsset) => {
    const wasFavorite = controller.favoriteStatus[asset.key] ?? false;
    const needsLibrarySave = !asset.last_upload_asset_id;

    try {
      await controller.toggleFavoriteOne(asset);
      if (wasFavorite) {
        toast.success('Removed from favorites.');
      } else if (needsLibrarySave) {
        toast.success('Saved to library and added to favorites.');
      } else {
        toast.success('Added to favorites.');
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to update favorite.';
      toast.error(message);
    }
  }, [controller, toast]);

  const toGenerationInputAsset = useCallback((asset: LocalAsset): AssetModel => {
    const previewUrl = controllerPreviews[asset.key];
    const uploadedAssetId =
      typeof asset.last_upload_asset_id === 'number' && asset.last_upload_asset_id > 0
        ? asset.last_upload_asset_id
        : undefined;
    const assetId = uploadedAssetId ?? hashStringToStableNegativeId(asset.key);
    const createdAt = new Date(asset.lastModified || Date.now()).toISOString();
    const mediaType = asset.kind === 'video' ? 'video' : 'image';
    const providerStatus = uploadedAssetId ? 'ok' : 'local_only';
    const providerId = uploadedAssetId
      ? (asset.last_upload_provider_id || controller.providerId || 'library')
      : 'local';

    return {
      id: assetId,
      createdAt,
      description: asset.name,
      durationSec: null,
      fileSizeBytes: asset.size ?? null,
      fileUrl: previewUrl ?? null,
      height: asset.height ?? null,
      isArchived: false,
      localPath: asset.relativePath,
      mediaType,
      previewUrl: previewUrl ?? null,
      providerAssetId: uploadedAssetId ? String(uploadedAssetId) : asset.key,
      providerId,
      providerStatus,
      remoteUrl: previewUrl ?? null,
      syncStatus: 'downloaded',
      thumbnailUrl: previewUrl ?? null,
      userId: 0,
      width: asset.width ?? null,
      sha256: asset.sha256 ?? null,
    };
  }, [controller.providerId, controllerPreviews]);

  const generationHandlers = useMemo(() => ({
    onImageToImage: queueImageToImage,
    onImageToVideo: queueImageToVideo,
    onVideoExtend: queueVideoExtend,
    onAddToTransition: queueAddToTransition,
    onAddToGenerate: queueAutoGenerate,
    onQuickAdd: quickGenerate,
  }), [
    queueImageToImage,
    queueImageToVideo,
    queueVideoExtend,
    queueAddToTransition,
    queueAutoGenerate,
    quickGenerate,
  ]);

  const getLocalMediaCardActions = useCallback((asset: LocalAsset): MediaCardActions => {
    const assetModel = toGenerationInputAsset(asset);
    const actions = createAssetActions(assetModel, generationHandlers);

    // Gate quick-generate behind upload status (needs a provider asset)
    if (asset.last_upload_asset_id != null) {
      actions.onQuickGenerate = () => quickGenerate(assetModel);
    }

    return actions;
  }, [generationHandlers, toGenerationInputAsset, quickGenerate]);

  return {
    getAssetKey,
    getPreviewUrl,
    getMediaType,
    shaDuplicates,
    getDescription,
    getTags,
    getCreatedAt,
    getUploadState,
    getUploadFilterState,
    getHashFilterState,
    getHashStatus,
    openAssetInViewer,
    handleUpload,
    handleUploadToProvider,
    getIsFavorite,
    handleToggleFavorite,
    toGenerationInputAsset,
    getLocalMediaCardActions,
  };
}
