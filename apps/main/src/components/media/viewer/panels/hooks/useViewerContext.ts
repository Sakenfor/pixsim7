/**
 * useViewerContext
 *
 * Hook for resolving viewer context with fallback asset selection.
 * Handles selection from capability hub or falls back to asset list navigation.
 */

import { useState, useEffect, useMemo } from 'react';

import { useAssetViewerStore } from '@features/assets';
import { CAP_ASSET_SELECTION, useCapability, type AssetSelection } from '@features/contextHub';
import { useResolvedRuntimeSource } from '@features/panels/hooks/useResolvedRuntimeSource';
import type { RuntimeSourceCandidate } from '@features/panels/lib/runtimeResolution';

import type { ViewerPanelContext } from '../../types';

export interface UseViewerContextOptions {
  /** External context (if provided) */
  context?: ViewerPanelContext;
}

export interface UseViewerContextResult {
  /** Resolved context (from prop or fallback) */
  resolvedContext: ViewerPanelContext;
}

type ViewerContextSource = 'viewer-store' | 'context' | 'selection-fallback';

/**
 * Hook for resolving viewer panel context.
 *
 * When an explicit context is provided, it is used directly.
 * Otherwise, falls back to capability hub selection with navigation.
 *
 * @param options - Configuration options
 * @returns Resolved viewer context
 */
export function useViewerContext({
  context,
}: UseViewerContextOptions): UseViewerContextResult {
  const { value: selection } = useCapability<AssetSelection>(CAP_ASSET_SELECTION);
  const liveMode = useAssetViewerStore((s) => s.mode);
  const liveCurrentAsset = useAssetViewerStore((s) => s.currentAsset);
  const liveAssetList = useAssetViewerStore((s) => s.assetList);
  const liveCurrentIndex = useAssetViewerStore((s) => s.currentIndex);
  const viewerSettings = useAssetViewerStore((s) => s.settings);
  const liveNavigatePrev = useAssetViewerStore((s) => s.navigatePrev);
  const liveNavigateNext = useAssetViewerStore((s) => s.navigateNext);
  const liveCloseViewer = useAssetViewerStore((s) => s.closeViewer);
  const liveToggleFullscreen = useAssetViewerStore((s) => s.toggleFullscreen);
  const [fallbackIndex, setFallbackIndex] = useState(0);

  const fallbackAssets = useMemo(() => selection?.assets ?? [], [selection?.assets]);
  const fallbackAsset = selection?.asset ?? fallbackAssets[fallbackIndex] ?? null;

  // Sync fallback index with selection changes
  useEffect(() => {
    if (fallbackAssets.length === 0) {
      setFallbackIndex(0);
      return;
    }

    if (selection?.asset) {
      const idx = fallbackAssets.findIndex((asset) => asset.id === selection.asset?.id);
      if (idx >= 0 && idx !== fallbackIndex) {
        setFallbackIndex(idx);
        return;
      }
    }

    if (fallbackIndex >= fallbackAssets.length) {
      setFallbackIndex(Math.max(0, fallbackAssets.length - 1));
    }
  }, [fallbackAssets, selection?.asset, fallbackIndex]);

  const hasLiveViewerState =
    liveMode !== 'closed' || !!liveCurrentAsset || liveAssetList.length > 0;
  const sharedSettings = useMemo(
    () => ({
      autoPlayVideos: viewerSettings.autoPlayVideos,
      loopVideos: viewerSettings.loopVideos,
    }),
    [viewerSettings.autoPlayVideos, viewerSettings.loopVideos],
  );
  const canNavigatePrev = fallbackIndex > 0;
  const canNavigateNext = fallbackIndex < fallbackAssets.length - 1;
  const currentIndex = Math.max(0, liveCurrentIndex);
  const liveAssetListLength = liveAssetList.length;

  const runtimeCandidates = useMemo<RuntimeSourceCandidate<ViewerContextSource, ViewerPanelContext>[]>(
    () => [
      {
        source: 'viewer-store',
        enabled: hasLiveViewerState,
        value: {
          ...(context ?? ({} as Partial<ViewerPanelContext>)),
          asset: liveCurrentAsset,
          settings: sharedSettings,
          currentIndex,
          assetListLength: liveAssetListLength,
          canNavigatePrev: currentIndex > 0,
          canNavigateNext: currentIndex < Math.max(0, liveAssetListLength - 1),
          navigatePrev: liveNavigatePrev,
          navigateNext: liveNavigateNext,
          closeViewer: liveCloseViewer,
          toggleFullscreen: liveToggleFullscreen,
        } as ViewerPanelContext,
      },
      {
        source: 'context',
        enabled: !!context,
        value: {
          ...(context ?? ({} as ViewerPanelContext)),
          asset: context?.asset ?? null,
          settings: sharedSettings,
          currentIndex: context?.currentIndex ?? 0,
          assetListLength: context?.assetListLength ?? 0,
          canNavigatePrev: context?.canNavigatePrev ?? false,
          canNavigateNext: context?.canNavigateNext ?? false,
          navigatePrev: context?.navigatePrev ?? (() => {}),
          navigateNext: context?.navigateNext ?? (() => {}),
          closeViewer: context?.closeViewer ?? (() => {}),
          toggleFullscreen: context?.toggleFullscreen ?? (() => {}),
        },
      },
      {
        source: 'selection-fallback',
        enabled: true,
        value: {
          asset: fallbackAsset,
          settings: sharedSettings,
          currentIndex: fallbackIndex,
          assetListLength: fallbackAssets.length,
          canNavigatePrev,
          canNavigateNext,
          navigatePrev: () => setFallbackIndex((idx) => Math.max(0, idx - 1)),
          navigateNext: () =>
            setFallbackIndex((idx) => Math.min(fallbackAssets.length - 1, idx + 1)),
          closeViewer: () => {},
          toggleFullscreen: () => {},
        },
      },
    ],
    [
      context,
      hasLiveViewerState,
      liveCurrentAsset,
      sharedSettings,
      currentIndex,
      liveAssetListLength,
      liveNavigatePrev,
      liveNavigateNext,
      liveCloseViewer,
      liveToggleFullscreen,
      fallbackAsset,
      fallbackIndex,
      fallbackAssets.length,
      canNavigatePrev,
      canNavigateNext,
    ],
  );

  const fallbackRuntimeContext = runtimeCandidates[runtimeCandidates.length - 1]!.value;
  const resolvedContext = useResolvedRuntimeSource(
    runtimeCandidates,
    ['viewer-store', 'context', 'selection-fallback'] as const,
    fallbackRuntimeContext,
  );

  return { resolvedContext };
}
