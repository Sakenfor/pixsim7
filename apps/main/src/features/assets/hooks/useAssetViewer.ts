/**
 * useAssetViewer Hook
 *
 * Helper hook for opening assets in the viewer from different contexts.
 * Converts various asset formats to the unified ViewerAsset format.
 */

import { useCallback } from 'react';
import { useAssetViewerStore, type ViewerAsset } from '../stores/assetViewerStore';
import type { AssetSummary } from '@lib/api/assets';
import type { LocalAsset } from '../stores/localFoldersStore';

interface UseAssetViewerOptions {
  source: 'gallery' | 'local';
}

export function useAssetViewer(options: UseAssetViewerOptions) {
  const { source } = options;
  const openViewer = useAssetViewerStore((s) => s.openViewer);
  const closeViewer = useAssetViewerStore((s) => s.closeViewer);
  const updateAssetList = useAssetViewerStore((s) => s.updateAssetList);

  /**
   * Convert gallery asset (AssetSummary) to ViewerAsset
   */
  const galleryAssetToViewer = useCallback(
    (asset: AssetSummary): ViewerAsset => ({
      id: asset.id,
      name: asset.description || `Asset ${asset.id}`,
      type: asset.media_type as 'image' | 'video',
      url: asset.thumbnail_url || asset.remote_url,
      fullUrl: asset.remote_url,
      source: 'gallery',
      metadata: {
        description: asset.description,
        tags: asset.tags,
        createdAt: asset.created_at,
        providerId: asset.provider_id,
        duration: asset.duration_sec,
      },
    }),
    []
  );

  /**
   * Convert local asset to ViewerAsset
   */
  const localAssetToViewer = useCallback(
    (asset: LocalAsset, previewUrl?: string): ViewerAsset => ({
      id: asset.key,
      name: asset.name,
      type: asset.kind === 'video' ? 'video' : 'image',
      url: previewUrl || '',
      source: 'local',
      metadata: {
        path: asset.relativePath,
        size: asset.size,
        createdAt: asset.lastModified
          ? new Date(asset.lastModified).toISOString()
          : undefined,
      },
    }),
    []
  );

  /**
   * Open a gallery asset in the viewer
   */
  const openGalleryAsset = useCallback(
    (asset: AssetSummary, allAssets?: AssetSummary[]) => {
      const viewerAsset = galleryAssetToViewer(asset);
      const viewerList = allAssets?.map(galleryAssetToViewer);
      openViewer(viewerAsset, viewerList);
    },
    [openViewer, galleryAssetToViewer]
  );

  /**
   * Open a local asset in the viewer
   */
  const openLocalAsset = useCallback(
    (
      asset: LocalAsset,
      previewUrl: string | undefined,
      allAssets?: LocalAsset[],
      previews?: Record<string, string>
    ) => {
      const viewerAsset = localAssetToViewer(asset, previewUrl);
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
    (assets: AssetSummary[]) => {
      updateAssetList(assets.map(galleryAssetToViewer));
    },
    [updateAssetList, galleryAssetToViewer]
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
