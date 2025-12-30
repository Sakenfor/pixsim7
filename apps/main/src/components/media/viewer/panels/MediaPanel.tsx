/**
 * MediaPanel
 *
 * Media preview panel for the asset viewer.
 * Orchestrates media display and controls.
 * Supports annotation overlay mode for drawing regions.
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import type { ViewerPanelContext } from '../types';
import { MediaDisplay, type FitMode } from './MediaDisplay';
import { MediaControlBar } from './MediaControlBar';
import { useMediaMaximize } from './useMediaMaximize';
import { useAssetViewerStore } from '@features/assets';
import { CAP_ASSET_SELECTION, useCapability, type AssetSelection } from '@features/contextHub';
import { RegionAnnotationOverlay } from './RegionAnnotationOverlay';
import { RegionEditForm, RegionList } from './RegionEditForm';
import { useAssetRegionStore } from '../stores/assetRegionStore';
import { useProvideRegionAnnotations } from '../capabilities';

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

  // Annotation mode state
  const annotationMode = useAssetRegionStore((s) => s.annotationMode);
  const setAnnotationMode = useAssetRegionStore((s) => s.setAnnotationMode);
  const drawingMode = useAssetRegionStore((s) => s.drawingMode);
  const setDrawingMode = useAssetRegionStore((s) => s.setDrawingMode);
  const selectedRegionId = useAssetRegionStore((s) => s.selectedRegionId);
  const selectRegion = useAssetRegionStore((s) => s.selectRegion);

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

  // Toggle annotation mode
  const handleToggleAnnotation = useCallback(() => {
    setAnnotationMode(!annotationMode);
    if (!annotationMode) {
      // Reset selection when entering annotation mode
      selectRegion(null);
    }
  }, [annotationMode, setAnnotationMode, selectRegion]);

  // Clear selection when asset changes
  useEffect(() => {
    selectRegion(null);
  }, [asset?.id, selectRegion]);

  // Keyboard shortcuts for annotation mode
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
        case 'a':
          // Toggle annotation mode
          if (!e.ctrlKey && !e.metaKey) {
            handleToggleAnnotation();
          }
          break;
        case 'escape':
          // Exit annotation mode or deselect region
          if (annotationMode) {
            if (selectedRegionId) {
              selectRegion(null);
            } else {
              setAnnotationMode(false);
            }
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [annotationMode, selectedRegionId, handleToggleAnnotation, setAnnotationMode, setDrawingMode, selectRegion]);

  if (!asset) {
    return (
      <div className="h-full flex items-center justify-center text-neutral-500">
        No asset selected
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Annotation toolbar - shown when annotation mode is active */}
      {annotationMode && (
        <AnnotationToolbar
          drawingMode={drawingMode}
          onDrawingModeChange={setDrawingMode}
          assetId={asset.id}
        />
      )}

      {/* Main content area */}
      <div className="flex-1 min-h-0 flex">
        {/* Media/Annotation display */}
        <div className="flex-1 min-w-0 relative">
          {annotationMode ? (
            <RegionAnnotationOverlay
              asset={asset}
              settings={settings}
            />
          ) : (
            <MediaDisplay
              asset={asset}
              settings={settings}
              fitMode={fitMode}
              zoom={zoom}
            />
          )}
        </div>

        {/* Region sidebar - shown when annotation mode is active */}
        {annotationMode && (
          <div className="w-56 flex-shrink-0 border-l border-neutral-700 bg-neutral-800/50 flex flex-col">
            {/* Selected region editor */}
            {selectedRegionId && (
              <div className="p-2 border-b border-neutral-700">
                <RegionEditForm
                  assetId={asset.id}
                  regionId={selectedRegionId}
                  onClose={() => selectRegion(null)}
                />
              </div>
            )}

            {/* Region list */}
            <div className="flex-1 overflow-y-auto p-2">
              <div className="text-xs font-medium text-neutral-400 mb-2">Regions</div>
              <RegionList assetId={asset.id} />
            </div>
          </div>
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
        annotationMode={annotationMode}
        onToggleAnnotation={handleToggleAnnotation}
      />
    </div>
  );
}

// ============================================================================
// Annotation Toolbar Component
// ============================================================================

interface AnnotationToolbarProps {
  drawingMode: 'rect' | 'polygon' | 'select';
  onDrawingModeChange: (mode: 'rect' | 'polygon' | 'select') => void;
  assetId: string | number;
}

function AnnotationToolbar({
  drawingMode,
  onDrawingModeChange,
}: AnnotationToolbarProps) {
  const buttonBase =
    'px-2 py-1 text-xs rounded transition-colors';
  const buttonActive = 'bg-blue-600 text-white';
  const buttonInactive =
    'bg-neutral-700 hover:bg-neutral-600 text-neutral-200';

  return (
    <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800/90 border-b border-neutral-700 text-xs">
      <span className="text-neutral-400 mr-2">Draw:</span>

      <button
        onClick={() => onDrawingModeChange('rect')}
        className={`${buttonBase} ${drawingMode === 'rect' ? buttonActive : buttonInactive}`}
        title="Draw rectangle regions (R)"
      >
        ▭ Rect
      </button>
      <button
        onClick={() => onDrawingModeChange('polygon')}
        className={`${buttonBase} ${drawingMode === 'polygon' ? buttonActive : buttonInactive}`}
        title="Draw polygon regions, double-click to finish (P)"
      >
        ⬡ Polygon
      </button>

      <div className="w-px h-4 bg-neutral-600 mx-1" />

      <button
        onClick={() => onDrawingModeChange('select')}
        className={`${buttonBase} ${drawingMode === 'select' ? buttonActive : buttonInactive}`}
        title="Select and edit regions (S)"
      >
        ↖ Select
      </button>

      <div className="flex-1" />

      <span className="text-neutral-500 text-[10px]">
        {drawingMode === 'rect' && 'Drag to draw rectangle'}
        {drawingMode === 'polygon' && 'Click points, double-click to finish'}
        {drawingMode === 'select' && 'Click region to select'}
      </span>
    </div>
  );
}
