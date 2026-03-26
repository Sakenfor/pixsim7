/**
 * useAssetViewer Hook
 *
 * Helper hook for opening assets in the viewer from different contexts.
 * Converts various asset formats to the unified ViewerAsset format.
 */

import { useCallback, useEffect } from 'react';

import { type AssetModel, toViewerAsset, toViewerAssets } from '../models/asset';
import { useAssetViewerStore, type ViewerAsset } from '../stores/assetViewerStore';
import type { LocalAssetModel } from '../types/localFolderMeta';

/**
 * Registers a navigation scope with the asset viewer while the component is mounted.
 * Automatically unregisters on unmount or when disabled.
 */
export function useViewerScopeSync(
  scopeId: string,
  label: string,
  assets: ViewerAsset[],
  enabled: boolean,
) {
  const registerScope = useAssetViewerStore((s) => s.registerScope);
  const unregisterScope = useAssetViewerStore((s) => s.unregisterScope);

  // Sync scope data when it changes (registerScope upserts)
  useEffect(() => {
    if (enabled && assets.length > 0) {
      registerScope(scopeId, label, assets);
    }
  }, [enabled, scopeId, label, assets, registerScope]);

  // Unregister only on unmount or when disabled/scopeId changes
  useEffect(() => {
    return () => {
      unregisterScope(scopeId);
    };
   
  }, [scopeId, unregisterScope]);
}

interface UseAssetViewerOptions {
  source: 'gallery' | 'local';
  localMetadataResolver?: (asset: LocalAssetModel) => Partial<ViewerAsset['metadata']>;
}

export function useAssetViewer(options: UseAssetViewerOptions) {
  const { localMetadataResolver } = options;
  const openViewer = useAssetViewerStore((s) => s.openViewer);
  const closeViewer = useAssetViewerStore((s) => s.closeViewer);
  const updateAssetList = useAssetViewerStore((s) => s.updateAssetList);

  /**
   * Convert gallery asset (AssetModel) to ViewerAsset
   * Uses the centralized toViewerAsset mapper from models/asset.ts
   */
  const galleryAssetToViewer = useCallback(
    (asset: AssetModel): ViewerAsset => toViewerAsset(asset),
    []
  );

  /**
   * Convert local asset to ViewerAsset.
   * Uses `source: 'local'` so the viewer/mask overlay knows this is from local folders.
   */
  const localAssetToViewer = useCallback(
    (asset: LocalAssetModel, previewUrl?: string, fullUrl?: string): ViewerAsset => ({
      id: asset.key,
      name: asset.description || asset.key,
      type: asset.mediaType === 'video' ? 'video' : 'image',
      url: previewUrl || asset.previewUrl || '',
      fullUrl,
      source: 'local',
      _assetModel: asset,
      metadata: {
        path: asset.relativePath,
        size: asset.size ?? asset.fileSizeBytes ?? undefined,
        createdAt: asset.lastModified
          ? new Date(asset.lastModified).toISOString()
          : asset.createdAt,
        folderId: asset.folderId,
        ...(localMetadataResolver?.(asset) ?? {}),
      },
    }),
    [localMetadataResolver]
  );

  /**
   * Open a gallery asset in the viewer
   */
  const openGalleryAsset = useCallback(
    (asset: AssetModel, allAssets?: AssetModel[]) => {
      const viewerAsset = toViewerAsset(asset);
      const viewerList = allAssets ? toViewerAssets(allAssets) : undefined;
      openViewer(viewerAsset, viewerList, 'gallery');
    },
    [openViewer]
  );

  /**
   * Open a local asset in the viewer
   */
  const openLocalAsset = useCallback(
    (
      asset: LocalAssetModel,
      previewUrl: string | undefined,
      allAssets?: LocalAssetModel[],
      previews?: Record<string, string>,
      fullUrl?: string
    ) => {
      const viewerAsset = localAssetToViewer(asset, previewUrl, fullUrl);
      const viewerList = allAssets?.map((a) =>
        localAssetToViewer(a, previews?.[a.key])
      );
      openViewer(viewerAsset, viewerList, 'local');
    },
    [openViewer, localAssetToViewer]
  );

  /**
   * Update the asset list (e.g., when filters change)
   */
  const updateGalleryList = useCallback(
    (assets: AssetModel[]) => {
      updateAssetList(toViewerAssets(assets));
    },
    [updateAssetList]
  );

  const updateLocalList = useCallback(
    (assets: LocalAssetModel[], previews?: Record<string, string>) => {
      updateAssetList(
        assets.map((a) => localAssetToViewer(a, previews?.[a.key]))
      );
    },
    [updateAssetList, localAssetToViewer]
  );

  return {
    openGalleryAsset,
    openLocalAsset,
    closeViewer,
    updateGalleryList,
    updateLocalList,
    // Expose converters for custom usage
    galleryAssetToViewer,
    localAssetToViewer,
  };
}
