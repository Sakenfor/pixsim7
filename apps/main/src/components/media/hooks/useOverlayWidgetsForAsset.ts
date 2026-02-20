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

import type { OverlayConfiguration } from '@lib/ui/overlay';
import {
  useOverlayWidgetSettingsStore,
  type ConfigurableWidgetId,
  type OverlayContextId,
  type WidgetVisibilityMode,
} from '@lib/widgets';

import type { AssetModel } from '@features/assets';
import { mediaCardPropsFromAsset } from '@features/assets/components/shared/mediaCardPropsFromAsset';
import { isFavoriteAsset, toggleFavoriteTag } from '@features/assets/lib/favoriteTag';

import type { MediaCardResolvedProps, MediaCardRuntimeProps } from '../MediaCard';
import type { MediaCardOverlayData } from '../mediaCardWidgets';
import {
  createFavoriteWidget,
  createQuickTagWidget,
  createInfoPopover,
  createGenerationButtonGroup,
} from '../mediaCardWidgets';

export interface UseOverlayWidgetsForAssetOptions {
  /** The asset to build widgets for (null = return empty config) */
  asset: AssetModel | null;
  /** Which surface context to render in */
  context: OverlayContextId;
  /** Optional runtime props (actions, badge config, etc.) to pass through to widget factories */
  runtimeProps?: Partial<MediaCardRuntimeProps>;
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

/** Map WidgetVisibilityMode to overlay trigger string */
function toOverlayTrigger(mode: WidgetVisibilityMode): 'always' | 'hover-container' {
  return mode === 'always' ? 'always' : 'hover-container';
}

/** Position adjustments for compact context (tighter layout) */
const COMPACT_POSITION_OVERRIDES: Partial<Record<ConfigurableWidgetId, { x: number; y: number }>> = {
  'favorite-toggle': { x: -4, y: 4 },
  'info-popover': { x: 4, y: -4 },
};

export function useOverlayWidgetsForAsset({
  asset,
  context,
  runtimeProps = {},
}: UseOverlayWidgetsForAssetOptions): UseOverlayWidgetsForAssetResult {
  const getVisibility = useOverlayWidgetSettingsStore((s) => s.getContextVisibility);

  return useMemo(() => {
    if (!asset) {
      return { overlayConfig: EMPTY_CONFIG, overlayData: EMPTY_DATA };
    }

    // Build base props from asset
    const baseProps = mediaCardPropsFromAsset(asset);
    const isFavorite = isFavoriteAsset(asset);

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
        showGenerationInMenu: true,
        ...runtimeProps.badgeConfig,
      },
      presetCapabilities: {
        showsGenerationMenu: true,
        showsQuickGenerate: true,
        ...runtimeProps.presetCapabilities,
      },
      ...runtimeProps,
    };

    // Create candidate widgets
    const candidates: Array<{
      id: ConfigurableWidgetId;
      widget: ReturnType<typeof createFavoriteWidget> | null;
    }> = [
      { id: 'favorite-toggle', widget: createFavoriteWidget(resolvedProps) },
      { id: 'quick-tag', widget: createQuickTagWidget() },
      { id: 'generation-button-group', widget: createGenerationButtonGroup(resolvedProps) },
      { id: 'info-popover', widget: createInfoPopover(resolvedProps) },
    ];

    // Filter by visibility and remap triggers
    const widgets = candidates
      .filter((c) => {
        if (!c.widget) return false;
        const mode = getVisibility(context, c.id);
        return mode !== 'hidden';
      })
      .map((c) => {
        const mode = getVisibility(context, c.id);
        const widget = c.widget!;

        // Remap visibility trigger
        const remapped = {
          ...widget,
          visibility: { ...widget.visibility, trigger: toOverlayTrigger(mode) as any },
        };

        // Apply compact position overrides
        if (context === 'compact' && COMPACT_POSITION_OVERRIDES[c.id]) {
          const offset = COMPACT_POSITION_OVERRIDES[c.id]!;
          remapped.position = {
            ...remapped.position,
            offset,
          };
        }

        return remapped;
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
      tags: tagSlugs,
      description: asset.description ?? undefined,
      createdAt: asset.createdAt,
      uploadState: 'idle',
      uploadProgress: 0,
      remoteUrl: baseProps.remoteUrl ?? '',
      isFavorite,
      onToggleFavorite: () => toggleFavoriteTag(asset),
      sourceGenerationId: asset.sourceGenerationId ?? undefined,
      hasGenerationContext: asset.hasGenerationContext ?? false,
      prompt: asset.prompt ?? undefined,
      operationType: asset.operationType ?? undefined,
      model: asset.model ?? undefined,
      width: asset.width ?? undefined,
      height: asset.height ?? undefined,
    };

    return { overlayConfig, overlayData };
  }, [asset, context, runtimeProps, getVisibility]);
}
