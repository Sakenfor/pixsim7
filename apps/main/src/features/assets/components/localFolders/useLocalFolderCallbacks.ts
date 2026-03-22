import { createAssetActions } from '@pixsim7/shared.assets.core';
import { useToast } from '@pixsim7/shared.ui';
import { useCallback, useMemo } from 'react';

import { useMediaGenerationActions } from '@features/generation/hooks/useMediaGenerationActions';

import type { AssetUploadState } from '@/components/media/AssetGallery';
import type { MediaCardActions } from '@/components/media/MediaCard';
import type { LocalFoldersController } from '@/types/localSources';

import { resolveLocalUploadState } from '../../lib/localAssetState';
import { localAssetToAssetModel } from '../../lib/localAssetToAssetModel';
import { extractUploadError, notifyGalleryOfUpdatedAsset, resolveProviderLabel } from '../../lib/uploadActions';
import type { AssetModel } from '../../models/asset';
import type { LocalAsset } from '../../stores/localFoldersStore';

import type { HashFilterState, UploadFilterState } from './constants';

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
      resolveLocalUploadState(asset, controller.uploadStatus),
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
      if (resolveLocalUploadState(asset, controller.uploadStatus) === 'success') return undefined;
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
        // Notify gallery so the updated asset reflects the new provider upload status
        if (assetId) {
          try {
            await notifyGalleryOfUpdatedAsset(assetId);
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
    return localAssetToAssetModel(asset, {
      previewUrl: controllerPreviews[asset.key],
      defaultProviderId: controller.providerId,
    });
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
    // Forward burst count and duration from gesture system for swipe-distance scaling.
    if (asset.last_upload_asset_id != null) {
      actions.onQuickGenerate = (_id?: number, count?: number, overrides?: { duration?: number }) =>
        quickGenerate(assetModel, { count, duration: overrides?.duration });
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
