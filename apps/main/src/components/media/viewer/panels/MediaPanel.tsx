/**
 * MediaPanel
 *
 * Media preview panel for the asset viewer.
 * Orchestrates media display and controls.
 * Supports overlay modes for drawing regions and pose references.
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import type { ViewerPanelContext } from '../types';
import { MediaDisplay, type FitMode } from './MediaDisplay';
import { MediaControlBar } from './MediaControlBar';
import { useMediaMaximize } from './useMediaMaximize';
import { useAssetViewerStore } from '@features/assets';
import { CAP_ASSET_SELECTION, useCapability, type AssetSelection } from '@features/contextHub';
import { useAssetRegionStore, useAssetViewerOverlayStore } from '@features/mediaViewer';
import { useProvideRegionAnnotations } from '../capabilities';
import { useMediaOverlayRegistry, type MediaOverlayId } from '../overlays';

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

  // Overlay mode state
  const overlayMode = useAssetViewerOverlayStore((s) => s.overlayMode);
  const setOverlayMode = useAssetViewerOverlayStore((s) => s.setOverlayMode);
  const toggleOverlayMode = useAssetViewerOverlayStore((s) => s.toggleOverlayMode);
  const setDrawingMode = useAssetRegionStore((s) => s.setDrawingMode);
  const selectedRegionId = useAssetRegionStore((s) => s.selectedRegionId);
  const selectRegion = useAssetRegionStore((s) => s.selectRegion);

  const annotationMode = overlayMode === 'annotate';
  const { overlays } = useMediaOverlayRegistry();
  const activeOverlay = overlayMode !== 'none'
    ? overlays.find((overlay) => overlay.id === overlayMode)
    : null;
  const ActiveToolbar = activeOverlay?.Toolbar;
  const ActiveSidebar = activeOverlay?.Sidebar;
  const ActiveMain = activeOverlay?.Main;

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

  // Provide region annotations capability for other panels to consume
  useProvideRegionAnnotations({
    assetId: asset?.id ?? null,
    providerId: 'media-panel',
  });

  const zoomIn = () => setZoom(Math.min(zoom + 25, 400));
  const zoomOut = () => setZoom(Math.max(zoom - 25, 25));
  const resetZoom = () => setZoom(100);

  const handleToggleOverlay = useCallback(
    (id: MediaOverlayId) => {
      const entering = overlayMode !== id;
      toggleOverlayMode(id);
      if (entering) {
        selectRegion(null);
      }
    },
    [overlayMode, toggleOverlayMode, selectRegion]
  );

  // Clear selection when asset changes
  useEffect(() => {
    selectRegion(null);
  }, [asset?.id, selectRegion]);

  // Keyboard shortcuts for overlay modes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if in input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'escape':
          // Exit overlay mode or deselect region
          if (annotationMode) {
            if (selectedRegionId) {
              selectRegion(null);
            } else {
              setOverlayMode('none');
            }
          } else if (overlayMode !== 'none') {
            setOverlayMode('none');
          }
          break;
        case 'r':
          // Switch to rect mode
          if (annotationMode && !e.ctrlKey && !e.metaKey) {
            setDrawingMode('rect');
          }
          break;
        case 'p':
          // Switch to polygon mode
          if (annotationMode && !e.ctrlKey && !e.metaKey) {
            setDrawingMode('polygon');
          }
          break;
        case 's':
          // Switch to select mode
          if (annotationMode && !e.ctrlKey && !e.metaKey) {
            setDrawingMode('select');
          }
          break;
        default: {
          const matchingOverlay = overlays.find(
            (overlay) =>
              overlay.shortcut?.toLowerCase() === e.key.toLowerCase()
          );
          if (matchingOverlay && !e.ctrlKey && !e.metaKey) {
            handleToggleOverlay(matchingOverlay.id);
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    annotationMode,
    overlayMode,
    selectedRegionId,
    overlays,
    handleToggleOverlay,
    setOverlayMode,
    setDrawingMode,
    selectRegion,
  ]);

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
        <ActiveToolbar asset={asset} settings={settings} />
      )}

      {/* Main content area */}
      <div className="flex-1 min-h-0 flex">
        {/* Media/overlay display */}
        <div className="flex-1 min-w-0 relative">
          {ActiveMain ? (
            <ActiveMain asset={asset} settings={settings} />
          ) : (
            <MediaDisplay
              asset={asset}
              settings={settings}
              fitMode={fitMode}
              zoom={zoom}
            />
          )}
        </div>

        {ActiveSidebar && (
          <ActiveSidebar asset={asset} settings={settings} />
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
        overlayMode={overlayMode}
        overlayTools={overlays}
        onToggleOverlay={handleToggleOverlay}
      />
    </div>
  );
}
