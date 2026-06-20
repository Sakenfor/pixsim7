/**
 * useOverlayWidgetsForAsset
 *
 * Builds viewer-context overlay widgets for an AssetModel, reusing the same
 * widget factories as MediaCard. Sole consumer is MediaPanel. MediaCard's
 * compact/gallery paths are assembled inline in MediaCard.tsx.
 */

import { useEffect, useMemo, useRef } from 'react';

import { getAsset } from '@lib/api/assets';
import { useContentInset } from '@lib/layout/edgeInsets';
import type { OverlayConfiguration, OverlayWidget } from '@lib/ui/overlay';
import { getMediaCardPreset, isOverlayPosition } from '@lib/ui/overlay';
import { useOverlayWidgetSettingsStore } from '@lib/widgets';

import type { AssetModel } from '@features/assets';
import { mediaCardPropsFromAsset } from '@features/assets/components/shared/mediaCardPropsFromAsset';
import { buildActiveTargetWidgets, selectActiveTargetSets } from '@features/assets/lib/activeTargetWidgets';
import { assetEvents } from '@features/assets/lib/assetEvents';
import { isBackendAssetId } from '@features/assets/lib/backendAssetId';
import { isFavoriteAsset } from '@features/assets/lib/favoriteTag';
import { useAssetSets } from '@features/assets/stores/assetSetStore';
import { useGalleryApplyTargetStore } from '@features/assets/stores/galleryApplyTargetStore';
import { useSurfaceSetBadgesExpanded } from '@features/assets/stores/setBadgeExpansionStore';

import { buildMediaCardOverlayData } from '../mediaCardRuntimeWidgetBuilder';
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

/**
 * Shift any left-anchored widget rightward by `leftInset` pixels so it
 * doesn't sit underneath an active tool sidebar. The right side and
 * center-anchored widgets are left alone — they're either far from the
 * sidebar (top-right favorites/quick-tag/status) or get covered by the
 * tool's full-area `Main` regardless (bottom-center generation pill).
 */
function shiftLeftAnchoredWidgets<TData>(
  widgets: OverlayWidget<TData>[],
  leftInset: number,
): OverlayWidget<TData>[] {
  if (leftInset <= 0) return widgets;
  return widgets.map((widget) => {
    if (!isOverlayPosition(widget.position)) return widget;
    const anchor = widget.position.anchor;
    if (anchor !== 'top-left' && anchor !== 'center-left' && anchor !== 'bottom-left') {
      return widget;
    }
    const currentX = widget.position.offset?.x ?? 0;
    const shiftedX =
      typeof currentX === 'number'
        ? currentX + leftInset
        : `calc(${currentX} + ${leftInset}px)`;
    return {
      ...widget,
      position: {
        ...widget.position,
        offset: { x: shiftedX, y: widget.position.offset?.y ?? 0 },
      },
    };
  });
}

/** Does the gallery's default preset render the sibling/similarity badge? */
const SIBLING_BADGES_ENABLED = !!getMediaCardPreset('media-card-default')?.capabilities
  ?.showsSiblingBadges;

/**
 * Backfill cohort counts for the *focused* asset only.
 *
 * The viewer's neighbor-walk sequence skips the ~2.5s/page cohort scan
 * (`useAssetSequence` → include_cohort_counts:false), so assets reached by
 * prev/next arrive with empty `cohortCounts` and the similarity badge would
 * render as dim, count-less handles. Displaying one asset is cheap, though —
 * `GET /assets/{id}` recomputes its counts — so when the focused asset lacks
 * them we fetch just that one and emit it. `assetViewerStore` reconciles the
 * update back into `_assetModel`, which re-feeds this hook with live counts.
 * Deduped per id so a legitimately empty cohort (or a fast back-and-forth)
 * doesn't loop.
 */
function useFocusedAssetCohortCounts(asset: AssetModel | null): void {
  const fetchedIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!SIBLING_BADGES_ENABLED || !asset) return;
    const id = asset.id;
    if (!isBackendAssetId(id)) return;
    if (asset.cohortCounts && Object.keys(asset.cohortCounts).length > 0) return;
    if (fetchedIdsRef.current.has(id)) return;
    fetchedIdsRef.current.add(id);

    let cancelled = false;
    getAsset(id)
      .then((response) => {
        if (!cancelled) assetEvents.emitAssetUpdated(response);
      })
      .catch(() => {
        // Best-effort — a failed backfill just leaves the count-less handle.
        fetchedIdsRef.current.delete(id);
      });

    return () => {
      cancelled = true;
    };
  }, [asset]);
}

export function useOverlayWidgetsForAsset({
  asset,
}: UseOverlayWidgetsForAssetOptions): UseOverlayWidgetsForAssetResult {
  useFocusedAssetCohortCounts(asset);

  const getVisibility = useOverlayWidgetSettingsStore((s) => s.getContextVisibility);

  // Mirror the gallery's active-target affordance. RemoteGallerySource and the
  // viewer both build per-set toggle glyphs from the same shared helper
  // (buildActiveTargetWidgets) so the "add/remove to target set" toggles show
  // up identically wherever an asset card is rendered.
  const activeManualSetIds = useGalleryApplyTargetStore((s) => s.activeManualSetIds);
  const { sets } = useAssetSets();
  const activeSets = useMemo(
    () => selectActiveTargetSets(sets, activeManualSetIds),
    [activeManualSetIds, sets],
  );
  // Collapsed/expanded set badges are scoped to this surface ('viewer'), shared
  // across every card in the viewer rather than saved per card.
  const setBadgesExpanded = useSurfaceSetBadgesExpanded('viewer');

  // Push semantics: left inset = sum of currently-active tool sidebars in
  // this viewer's EdgeInsetsScope. Used to shift left-anchored badges past
  // the active sidebar instead of letting them sit underneath it. Resolves
  // to 0 outside any scope, so non-viewer surfaces are unaffected.
  const leftInset = useContentInset('left');

  return useMemo(() => {
    if (!asset) {
      return { overlayConfig: EMPTY_CONFIG, overlayData: EMPTY_DATA };
    }

    const baseProps = mediaCardPropsFromAsset(asset);
    const isFavorite = isFavoriteAsset(asset);

    // Route through resolveMediaCardOverlayProps so the viewer inherits the
    // canonical badge defaults (showStatusIcon, showTagsInOverlay, …) instead
    // of hand-rolling its own subset and silently drifting from the gallery.
    // Source capabilities from the gallery's default preset (single source of
    // truth) instead of a hand-picked subset — that subset is exactly how the
    // viewer silently lost the similarity / sibling badge (showsSiblingBadges)
    // the gallery has. Any capability the default preset gains flows here too.
    const resolvedProps = resolveMediaCardOverlayProps(asset, {
      isFavorite,
      presetCapabilities: getMediaCardPreset('media-card-default')?.capabilities ?? {
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

    for (const widget of buildActiveTargetWidgets(asset.id, activeSets, {
      surfaceKey: 'viewer',
      expanded: setBadgesExpanded,
    })) {
      candidates.push(widget as OverlayWidget<MediaCardOverlayData>);
    }

    const widgets = applyMediaOverlayPolicyChain(
      shiftLeftAnchoredWidgets(candidates, leftInset),
      {
        context: 'viewer',
        getVisibility,
      },
    );

    const overlayConfig: OverlayConfiguration = {
      id: 'asset-overlay-viewer',
      name: 'Asset Overlay (viewer)',
      widgets,
      spacing: 'compact',
    };

    // One source of truth for the data object — the same builder the gallery
    // card feeds (cohortCounts, tagSummaries, warnings, versions, uploads, …)
    // so the two surfaces can't drift field-by-field again.
    const overlayData = buildMediaCardOverlayData(resolvedProps, {
      videoSrc:
        baseProps.mediaType === 'video' ? baseProps.remoteUrl ?? undefined : undefined,
    });

    return { overlayConfig, overlayData };
  }, [asset, getVisibility, activeSets, leftInset, setBadgesExpanded]);
}
