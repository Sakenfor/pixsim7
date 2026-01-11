import { useAssetRegionStore } from '@features/mediaViewer';

import { RegionAnnotationOverlay } from '../../panels/RegionAnnotationOverlay';
import { RegionEditForm, RegionList } from '../../panels/RegionEditForm';
import { getToolbarButtonClass, useRegionStoreSelectors } from '../index';
import type { MediaOverlayComponentProps } from '../types';

export function AnnotationOverlayMain({ asset, settings }: MediaOverlayComponentProps) {
  return <RegionAnnotationOverlay asset={asset} settings={settings} />;
}

export function AnnotationOverlayToolbar() {
  const drawingMode = useAssetRegionStore((s) => s.drawingMode);
  const setDrawingMode = useAssetRegionStore((s) => s.setDrawingMode);

  return (
    <AnnotationToolbar
      drawingMode={drawingMode}
      onDrawingModeChange={setDrawingMode}
    />
  );
}

export function AnnotationOverlaySidebar({ asset }: MediaOverlayComponentProps) {
  const { selectedRegionId, selectRegion } = useRegionStoreSelectors(
    useAssetRegionStore,
    asset.id
  );

  return (
    <div className="w-56 flex-shrink-0 border-l border-neutral-700 bg-neutral-800/50 flex flex-col">
      {selectedRegionId && (
        <div className="p-2 border-b border-neutral-700">
          <RegionEditForm
            assetId={asset.id}
            regionId={selectedRegionId}
            onClose={() => selectRegion(null)}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        <div className="text-xs font-medium text-neutral-400 mb-2">Regions</div>
        <RegionList assetId={asset.id} />
      </div>
    </div>
  );
}

interface AnnotationToolbarProps {
  drawingMode: 'rect' | 'polygon' | 'select';
  onDrawingModeChange: (mode: 'rect' | 'polygon' | 'select') => void;
}

function AnnotationToolbar({
  drawingMode,
  onDrawingModeChange,
}: AnnotationToolbarProps) {
  return (
    <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800/90 border-b border-neutral-700 text-xs">
      <span className="text-neutral-400 mr-2">Draw:</span>

      <button
        onClick={() => onDrawingModeChange('rect')}
        className={getToolbarButtonClass(drawingMode === 'rect')}
        title="Draw rectangle regions (R)"
      >
        Rect
      </button>
      <button
        onClick={() => onDrawingModeChange('polygon')}
        className={getToolbarButtonClass(drawingMode === 'polygon')}
        title="Draw polygon regions, double-click to finish (P)"
      >
        Polygon
      </button>

      <div className="w-px h-4 bg-neutral-600 mx-1" />

      <button
        onClick={() => onDrawingModeChange('select')}
        className={getToolbarButtonClass(drawingMode === 'select')}
        title="Select and edit regions (S)"
      >
        Select
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
