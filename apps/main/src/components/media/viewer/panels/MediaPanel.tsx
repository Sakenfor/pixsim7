/**
 * MediaPanel
 *
 * Media preview panel for the asset viewer.
 * Orchestrates media display and controls.
 * Supports overlay modes for drawing regions and pose references.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

import { useViewerGestures, GestureOverlay, GestureCancelOverlay, type ViewerGestureContext } from '@lib/gestures';
import { OverlayContainer } from '@lib/ui/overlay';

import { useAssetViewerStore } from '@features/assets';
import { toggleFavoriteTag } from '@features/assets/lib/favoriteTag';
import { useAssetRegionStore, useCaptureRegionStore, useAssetViewerOverlayStore } from '@features/mediaViewer';

import { useOverlayWidgetsForAsset } from '../../hooks/useOverlayWidgetsForAsset';
import { useProvideRegionAnnotations } from '../capabilities';
import { useMediaOverlayHost, useMediaOverlayRegistry, DefaultLayerSidebar } from '../overlays';
import { useMaskOverlayStore } from '../overlays/builtins/maskOverlayStore';
import type { ViewerPanelContext } from '../types';

import { useFrameCapture, useOverlayShortcuts, useViewerContext } from './hooks';
import { MediaControlBar } from './MediaControlBar';
import { MediaDisplay, type FitMode } from './MediaDisplay';
import { useMediaMaximize } from './useMediaMaximize';
import { ViewerToolStrip } from './ViewerToolStrip';

interface MediaPanelProps {
  context?: ViewerPanelContext;
  panelId: string;
  params?: any; // Dockview params
}

export function MediaPanel({ context }: MediaPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [fitMode, setFitMode] = useState<FitMode>('contain');
  const [zoom, setZoom] = useState(100);
  const [mediaDimensions, setMediaDimensions] = useState<{ width: number; height: number } | undefined>();

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
    dockviewHost: resolvedContext.dockviewHost,
    dockviewHostRef: resolvedContext.dockviewHostRef,
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

  // Track media dimensions — re-runs when asset changes so refs point to correct elements
  const assetId = asset?.id;
  const assetType = asset?.type;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateDimensions = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setMediaDimensions({ width: video.videoWidth, height: video.videoHeight });
      }
    };

    video.addEventListener('loadedmetadata', updateDimensions);
    updateDimensions();

    return () => video.removeEventListener('loadedmetadata', updateDimensions);
  }, [assetId, assetType]);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;

    const updateDimensions = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        setMediaDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      }
    };

    image.addEventListener('load', updateDimensions);
    updateDimensions();

    return () => image.removeEventListener('load', updateDimensions);
  }, [assetId, assetType]);

  // Shared overlay widgets for the viewer (favorite, generation bar, etc.)
  const assetModel = asset?._assetModel ?? null;
  const viewerOverlay = useOverlayWidgetsForAsset({
    asset: assetModel,
    context: 'viewer',
  });
  const hasViewerOverlay = !!assetModel;

  const {
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
  const { overlays: registeredOverlays } = useMediaOverlayRegistry();

  const annotationMode = activeOverlay?.id === 'annotate';
  const ActiveToolbar = activeOverlay?.Toolbar;
  const ActiveSidebar = activeOverlay?.Sidebar;
  const ActiveMain = activeOverlay?.Main;
  const activeOverlayId = activeOverlay?.id ?? null;
  const toolStripOverlays = useMemo(
    () =>
      registeredOverlays.map((overlay) => {
        const available = asset
          ? (overlay.isAvailable ? overlay.isAvailable(asset) : true)
          : false;

        return {
          ...overlay,
          disabled: !available,
          disabledReason: available
            ? undefined
            : overlay.id === 'mask'
              ? 'Image assets only'
              : overlay.id === 'prompt-tools'
              ? 'Image assets only'
              : 'Unavailable for this asset',
        };
      }),
    [registeredOverlays, asset],
  );

  // Frame capture hook
  const { isCapturing, captureFrame } = useFrameCapture({
    asset,
    videoRef,
    imageRef,
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

  // Scope state for navigation scope switcher
  const scopes = useAssetViewerStore((s) => s.scopes);
  const activeScopeId = useAssetViewerStore((s) => s.activeScopeId);
  const switchScope = useAssetViewerStore((s) => s.switchScope);

  const scopeItems = useMemo(() =>
    Object.entries(scopes).map(([id, scope]) => ({
      id,
      label: scope.label,
      count: scope.assets.length,
      active: id === activeScopeId,
    })),
    [scopes, activeScopeId],
  );

  const zoomIn = () => setZoom(Math.min(zoom + 25, 400));
  const zoomOut = () => setZoom(Math.max(zoom - 25, 25));
  const resetZoom = () => setZoom(100);

  const handleToggleOverlay = useCallback((id: string) => {
    const entering = overlayMode !== id;
    if (!toggleOverlay(id)) {
      return;
    }
    if (entering) {
      selectRegion(null);
    }
  }, [overlayMode, toggleOverlay, selectRegion]);

  // Move/select mode: set the active overlay's internal mode to select/view
  const annotationDrawingMode = useAssetRegionStore((s) => s.drawingMode);
  const captureDrawingMode = useCaptureRegionStore((s) => s.drawingMode);
  const maskMode = useMaskOverlayStore((s) => s.mode);

  const isMoveActive = useMemo(() => {
    if (!activeOverlay) return false;
    switch (activeOverlay.id) {
      case 'annotate': return annotationDrawingMode === 'select';
      case 'capture': return captureDrawingMode === 'select';
      case 'mask': return maskMode === 'view';
      default: return false;
    }
  }, [activeOverlay, annotationDrawingMode, captureDrawingMode, maskMode]);

  const handleMoveMode = useCallback(() => {
    if (!activeOverlay) return;
    switch (activeOverlay.id) {
      case 'annotate':
        useAssetRegionStore.getState().setDrawingMode('select');
        break;
      case 'capture':
        useCaptureRegionStore.getState().setDrawingMode('select');
        break;
      case 'mask':
        useMaskOverlayStore.getState().setMode('view');
        break;
    }
  }, [activeOverlay]);

  // Clear selection when asset changes
  useEffect(() => {
    selectRegion(null);
  }, [asset?.id, selectRegion]);

  // ─── Viewer gestures (viewing mode only) ────────────────────────────────────

  const toggleFitModeCb = useCallback(() => {
    setFitMode((prev) => (prev === 'contain' ? 'actual' : 'contain'));
  }, []);

  const toggleFavoriteCb = useCallback(() => {
    const model = asset?._assetModel;
    if (model) toggleFavoriteTag(model);
  }, [asset?._assetModel]);

  const viewerGestureCtx = useMemo<ViewerGestureContext>(() => ({
    navigatePrev,
    navigateNext,
    closeViewer: resolvedContext.closeViewer,
    toggleFitMode: toggleFitModeCb,
    toggleFavorite: toggleFavoriteCb,
  }), [navigatePrev, navigateNext, resolvedContext.closeViewer, toggleFitModeCb, toggleFavoriteCb]);

  const viewerGesture = useViewerGestures(viewerGestureCtx);
  const gesturesActive = viewerGesture.enabled && effectiveOverlayMode === 'none';

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
          mediaDimensions={mediaDimensions}
        />
      )}

      {/* Main content area with tool strip */}
      <div className="flex-1 min-h-0 flex">
        {/* Tool strip */}
        <ViewerToolStrip
          overlayTools={toolStripOverlays}
          overlayMode={effectiveOverlayMode}
          onToggleOverlay={handleToggleOverlay}
          onMoveMode={handleMoveMode}
          isMoveActive={isMoveActive}
        />

        {/* Media/overlay display with gesture support */}
        <div
          className="flex-1 min-w-0 relative flex flex-col"
          {...(gesturesActive ? viewerGesture.gestureHandlers : {})}
        >
          {hasViewerOverlay ? (
            <OverlayContainer
              configuration={viewerOverlay.overlayConfig}
              data={viewerOverlay.overlayData}
              className="flex-1 min-h-0 relative flex flex-col"
            >
              {ActiveMain && (
                <div className="absolute inset-0 z-10">
                  <ActiveMain
                    asset={asset}
                    settings={settings}
                    onCaptureFrame={captureFrame}
                    captureDisabled={isCapturing}
                    mediaDimensions={mediaDimensions}
                  />
                </div>
              )}
              <MediaDisplay
                asset={asset}
                settings={settings}
                fitMode={fitMode}
                zoom={zoom}
                videoRef={videoRef}
                imageRef={imageRef}
              />
            </OverlayContainer>
          ) : (
            <>
              {ActiveMain && (
                <div className="absolute inset-0 z-10">
                  <ActiveMain
                    asset={asset}
                    settings={settings}
                    onCaptureFrame={captureFrame}
                    captureDisabled={isCapturing}
                    mediaDimensions={mediaDimensions}
                  />
                </div>
              )}
              <MediaDisplay
                asset={asset}
                settings={settings}
                fitMode={fitMode}
                zoom={zoom}
                videoRef={videoRef}
                imageRef={imageRef}
              />
            </>
          )}
          {/* Gesture feedback overlays */}
          {gesturesActive && viewerGesture.isCommitted && viewerGesture.actionId && viewerGesture.direction && (
            <GestureOverlay
              direction={viewerGesture.direction}
              actionId={viewerGesture.actionId}
              count={viewerGesture.count}
              duration={viewerGesture.duration}
              durationUnit={viewerGesture.durationUnit}
              tierIndex={viewerGesture.tierIndex}
              totalTiers={viewerGesture.totalTiers}
              isCascade={viewerGesture.isCascade}
            />
          )}
          {gesturesActive && viewerGesture.isReturning && viewerGesture.returningActionLabel && (
            <GestureCancelOverlay actionLabel={viewerGesture.returningActionLabel} />
          )}
        </div>

        {ActiveSidebar ? (
          <ActiveSidebar
            asset={asset}
            settings={settings}
            onCaptureFrame={captureFrame}
            captureDisabled={isCapturing}
          />
        ) : activeOverlay ? (
          <DefaultLayerSidebar />
        ) : null}
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
        isOverlayActive={effectiveOverlayMode !== 'none'}
        showCapture={asset?.type === 'video' && activeOverlayId !== 'capture'}
        captureDisabled={isCapturing}
        onCaptureFrame={captureFrame}
        scopeLabel={activeScopeId ? scopes[activeScopeId]?.label : undefined}
        scopes={scopeItems.length > 0 ? scopeItems : undefined}
        onSwitchScope={switchScope}
      />
    </div>
  );
}
