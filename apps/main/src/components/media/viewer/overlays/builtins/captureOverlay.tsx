import { useMemo } from 'react';

import { useCaptureRegionStore } from '@features/mediaViewer';

import { RegionAnnotationOverlay } from '../../panels/RegionAnnotationOverlay';
import {
  getToolbarButtonClass,
  TOOLBAR_BUTTON_BASE,
  TOOLBAR_BUTTON_INACTIVE,
  TOOLBAR_BUTTON_DISABLED,
  findActiveRegion,
  getRegionPixelDimensions,
  useRegionStoreSelectors,
} from '../index';
import type { MediaOverlayComponentProps } from '../types';

export function CaptureOverlayMain({ asset, settings }: MediaOverlayComponentProps) {
  return (
    <RegionAnnotationOverlay
      asset={asset}
      settings={settings}
      useRegionStore={useCaptureRegionStore}
    />
  );
}

export function CaptureOverlayToolbar({
  asset,
  onCaptureFrame,
  captureDisabled,
  mediaDimensions,
}: MediaOverlayComponentProps) {
  const {
    regions,
    regionCount,
    selectedRegionId,
    drawingMode,
    setDrawingMode,
    clearRegions,
  } = useRegionStoreSelectors(useCaptureRegionStore, asset.id);

  // Calculate pixel dimensions for selected/active capture region
  const regionPixelDimensions = useMemo(() => {
    const activeRegion = findActiveRegion(regions, selectedRegionId);
    if (!activeRegion?.bounds || activeRegion.type !== 'rect') return null;
    return getRegionPixelDimensions(activeRegion.bounds, mediaDimensions);
  }, [mediaDimensions, regions, selectedRegionId]);

  const isVideo = asset.type === 'video';
  const canCapture = Boolean(onCaptureFrame) && (asset.type === 'video' || asset.type === 'image');
  const buttonLabel = isVideo ? 'Capture Frame' : 'Crop';
  const buttonTitle = canCapture
    ? (isVideo ? 'Capture current frame' : 'Crop selected region')
    : 'Capture requires video or image';

  return (
    <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800/90 border-b border-neutral-700 text-xs">
      <span className="text-neutral-400 mr-2">Region:</span>

      <button
        onClick={() => setDrawingMode('rect')}
        className={getToolbarButtonClass(drawingMode === 'rect')}
        title="Draw capture rectangle"
      >
        Rect
      </button>
      <button
        onClick={() => setDrawingMode('select')}
        className={getToolbarButtonClass(drawingMode === 'select')}
        title="Select a capture region"
      >
        Select
      </button>

      <button
        onClick={clearRegions}
        disabled={regionCount === 0}
        className={`${TOOLBAR_BUTTON_BASE} ${TOOLBAR_BUTTON_INACTIVE} ${TOOLBAR_BUTTON_DISABLED}`}
        title="Clear capture regions"
      >
        Clear
      </button>

      {regionPixelDimensions && (
        <span className="text-neutral-400 ml-2" title="Capture region size in pixels">
          {regionPixelDimensions.width} x {regionPixelDimensions.height}
        </span>
      )}

      <div className="flex-1" />

      <button
        onClick={() => onCaptureFrame?.()}
        disabled={!canCapture || captureDisabled}
        className={`${TOOLBAR_BUTTON_BASE} ${canCapture ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : TOOLBAR_BUTTON_INACTIVE} ${TOOLBAR_BUTTON_DISABLED}`}
        title={buttonTitle}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
