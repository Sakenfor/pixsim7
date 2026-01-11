/**
 * MediaPanel
 *
 * Media preview panel for the asset viewer.
 * Orchestrates media display and controls.
 * Supports overlay modes for drawing regions and pose references.
 */

import { useState, useEffect, useRef } from 'react';

import { useAssetRegionStore, useAssetViewerOverlayStore } from '@features/mediaViewer';

import { useProvideRegionAnnotations } from '../capabilities';
import { useMediaOverlayHost } from '../overlays';
import type { ViewerPanelContext } from '../types';

import { useFrameCapture, useOverlayShortcuts, useViewerContext } from './hooks';
import { MediaControlBar } from './MediaControlBar';
import { MediaDisplay, type FitMode } from './MediaDisplay';
import { useMediaMaximize } from './useMediaMaximize';

interface MediaPanelProps {
  context?: ViewerPanelContext;
  panelId: string;
  params?: any; // Dockview params
}

export function MediaPanel({ context }: MediaPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fitMode, setFitMode] = useState<FitMode>('contain');
  const [zoom, setZoom] = useState(100);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | undefined>();

  // Track video dimensions when video metadata loads
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateDimensions = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
      }
    };

    video.addEventListener('loadedmetadata', updateDimensions);
    // Also check if already loaded
    updateDimensions();

    return () => video.removeEventListener('loadedmetadata', updateDimensions);
  }, []);

  // Resolve viewer context (from prop or fallback selection)
  const { resolvedContext } = useViewerContext({ context });

  // Overlay mode state
  const overlayMode = useAssetViewerOverlayStore((s) => s.overlayMode);
  const setOverlayMode = useAssetViewerOverlayStore((s) => s.setOverlayMode);
  const toggleOverlayMode = useAssetViewerOverlayStore((s) => s.toggleOverlayMode);
  const selectRegion = useAssetRegionStore((s) => s.selectRegion);

  const { isMaximized, toggleMaximize } = useMediaMaximize({
    dockviewApi: resolvedContext.dockviewApi,
    dockviewApiRef: resolvedContext.dockviewApiRef,
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

  const {
    overlays: availableOverlays,
    activeOverlay,
    effectiveOverlayMode,
    toggleOverlay,
    getOverlayForShortcut,
  } = useMediaOverlayHost({
    asset,
    overlayMode,
    setOverlayMode,
    toggleOverlayMode,
  });

  const annotationMode = activeOverlay?.id === 'annotate';
  const ActiveToolbar = activeOverlay?.Toolbar;
  const ActiveSidebar = activeOverlay?.Sidebar;
  const ActiveMain = activeOverlay?.Main;
  const activeOverlayId = activeOverlay?.id ?? null;

  // Frame capture hook
  const { isCapturing, captureFrame } = useFrameCapture({
    asset,
    videoRef,
    activeOverlayId,
  });

  // Overlay keyboard shortcuts
  useOverlayShortcuts({
    overlayMode,
    annotationMode,
    overlayHostState: { toggleOverlay, getOverlayForShortcut },
  });

  // Provide region annotations capability for other panels to consume
  useProvideRegionAnnotations({
    assetId: asset?.id ?? null,
    providerId: 'media-panel',
  });

  const zoomIn = () => setZoom(Math.min(zoom + 25, 400));
  const zoomOut = () => setZoom(Math.max(zoom - 25, 25));
  const resetZoom = () => setZoom(100);

  const handleToggleOverlay = (id: string) => {
    const entering = overlayMode !== id;
    if (!toggleOverlay(id)) {
      return;
    }
    if (entering) {
      selectRegion(null);
    }
  };

  // Clear selection when asset changes
  useEffect(() => {
    selectRegion(null);
  }, [asset?.id, selectRegion]);

  if (!asset) {
    return (
      <div className="h-full flex items-center justify-center text-neutral-500">
        No asset selected
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {ActiveToolbar && (
        <ActiveToolbar
          asset={asset}
          settings={settings}
          onCaptureFrame={captureFrame}
          captureDisabled={isCapturing}
          videoDimensions={videoDimensions}
        />
      )}

      {/* Main content area */}
      <div className="flex-1 min-h-0 flex">
        {/* Media/overlay display */}
        <div className="flex-1 min-w-0 relative">
          {ActiveMain ? (
            <ActiveMain
              asset={asset}
              settings={settings}
              onCaptureFrame={captureFrame}
              captureDisabled={isCapturing}
            />
          ) : (
            <MediaDisplay
              asset={asset}
              settings={settings}
              fitMode={fitMode}
              zoom={zoom}
              videoRef={videoRef}
            />
          )}
        </div>

        {ActiveSidebar && (
          <ActiveSidebar
            asset={asset}
            settings={settings}
            onCaptureFrame={captureFrame}
            captureDisabled={isCapturing}
          />
        )}
      </div>

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
        overlayMode={effectiveOverlayMode}
        overlayTools={availableOverlays}
        onToggleOverlay={handleToggleOverlay}
        showCapture={asset?.type === 'video' && activeOverlayId !== 'capture'}
        captureDisabled={isCapturing}
        onCaptureFrame={captureFrame}
      />
    </div>
  );
}
