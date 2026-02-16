import { Dropdown, DropdownItem } from '@pixsim7/shared.ui';
import { useMemo, useCallback, useRef, useState } from 'react';


import { useCaptureRegionStore } from '@features/mediaViewer';

import type { CaptureAction } from '../../panels/hooks/useFrameCapture';
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

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const chevronRef = useRef<HTMLButtonElement>(null);

  // Calculate pixel dimensions for selected/active capture region
  const regionPixelDimensions = useMemo(() => {
    const activeRegion = findActiveRegion(regions, selectedRegionId);
    if (!activeRegion?.bounds || activeRegion.type !== 'rect') return null;
    return getRegionPixelDimensions(activeRegion.bounds, mediaDimensions);
  }, [mediaDimensions, regions, selectedRegionId]);

  const isVideo = asset.type === 'video';
  const canCapture = Boolean(onCaptureFrame) && (asset.type === 'video' || asset.type === 'image');

  const handleAction = useCallback((action: CaptureAction) => {
    setIsDropdownOpen(false);
    onCaptureFrame?.(action);
  }, [onCaptureFrame]);

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
        onClick={() => setDrawingMode('polygon')}
        className={getToolbarButtonClass(drawingMode === 'polygon')}
        title="Draw polygon capture region, double-click to finish"
      >
        Poly
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

      <span className="text-neutral-500 text-[10px]">
        {drawingMode === 'rect' && 'Drag to draw rectangle'}
        {drawingMode === 'polygon' && 'Click points, double-click to finish'}
        {drawingMode === 'select' && 'Click region to select'}
      </span>

      {/* Split button: main action + dropdown chevron */}
      <div className="relative flex">
        <button
          onClick={() => handleAction('clipboard')}
          disabled={!canCapture || captureDisabled}
          className={`${TOOLBAR_BUTTON_BASE} rounded-r-none ${canCapture ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : TOOLBAR_BUTTON_INACTIVE} ${TOOLBAR_BUTTON_DISABLED}`}
          title="Copy to clipboard"
        >
          {isVideo ? 'Capture' : 'Crop'}
        </button>
        <button
          ref={chevronRef}
          onClick={() => setIsDropdownOpen((o) => !o)}
          disabled={!canCapture || captureDisabled}
          className={`${TOOLBAR_BUTTON_BASE} rounded-l-none border-l border-emerald-700 px-1 ${canCapture ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : TOOLBAR_BUTTON_INACTIVE} ${TOOLBAR_BUTTON_DISABLED}`}
          title="More capture actions"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M2 3.5L5 7L8 3.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <Dropdown
          isOpen={isDropdownOpen}
          onClose={() => setIsDropdownOpen(false)}
          position="bottom-right"
          triggerRef={chevronRef}
          minWidth="170px"
        >
          <DropdownItem onClick={() => handleAction('clipboard')}>
            Copy to clipboard
          </DropdownItem>
          <DropdownItem onClick={() => handleAction('upload')} variant="success">
            Upload to provider
          </DropdownItem>
        </Dropdown>
      </div>
    </div>
  );
}
