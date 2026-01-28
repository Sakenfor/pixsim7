/**
 * useAssetViewer Hook
 *
 * Helper hook for opening assets in the viewer from different contexts.
 * Converts various asset formats to the unified ViewerAsset format.
 */

import { useCallback } from 'react';

import { type AssetModel, toViewerAsset, toViewerAssets } from '../models/asset';
import { useAssetViewerStore, type ViewerAsset } from '../stores/assetViewerStore';
import type { LocalAsset } from '../stores/localFoldersStore';

interface UseAssetViewerOptions {
  source: 'gallery' | 'local';
  localMetadataResolver?: (asset: LocalAsset) => Partial<ViewerAsset['metadata']>;
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
   * Convert local asset to ViewerAsset
   */
  const localAssetToViewer = useCallback(
    (asset: LocalAsset, previewUrl?: string, fullUrl?: string): ViewerAsset => ({
      id: asset.key,
      name: asset.name,
      type: asset.kind === 'video' ? 'video' : 'image',
      url: previewUrl || '',
      fullUrl,
      source: 'local',
      metadata: {
        path: asset.relativePath,
        size: asset.size,
        createdAt: asset.lastModified
          ? new Date(asset.lastModified).toISOString()
          : undefined,
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
      openViewer(viewerAsset, viewerList);
    },
    [openViewer]
  );

  /**
   * Open a local asset in the viewer
   */
  const openLocalAsset = useCallback(
    (
      asset: LocalAsset,
      previewUrl: string | undefined,
      allAssets?: LocalAsset[],
      previews?: Record<string, string>,
      fullUrl?: string
    ) => {
      const viewerAsset = localAssetToViewer(asset, previewUrl, fullUrl);
      const viewerList = allAssets?.map((a) =>
        localAssetToViewer(a, previews?.[a.key])
      );
      openViewer(viewerAsset, viewerList);
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
    (assets: LocalAsset[], previews?: Record<string, string>) => {
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
