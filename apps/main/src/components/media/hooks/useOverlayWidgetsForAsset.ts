/**
 * useOverlayWidgetsForAsset
 *
 * Builds viewer-context overlay widgets for an AssetModel, reusing the same
 * widget factories as MediaCard. Sole consumer is MediaPanel. MediaCard's
 * compact/gallery paths are assembled inline in MediaCard.tsx.
 */

import { useMemo } from 'react';

import type { OverlayConfiguration, OverlayWidget } from '@lib/ui/overlay';
import { buildAddToSetWidget, buildSetIndicatorWidget } from '@lib/ui/overlay';
import { useOverlayWidgetSettingsStore } from '@lib/widgets';

import type { AssetModel } from '@features/assets';
import { mediaCardPropsFromAsset } from '@features/assets/components/shared/mediaCardPropsFromAsset';
import { isFavoriteAsset } from '@features/assets/lib/favoriteTag';
import { useAssetSetStore, type ManualAssetSet } from '@features/assets/stores/assetSetStore';
import { useGalleryApplyTargetStore } from '@features/assets/stores/galleryApplyTargetStore';

import type { MediaCardOverlayData } from '../mediaCardWidgets';
import { createDefaultMediaCardWidgets } from '../mediaCardWidgets';
import { applyMediaOverlayPolicyChain } from '../overlayWidgetPolicy';
import { resolveMediaCardOverlayProps } from '../resolveMediaCardOverlayProps';

export interface UseOverlayWidgetsForAssetOptions {
  /** The asset to build widgets for (null = return empty config) */
  asset: AssetModel | null;
}

export interface UseOverlayWidgetsForAssetResult {
  /** Overlay configuration ready to pass to OverlayContainer */
  overlayConfig: OverlayConfiguration;
  /** Data object ready to pass to OverlayContainer */
  overlayData: MediaCardOverlayData;
}

const EMPTY_CONFIG: OverlayConfiguration = {
  id: 'asset-overlay-empty',
  name: 'Empty',
  widgets: [],
  spacing: 'compact',
};

const EMPTY_DATA: MediaCardOverlayData = {
  id: 0,
  mediaType: 'image',
  providerId: '',
  tags: [],
  createdAt: '',
  uploadState: 'idle',
  uploadProgress: 0,
  remoteUrl: '',
};

export function useOverlayWidgetsForAsset({
  asset,
}: UseOverlayWidgetsForAssetOptions): UseOverlayWidgetsForAssetResult {
  const getVisibility = useOverlayWidgetSettingsStore((s) => s.getContextVisibility);

  // Mirror the gallery's active-manual-set affordance. RemoteGallerySource
  // injects buildAddToSetWidget / buildSetIndicatorWidget per card via
  // customWidgets; the viewer reads the same stores directly so the "+ to
  // active set" button (or the green check when the asset is already in the
  // set) shows up wherever an asset is rendered.
  const activeManualSetId = useGalleryApplyTargetStore((s) => s.activeManualSetId);
  const sets = useAssetSetStore((s) => s.sets);
  const addAssetsToSet = useAssetSetStore((s) => s.addAssetsToSet);
  const activeManualSet = useMemo<ManualAssetSet | undefined>(
    () => {
      if (!activeManualSetId) return undefined;
      const found = sets.find((s) => s.id === activeManualSetId);
      return found?.kind === 'manual' ? found : undefined;
    },
    [activeManualSetId, sets],
  );

  return useMemo(() => {
    if (!asset) {
      return { overlayConfig: EMPTY_CONFIG, overlayData: EMPTY_DATA };
    }

    const baseProps = mediaCardPropsFromAsset(asset);
    const isFavorite = isFavoriteAsset(asset);

    // Route through resolveMediaCardOverlayProps so the viewer inherits the
    // canonical badge defaults (showStatusIcon, showTagsInOverlay, …) instead
    // of hand-rolling its own subset and silently drifting from the gallery.
    const resolvedProps = resolveMediaCardOverlayProps(asset, {
      isFavorite,
      presetCapabilities: {
        showsGenerationMenu: true,
        showsQuickGenerate: true,
      },
    });

    // The video-scrubber widget is suppressed in the viewer because it
    // renders its own absolutely-positioned <video object-cover> which
    // ignores the viewer's zoom/pan transform — on hover it pops over the
    // main player at a different fit and zoom. The viewer's native <video
    // controls> already covers playback/scrubbing.
    const candidates = createDefaultMediaCardWidgets(resolvedProps).filter(
      (widget): widget is OverlayWidget<MediaCardOverlayData> =>
        widget !== null && widget.id !== 'video-scrubber',
    );

    if (activeManualSet) {
      const isInSet = activeManualSet.assetIds.includes(asset.id);
      if (isInSet) {
        candidates.push(
          buildSetIndicatorWidget({
            tooltip: `In active set: ${activeManualSet.name}`,
          }) as OverlayWidget<MediaCardOverlayData>,
        );
      } else {
        candidates.push(
          buildAddToSetWidget(
            () => addAssetsToSet(activeManualSet.id, [asset.id]),
            { tooltip: `Add to active set: ${activeManualSet.name}` },
          ) as OverlayWidget<MediaCardOverlayData>,
        );
      }
    }

    const widgets = applyMediaOverlayPolicyChain(candidates, {
      context: 'viewer',
      getVisibility,
    });

    const overlayConfig: OverlayConfiguration = {
      id: 'asset-overlay-viewer',
      name: 'Asset Overlay (viewer)',
      widgets,
      spacing: 'compact',
    };

    const tagSlugs = asset.tags?.map((t) => t.slug) ?? [];
    const overlayData: MediaCardOverlayData = {
      id: asset.id,
      mediaType: baseProps.mediaType,
      providerId: asset.providerId,
      status: baseProps.providerStatus,
      tags: tagSlugs,
      description: asset.description ?? undefined,
      createdAt: asset.createdAt,
      uploadState: 'idle',
      uploadProgress: 0,
      remoteUrl: baseProps.remoteUrl ?? '',
      videoSrc: baseProps.mediaType === 'video' ? baseProps.remoteUrl ?? undefined : undefined,
      durationSec: baseProps.durationSec,
      isFavorite,
      onToggleFavorite: resolvedProps.onToggleFavorite,
      sourceGenerationId: asset.sourceGenerationId ?? undefined,
      hasGenerationContext: asset.hasGenerationContext ?? false,
      prompt: asset.prompt ?? undefined,
      operationType: asset.operationType ?? undefined,
      artificialExtend: asset.artificialExtend ?? undefined,
      model: asset.model ?? undefined,
      width: asset.width ?? undefined,
      height: asset.height ?? undefined,
      providerUploads: asset.providerUploads,
      lastUploadStatusByProvider: asset.lastUploadStatusByProvider,
      versionNumber: asset.versionNumber,
    };

    return { overlayConfig, overlayData };
  }, [asset, getVisibility, activeManualSet, addAssetsToSet]);
}
