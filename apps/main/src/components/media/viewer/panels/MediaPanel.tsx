/**
 * MediaPanel
 *
 * Media preview panel for the asset viewer.
 * Orchestrates media display and controls.
 */

import { useState } from 'react';
import type { ViewerPanelContext } from '../types';
import { MediaDisplay, type FitMode } from './MediaDisplay';
import { MediaControlBar } from './MediaControlBar';
import { useMediaMaximize } from './useMediaMaximize';

interface MediaPanelProps {
  context: ViewerPanelContext;
  panelId: string;
  params?: any; // Dockview params
}

export function MediaPanel({ context }: MediaPanelProps) {
  const [fitMode, setFitMode] = useState<FitMode>('contain');
  const [zoom, setZoom] = useState(100);

  const { isMaximized, toggleMaximize } = useMediaMaximize({
    dockviewApi: context.dockviewApi,
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
  } = context;

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
