import { useCallback, useMemo } from 'react';

import { useAssetRegionStore } from '@features/mediaViewer';

import type { ViewState } from '@/components/interactive-surface';
import { initPointWidths, WIDTH_LIMITS } from '@/components/interactive-surface/curveEditUtils';

import { RegionAnnotationOverlay } from '../../panels/RegionAnnotationOverlay';
import { useRegionStoreSelectors } from '../index';
import {
  OverlaySidePanel,
  SideSection,
  SideDivider,
  SideToolButton,
  SideSlider,
} from '../shared/OverlaySidePanel';
import type { MediaOverlayComponentProps } from '../types';

export function AnnotationOverlayMain({ asset, settings, viewState, onViewStateChange }: MediaOverlayComponentProps) {
  const overlayViewState = useMemo<Partial<ViewState> | undefined>(
    () => viewState ? { zoom: viewState.zoom, pan: viewState.pan, fitMode: viewState.fitMode as ViewState['fitMode'] } : undefined,
    [viewState],
  );

  return (
    <div className="absolute inset-0 flex bg-surface-inset">
      <AnnotationToolsPanel asset={asset} />
      <div className="flex-1 min-w-0 relative">
        <RegionAnnotationOverlay
          asset={asset}
          settings={settings}
          viewState={overlayViewState}
          onViewStateChange={onViewStateChange}
        />
      </div>
    </div>
  );
}

function AnnotationToolsPanel({ asset }: { asset: MediaOverlayComponentProps['asset'] }) {
  const {
    selectedRegionId,
    drawingMode,
    setDrawingMode,
  } = useRegionStoreSelectors(useAssetRegionStore, asset.id);

  // Selected curve's width control
  const updateRegion = useAssetRegionStore((s) => s.updateRegion);
  const selectedRegion = useAssetRegionStore((s) =>
    selectedRegionId ? s.getRegion(asset.id, selectedRegionId) : undefined,
  );
  const isCurve = selectedRegion?.type === 'curve';
  const curveAvgWidth = useMemo(() => {
    if (!isCurve || !selectedRegion?.pointWidths?.length) return 3;
    const ws = selectedRegion.pointWidths;
    return ws.reduce((a, b) => a + b, 0) / ws.length;
  }, [isCurve, selectedRegion?.pointWidths]);

  const handleUniformWidthChange = useCallback(
    (newWidth: number) => {
      if (!selectedRegionId || !selectedRegion) return;
      const count = selectedRegion.points?.length ?? 0;
      if (count === 0) return;
      updateRegion(asset.id, selectedRegionId, {
        pointWidths: initPointWidths(count, newWidth),
      });
    },
    [asset.id, selectedRegionId, selectedRegion, updateRegion],
  );

  return (
    <OverlaySidePanel className="w-56">
      <SideSection label="Tools">
        <SideToolButton
          icon="mousePointer"
          label="Select"
          active={drawingMode === 'select'}
          title="Select / move regions (V)"
          onClick={() => setDrawingMode('select')}
        />
      </SideSection>

      <SideDivider />

      <SideSection label="Draw">
        <SideToolButton
          icon="square"
          label="Rect"
          active={drawingMode === 'rect'}
          title="Draw rectangle regions (R)"
          onClick={() => setDrawingMode('rect')}
        />
        <SideToolButton
          icon="pencil"
          label="Polygon"
          active={drawingMode === 'polygon'}
          title="Draw polygon regions (P)"
          onClick={() => setDrawingMode('polygon')}
        />
        <SideToolButton
          icon="penTool"
          label="Curve"
          active={drawingMode === 'curve'}
          title="Draw open curves (C)"
          onClick={() => setDrawingMode('curve')}
        />
      </SideSection>

      {isCurve && (
        <>
          <SideDivider />
          <SideSection label="Stroke Width">
            <SideSlider
              label={`Width: ${Math.round(curveAvgWidth)}`}
              value={curveAvgWidth}
              min={WIDTH_LIMITS.MIN}
              max={WIDTH_LIMITS.MAX}
              step={0.5}
              onChange={handleUniformWidthChange}
            />
            <span className="text-[9px] text-th-muted">Scroll on a vertex to adjust individually</span>
          </SideSection>
        </>
      )}
    </OverlaySidePanel>
  );
}
