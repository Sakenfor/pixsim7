
import type { OverlayWidget } from '@lib/ui/overlay';

import { getAssetWarnings } from '@features/assets/lib/assetWarnings';

import type { MediaCardResolvedProps } from './MediaCard';
import type { MediaCardOverlayData } from './mediaCardWidgets';

type MediaCardWidgetFactory = (
  props: MediaCardResolvedProps,
) => OverlayWidget<MediaCardOverlayData> | null;

/**
 * Runtime-only fields that don't derive from the asset itself — the host
 * surface (gallery card, viewer, picker) owns these. Everything else in
 * {@link MediaCardOverlayData} is derived from the resolved props so the
 * shape can't drift between surfaces.
 */
export interface MediaCardOverlayDataOverrides {
  /** Processed video source URL (auth-aware) for the scrubber / player. */
  videoSrc?: string;
  /** Per-provider upload entry point (right-click menu). */
  onUploadToProvider?: (providerId: string) => void | Promise<void>;
  /** Quick-tag filter shortcut. */
  onFilterByTagShortcut?: (tagSlug: string) => void;
  /** Picker fields (compact card / input slots). */
  lockedTimestamp?: number;
  onLockTimestamp?: (timestamp: number | undefined) => void;
  onHoldUploadFrame?: (timestamp: number) => void | Promise<void>;
}

/**
 * Single source of truth for the {@link MediaCardOverlayData} object.
 *
 * Both the gallery card (MediaCard) and the viewer (useOverlayWidgetsForAsset)
 * feed their overlay from this — previously each hand-built the object, which
 * is exactly how the viewer silently dropped `cohortCounts` (no sibling badge)
 * and `tagSummaries` (no tag provenance) while the gallery kept them. Derive
 * every asset-shaped field here; the host passes only the runtime overrides it
 * owns.
 */
export function buildMediaCardOverlayData(
  resolved: MediaCardResolvedProps,
  overrides: MediaCardOverlayDataOverrides = {},
): MediaCardOverlayData {
  const asset = resolved.contextMenuAsset;
  return {
    id: resolved.id,
    mediaType: resolved.mediaType,
    providerId: resolved.providerId,
    status: resolved.providerStatus,
    tags: resolved.tags?.map((t) => t.slug) ?? [],
    tagSummaries: asset?.tags?.map((t) => ({
      slug: t.slug,
      displayName: t.displayName,
      source: t.source,
    })),
    description: resolved.description,
    createdAt: resolved.createdAt,
    uploadState: resolved.uploadState || 'idle',
    uploadProgress: resolved.uploadProgress || 0,
    remoteUrl: resolved.remoteUrl || '',
    videoSrc: overrides.videoSrc,
    durationSec: resolved.durationSec,
    actions: resolved.actions,
    generationStatus: resolved.generationStatus,
    generationId: resolved.generationId,
    generationError: resolved.generationError,
    sourceGenerationId: resolved.sourceGenerationId,
    hasGenerationContext: resolved.hasGenerationContext,
    isFavorite: resolved.isFavorite,
    onToggleFavorite: resolved.onToggleFavorite,
    isArchived: asset?.isArchived,
    prompt: resolved.prompt,
    operationType: resolved.operationType,
    artificialExtend: asset?.artificialExtend ?? undefined,
    model: asset?.model,
    width: resolved.width,
    height: resolved.height,
    onUploadToProvider: overrides.onUploadToProvider,
    providerUploads: asset?.providerUploads,
    lastUploadStatusByProvider: asset?.lastUploadStatusByProvider,
    versionNumber: asset?.versionNumber,
    onFilterByTagShortcut: overrides.onFilterByTagShortcut,
    lockedTimestamp: overrides.lockedTimestamp,
    onLockTimestamp: overrides.onLockTimestamp,
    onHoldUploadFrame: overrides.onHoldUploadFrame,
    warnings: getAssetWarnings(asset),
  };
}

interface MediaCardRuntimeWidgetFactories {
  createPrimaryIconWidget: MediaCardWidgetFactory;
  createStatusWidget: MediaCardWidgetFactory;
  createFavoriteWidget: MediaCardWidgetFactory;
  createQueueStatusWidget: MediaCardWidgetFactory;
  createSelectionStatusWidget: MediaCardWidgetFactory;
  createDurationWidget: MediaCardWidgetFactory;
  createProviderWidget: MediaCardWidgetFactory;
  createVideoScrubber: MediaCardWidgetFactory;
  createGenerationButtonGroup: MediaCardWidgetFactory;
  createGenerationActionModeBadge: MediaCardWidgetFactory;
  createModelFamilyWidget: MediaCardWidgetFactory;
  createQuickTagWidget: () => OverlayWidget<MediaCardOverlayData> | null;
  createQuickAddButton: () => OverlayWidget<MediaCardOverlayData> | null;
  createVersionBadge: () => OverlayWidget<MediaCardOverlayData>;
  createArchivedBadge: () => OverlayWidget<MediaCardOverlayData>;
  createWarningsBadge: () => OverlayWidget<MediaCardOverlayData>;
  createSimilarityBadge: MediaCardWidgetFactory;
}

/**
 * Compose the default runtime widget set for MediaCard from factory functions.
 * Keeps the assembly contract in one place while allowing widget creators to
 * live in specialized modules.
 */
export function buildMediaCardRuntimeWidgets(
  props: MediaCardResolvedProps,
  factories: MediaCardRuntimeWidgetFactories,
): OverlayWidget<MediaCardOverlayData>[] {
  const {
    createPrimaryIconWidget,
    createStatusWidget,
    createFavoriteWidget,
    createQueueStatusWidget,
    createSelectionStatusWidget,
    createDurationWidget,
    createProviderWidget,
    createVideoScrubber,
    createGenerationButtonGroup,
    createGenerationActionModeBadge,
    createModelFamilyWidget,
    createQuickTagWidget,
    createQuickAddButton,
    createVersionBadge,
    createArchivedBadge,
    createWarningsBadge,
    createSimilarityBadge,
  } = factories;

  const widgets = [
    createPrimaryIconWidget(props),
    createModelFamilyWidget(props),
    createStatusWidget(props),
    createFavoriteWidget(props),
    createQuickTagWidget(),
    createQueueStatusWidget(props),
    createSelectionStatusWidget(props),
    // Note: Generation status widget is opt-in via customWidgets or overlay config.
    createDurationWidget(props),
    createProviderWidget(props),
    createVideoScrubber(props),
    createQuickAddButton(),
    createGenerationActionModeBadge(props),
    createGenerationButtonGroup(props),
    createVersionBadge(),
    createArchivedBadge(),
    createWarningsBadge(),
    createSimilarityBadge(props),
  ];

  let result = widgets
    .filter((widget): widget is OverlayWidget<MediaCardOverlayData> => widget !== null)
    .map((widget) => ({ ...widget, group: 'media-card-runtime' }));

  if (props.presetCapabilities?.forceHoverOnly) {
    result = result.map((widget) => ({
      ...widget,
      visibility: { trigger: 'hover-container' as const },
    }));
  }

  return result;
}
