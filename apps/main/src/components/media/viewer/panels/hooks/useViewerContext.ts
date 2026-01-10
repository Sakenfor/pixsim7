/**
 * useViewerContext
 *
 * Hook for resolving viewer context with fallback asset selection.
 * Handles selection from capability hub or falls back to asset list navigation.
 */

import { useState, useEffect, useMemo } from 'react';

import { useAssetViewerStore } from '@features/assets';
import { CAP_ASSET_SELECTION, useCapability, type AssetSelection } from '@features/contextHub';

import type { ViewerPanelContext } from '../../types';

export interface UseViewerContextOptions {
  /** External context (if provided) */
  context?: ViewerPanelContext;
}

export interface UseViewerContextResult {
  /** Resolved context (from prop or fallback) */
  resolvedContext: ViewerPanelContext;
}

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
  const viewerSettings = useAssetViewerStore((s) => s.settings);
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

  // Build resolved context
  const resolvedContext = useMemo<ViewerPanelContext>(() => {
    if (context) return context;

    const canNavigatePrev = fallbackIndex > 0;
    const canNavigateNext = fallbackIndex < fallbackAssets.length - 1;

    return {
      asset: fallbackAsset,
      settings: {
        autoPlayVideos: viewerSettings.autoPlayVideos,
        loopVideos: viewerSettings.loopVideos,
      },
      currentIndex: fallbackIndex,
      assetListLength: fallbackAssets.length,
      canNavigatePrev,
      canNavigateNext,
      navigatePrev: () => setFallbackIndex((idx) => Math.max(0, idx - 1)),
      navigateNext: () =>
        setFallbackIndex((idx) => Math.min(fallbackAssets.length - 1, idx + 1)),
      closeViewer: () => {},
      toggleFullscreen: () => {},
    };
  }, [
    context,
    fallbackAsset,
    fallbackAssets.length,
    fallbackIndex,
    viewerSettings.autoPlayVideos,
    viewerSettings.loopVideos,
  ]);

  return { resolvedContext };
}
