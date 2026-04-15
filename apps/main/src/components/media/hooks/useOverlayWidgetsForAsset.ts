/**
 * useOverlayWidgetsForAsset
 *
 * Builds viewer-context overlay widgets for an AssetModel, reusing the same
 * widget factories as MediaCard. Sole consumer is MediaPanel. MediaCard's
 * compact/gallery paths are assembled inline in MediaCard.tsx.
 */

import { useMemo } from 'react';

import type { OverlayConfiguration, OverlayWidget } from '@lib/ui/overlay';
import { useOverlayWidgetSettingsStore } from '@lib/widgets';

import type { AssetModel } from '@features/assets';
import { mediaCardPropsFromAsset } from '@features/assets/components/shared/mediaCardPropsFromAsset';
import { isFavoriteAsset, toggleFavoriteTag } from '@features/assets/lib/favoriteTag';

import type { MediaCardResolvedProps } from '../MediaCard';
import type { MediaCardOverlayData } from '../mediaCardWidgets';
import { createDefaultMediaCardWidgets } from '../mediaCardWidgets';
import { applyMediaOverlayPolicyChain } from '../overlayWidgetPolicy';

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

  return useMemo(() => {
    if (!asset) {
      return { overlayConfig: EMPTY_CONFIG, overlayData: EMPTY_DATA };
    }

    const baseProps = mediaCardPropsFromAsset(asset);
    const isFavorite = isFavoriteAsset(asset);

    const resolvedProps: MediaCardResolvedProps = {
      ...baseProps,
      contextMenuAsset: asset,
      isFavorite,
      onToggleFavorite: () => toggleFavoriteTag(asset),
      badgeConfig: {
        showTagsInOverlay: true,
        showGenerationBadge: true,
      },
      presetCapabilities: {
        showsGenerationMenu: true,
        showsQuickGenerate: true,
      },
    };

    // The video-scrubber widget is suppressed in the viewer because it
    // renders its own absolutely-positioned <video object-cover> which
    // ignores the viewer's zoom/pan transform — on hover it pops over the
    // main player at a different fit and zoom. The viewer's native <video
    // controls> already covers playback/scrubbing.
    const candidates = createDefaultMediaCardWidgets(resolvedProps).filter(
      (widget): widget is OverlayWidget<MediaCardOverlayData> =>
        widget !== null && widget.id !== 'video-scrubber',
    );

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
      onToggleFavorite: () => toggleFavoriteTag(asset),
      sourceGenerationId: asset.sourceGenerationId ?? undefined,
      hasGenerationContext: asset.hasGenerationContext ?? false,
      prompt: asset.prompt ?? undefined,
      operationType: asset.operationType ?? undefined,
      model: asset.model ?? undefined,
      width: asset.width ?? undefined,
      height: asset.height ?? undefined,
      providerUploads: asset.providerUploads,
      lastUploadStatusByProvider: asset.lastUploadStatusByProvider,
      versionNumber: asset.versionNumber,
    };

    return { overlayConfig, overlayData };
  }, [asset, getVisibility]);
}
