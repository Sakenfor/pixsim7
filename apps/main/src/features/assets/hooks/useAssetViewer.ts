/**
 * useAssetViewer Hook
 *
 * Helper hook for opening assets in the viewer from different contexts.
 * Converts various asset formats to the unified ViewerAsset format.
 */

import { useCallback, useEffect, useRef } from 'react';

import { type AssetModel, toViewerAsset, toViewerAssets } from '../models/asset';
import { useAssetViewerStore, type ViewerAsset } from '../stores/assetViewerStore';
import type { LocalAssetModel } from '../types/localFolderMeta';

function areViewerScopeAssetsEquivalent(prev: ViewerAsset[], next: ViewerAsset[]): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;

  for (let i = 0; i < prev.length; i += 1) {
    const a = prev[i];
    const b = next[i];
    if (
      a.id !== b.id ||
      a.url !== b.url ||
      a.fullUrl !== b.fullUrl ||
      a.name !== b.name ||
      a.type !== b.type ||
      a.source !== b.source ||
      a.sourceGenerationId !== b.sourceGenerationId
    ) {
      return false;
    }
  }

  return true;
}

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
  const lastRegisteredRef = useRef<{ scopeId: string; label: string; assets: ViewerAsset[] } | null>(null);

  // Sync scope data when it changes (registerScope upserts)
  useEffect(() => {
    if (!enabled || assets.length === 0) {
      lastRegisteredRef.current = null;
      return;
    }

    const last = lastRegisteredRef.current;
    if (
      last &&
      last.scopeId === scopeId &&
      last.label === label &&
      areViewerScopeAssetsEquivalent(last.assets, assets)
    ) {
      return;
    }

    registerScope(scopeId, label, assets);
    lastRegisteredRef.current = { scopeId, label, assets };
  }, [enabled, scopeId, label, assets, registerScope]);

  // Unregister on unmount or when scopeId changes
  useEffect(() => {
    return () => {
      lastRegisteredRef.current = null;
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
