/**
 * useOverlayWidgetsForAsset
 *
 * Shared hook that builds overlay widgets for an AssetModel in a given context.
 * Reuses the same widget factories as MediaCard (favorite, quick-tag, generation bar, info popover)
 * and filters/remaps visibility based on the unified overlayWidgetSettingsStore.
 *
 * Used by CompactAssetCard, viewer MediaPanel, and (indirectly) MediaCard.
 */

import { useMemo } from 'react';

import type { OverlayConfiguration, OverlayPolicyStep, OverlayWidget } from '@lib/ui/overlay';
import {
  useOverlayWidgetSettingsStore,
  type OverlayContextId,
} from '@lib/widgets';

import type { AssetModel } from '@features/assets';
import { mediaCardPropsFromAsset } from '@features/assets/components/shared/mediaCardPropsFromAsset';
import { isFavoriteAsset, toggleFavoriteTag } from '@features/assets/lib/favoriteTag';

import type { MediaCardResolvedProps, MediaCardRuntimeProps } from '../MediaCard';
import type { MediaCardOverlayData } from '../mediaCardWidgets';
import {
  createDefaultMediaCardWidgets,
  createFavoriteWidget,
  createGenerationButtonGroup,
  createInfoPopover,
  createQuickTagWidget,
  createVersionBadge,
} from '../mediaCardWidgets';
import { applyMediaOverlayPolicyChain } from '../overlayWidgetPolicy';

export interface UseOverlayWidgetsForAssetOptions {
  /** The asset to build widgets for (null = return empty config) */
  asset: AssetModel | null;
  /** Which surface context to render in */
  context: OverlayContextId;
  /** Optional runtime props (actions, badge config, etc.) to pass through to widget factories */
  runtimeProps?: Partial<MediaCardRuntimeProps>;
  /** Apply compact position offsets regardless of context.
   *  Set to true when rendering inside CompactAssetCard, which always needs
   *  tighter offsets even when using 'gallery' context for visibility. */
  useCompactPositions?: boolean;
  /** Optional conflict rule: suppress generation bar widget for custom hover UI. */
  suppressGenerationButtonGroup?: boolean;
  /** Optional ordered policy chain override. Defaults to MediaCard runtime chain. */
  policyChain?: OverlayPolicyStep[];
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
  context,
  runtimeProps = {},
  useCompactPositions = false,
  suppressGenerationButtonGroup = false,
  policyChain,
}: UseOverlayWidgetsForAssetOptions): UseOverlayWidgetsForAssetResult {
  const getVisibility = useOverlayWidgetSettingsStore((s) => s.getContextVisibility);

  return useMemo(() => {
    if (!asset) {
      return { overlayConfig: EMPTY_CONFIG, overlayData: EMPTY_DATA };
    }

    // Build base props from asset
    const baseProps = mediaCardPropsFromAsset(asset);
    const isFavorite = isFavoriteAsset(asset);

    // Destructure nested objects from runtimeProps to merge them properly
    // (spreading runtimeProps at top level would overwrite the merged nested objects)
    const {
      badgeConfig: rtBadgeConfig,
      presetCapabilities: rtPresetCaps,
      ...restRuntimeProps
    } = runtimeProps;

    // Build resolved props for widget factories
    const resolvedProps: MediaCardResolvedProps = {
      ...baseProps,
      contextMenuAsset: asset,
      isFavorite,
      onToggleFavorite: () => toggleFavoriteTag(asset),
      // Enable generation features and tags for the shared contexts
      badgeConfig: {
        showTagsInOverlay: true,
        showGenerationBadge: true,
        ...rtBadgeConfig,
      },
      presetCapabilities: {
        showsGenerationMenu: true,
        showsQuickGenerate: true,
        ...rtPresetCaps,
      },
      ...restRuntimeProps,
    };

    // Viewer surface gets the full MediaCard widget set (media type, status,
    // model family, duration, provider, etc.). Compact surfaces (asset
    // inputs, picker grids) keep a slim hand-picked set so always-on badges
    // like selection-status / queue-status don't crowd the small card and
    // push hover actions around.
    //
    // The video-scrubber widget is suppressed in the viewer because it
    // renders its own absolutely-positioned <video object-cover> which
    // ignores the viewer's zoom/pan transform — on hover it pops over the
    // main player at a different fit and zoom. The viewer's native <video
    // controls> already covers playback/scrubbing.
    const candidates =
      context === 'viewer'
        ? createDefaultMediaCardWidgets(resolvedProps).filter(
            (widget): widget is OverlayWidget<MediaCardOverlayData> =>
              widget !== null && widget.id !== 'video-scrubber',
          )
        : ([
            createFavoriteWidget(resolvedProps),
            createQuickTagWidget(),
            createGenerationButtonGroup(resolvedProps),
            createInfoPopover(resolvedProps),
            asset.versionNumber ? createVersionBadge() : null,
          ].filter(
            (widget): widget is OverlayWidget<MediaCardOverlayData> => widget !== null,
          ));

    const widgets = applyMediaOverlayPolicyChain(candidates, {
      context,
      getVisibility,
      chain: policyChain,
      configurableDefaults: {
        useCompactPositions,
        skipInfoPopoverInCompact: true,
        suppressGenerationButtonGroup,
      },
    });

    // Build overlay config
    const overlayConfig: OverlayConfiguration = {
      id: `asset-overlay-${context}`,
      name: `Asset Overlay (${context})`,
      widgets,
      spacing: 'compact',
    };

    // Build overlay data
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
      actions: restRuntimeProps.actions,
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
  }, [asset, context, runtimeProps, getVisibility, useCompactPositions, suppressGenerationButtonGroup, policyChain]);
}
