/**
 * MediaPanel
 *
 * Media preview panel for the asset viewer.
 * Orchestrates media display and controls.
 */

import { useState, useMemo, useEffect } from 'react';
import type { ViewerPanelContext } from '../types';
import { MediaDisplay, type FitMode } from './MediaDisplay';
import { MediaControlBar } from './MediaControlBar';
import { useMediaMaximize } from './useMediaMaximize';
import { useAssetViewerStore } from '@features/assets';
import { CAP_ASSET_SELECTION, useCapability, type AssetSelection } from '@features/contextHub';

interface MediaPanelProps {
  context?: ViewerPanelContext;
  panelId: string;
  params?: any; // Dockview params
}

export function MediaPanel({ context }: MediaPanelProps) {
  const [fitMode, setFitMode] = useState<FitMode>('contain');
  const [zoom, setZoom] = useState(100);
  const { value: selection } = useCapability<AssetSelection>(CAP_ASSET_SELECTION);
  const viewerSettings = useAssetViewerStore((s) => s.settings);
  const [fallbackIndex, setFallbackIndex] = useState(0);

  const fallbackAssets = selection?.assets ?? [];
  const fallbackAsset = selection?.asset ?? fallbackAssets[fallbackIndex] ?? null;

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

  const { isMaximized, toggleMaximize } = useMediaMaximize({
    dockviewApi: resolvedContext.dockviewApi,
  });

  const {
    asset,
    settings,
    currentIndex,
    assetListLength,
    canNavigatePrev,
    canNavigateNext,
    navigatePrev,
    navigateNext,
  } = resolvedContext;

  const zoomIn = () => setZoom(Math.min(zoom + 25, 400));
  const zoomOut = () => setZoom(Math.max(zoom - 25, 25));
  const resetZoom = () => setZoom(100);

  if (!asset) {
    return (
      <div className="h-full flex items-center justify-center text-neutral-500">
        No asset selected
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <MediaDisplay
        asset={asset}
        settings={settings}
        fitMode={fitMode}
        zoom={zoom}
      />

      <MediaControlBar
        currentIndex={currentIndex}
        assetListLength={assetListLength}
        canNavigatePrev={canNavigatePrev}
        canNavigateNext={canNavigateNext}
        onNavigatePrev={navigatePrev}
        onNavigateNext={navigateNext}
        zoom={zoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={resetZoom}
        fitMode={fitMode}
        onFitModeChange={setFitMode}
        isMaximized={isMaximized}
        onToggleMaximize={toggleMaximize}
      />
    </div>
  );
}
