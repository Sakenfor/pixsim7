import { useMemo, useCallback } from 'react';

import { Icon } from '@lib/icons';

import { useCaptureRegionStore } from '@features/mediaViewer';

import type { CaptureAction } from '../../panels/hooks/useFrameCapture';
import { RegionAnnotationOverlay } from '../../panels/RegionAnnotationOverlay';
import { findActiveRegion, getRegionPixelDimensions, useRegionStoreSelectors } from '../index';
import { LayerPanel } from '../shared/LayerPanel';
import {
  OverlaySidePanel,
  SideSection,
  SideDivider,
  SideToolButton,
  SidePrimaryButton,
} from '../shared/OverlaySidePanel';
import type { MediaOverlayComponentProps } from '../types';

export function CaptureOverlayMain({
  asset,
  settings,
  onCaptureFrame,
  captureDisabled,
  mediaDimensions,
}: MediaOverlayComponentProps) {
  return (
    <div className="absolute inset-0 flex bg-surface-inset">
      <CaptureSidePanel
        asset={asset}
        onCaptureFrame={onCaptureFrame}
        captureDisabled={captureDisabled}
        mediaDimensions={mediaDimensions}
      />
      <div className="flex-1 min-w-0 relative">
        <RegionAnnotationOverlay
          asset={asset}
          settings={settings}
          useRegionStore={useCaptureRegionStore}
        />
      </div>
    </div>
  );
}

// ── CaptureSidePanel ──────────────────────────────────────────────────

interface CaptureSidePanelProps {
  asset: MediaOverlayComponentProps['asset'];
  onCaptureFrame?: (action?: CaptureAction) => void;
  captureDisabled?: boolean;
  mediaDimensions?: { width: number; height: number };
}

function CaptureSidePanel({
  asset,
  onCaptureFrame,
  captureDisabled,
  mediaDimensions,
}: CaptureSidePanelProps) {
  const {
    regions,
    layers,
    activeLayerId,
    regionCount,
    selectedRegionId,
    drawingMode,
    setDrawingMode,
    addLayer,
    removeLayer,
    setActiveLayer,
    toggleLayerVisibility,
    toggleLayerLock,
    moveLayer,
    renameLayer,
    clearRegions,
  } = useRegionStoreSelectors(useCaptureRegionStore, asset.id);

  const layerInfos = useMemo(
    () => layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      locked: layer.locked,
      opacity: layer.opacity,
      hasContent: regions.some((region) => region.layerId === layer.id),
    })),
    [layers, regions]
  );

  const visibleLayerIds = useMemo(
    () => new Set(layers.filter((layer) => layer.visible).map((layer) => layer.id)),
    [layers]
  );
  const visibleRegions = useMemo(
    () => regions.filter((region) => visibleLayerIds.has(region.layerId)),
    [regions, visibleLayerIds]
  );

  const regionPixelDimensions = useMemo(() => {
    const activeRegion = findActiveRegion(visibleRegions, selectedRegionId);
    if (!activeRegion?.bounds || activeRegion.type !== 'rect') return null;
    return getRegionPixelDimensions(activeRegion.bounds, mediaDimensions);
  }, [mediaDimensions, selectedRegionId, visibleRegions]);

  const isVideo = asset.type === 'video';
  const canCapture = Boolean(onCaptureFrame) && (asset.type === 'video' || asset.type === 'image');

  const handleAction = useCallback(
    (action: CaptureAction) => onCaptureFrame?.(action),
    [onCaptureFrame],
  );

  return (
    <OverlaySidePanel>
      <SideSection label="Region">
        <SideToolButton
          icon="square"
          label="Rect"
          active={drawingMode === 'rect'}
          title="Draw capture rectangle"
          onClick={() => setDrawingMode('rect')}
        />
        <SideToolButton
          icon="pencil"
          label="Poly"
          active={drawingMode === 'polygon'}
          title="Draw polygon capture region"
          onClick={() => setDrawingMode('polygon')}
        />
        <SideToolButton
          icon="penTool"
          label="Curve"
          active={drawingMode === 'curve'}
          title="Draw open curve (no fill)"
          onClick={() => setDrawingMode('curve')}
        />
        <SideToolButton
          icon="mousePointer"
          label="Select"
          active={drawingMode === 'select'}
          title="Select a capture region"
          onClick={() => setDrawingMode('select')}
        />
      </SideSection>

      <SideDivider />

      <SideSection label="Layers">
        <LayerPanel
          layers={layerInfos}
          activeLayerId={activeLayerId}
          onSelectLayer={setActiveLayer}
          onToggleVisibility={toggleLayerVisibility}
          onToggleLock={toggleLayerLock}
          onMoveLayer={moveLayer}
          onRenameLayer={renameLayer}
          onAddLayer={addLayer}
          onRemoveLayer={removeLayer}
        />
      </SideSection>

      <SideDivider />

      <SideSection label="Actions">
        <button
          onClick={clearRegions}
          disabled={regionCount === 0}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-th-secondary hover:bg-surface-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Clear capture regions"
        >
          Clear
        </button>
      </SideSection>

      {regionPixelDimensions && (
        <>
          <SideDivider />
          <SideSection label="Info">
            <span className="text-th-secondary text-[11px] tabular-nums">
              {regionPixelDimensions.width} × {regionPixelDimensions.height} px
            </span>
          </SideSection>
        </>
      )}

      <div className="flex-1" />

      <SidePrimaryButton
        variant="success"
        disabled={!canCapture || captureDisabled}
        title="Copy to clipboard"
        onClick={() => handleAction('clipboard')}
      >
        <span className="flex items-center justify-center gap-1.5">
          <Icon name="camera" size={13} />
          {isVideo ? 'Capture' : 'Crop'}
        </span>
      </SidePrimaryButton>

      <div className="px-2">
        <button
          onClick={() => handleAction('upload')}
          disabled={!canCapture || captureDisabled}
          className="w-full py-1.5 rounded text-[11px] text-th-secondary hover:text-th hover:bg-surface-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Upload to provider"
        >
          <span className="flex items-center justify-center gap-1.5">
            <Icon name="upload" size={12} />
            Upload to provider
          </span>
        </button>
      </div>
    </OverlaySidePanel>
  );
}
