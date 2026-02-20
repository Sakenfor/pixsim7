import { useAssetRegionStore } from '@features/mediaViewer';

import { RegionAnnotationOverlay } from '../../panels/RegionAnnotationOverlay';
import { RegionEditForm, RegionList } from '../../panels/RegionEditForm';
import { useRegionStoreSelectors } from '../index';
import {
  OverlaySidePanel,
  SideSection,
  SideDivider,
  SideToolButton,
} from '../shared/OverlaySidePanel';
import type { MediaOverlayComponentProps } from '../types';

export function AnnotationOverlayMain({ asset, settings }: MediaOverlayComponentProps) {
  return (
    <div className="absolute inset-0 flex bg-surface-inset">
      <AnnotationSidePanel asset={asset} />
      <div className="flex-1 min-w-0 relative">
        <RegionAnnotationOverlay asset={asset} settings={settings} />
      </div>
    </div>
  );
}

// ── AnnotationSidePanel ───────────────────────────────────────────────

function AnnotationSidePanel({ asset }: { asset: MediaOverlayComponentProps['asset'] }) {
  const { selectedRegionId, drawingMode, setDrawingMode, selectRegion } =
    useRegionStoreSelectors(useAssetRegionStore, asset.id);

  return (
    <OverlaySidePanel className="w-56">
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
          icon="mousePointer"
          label="Select"
          active={drawingMode === 'select'}
          title="Select and edit regions (S)"
          onClick={() => setDrawingMode('select')}
        />
      </SideSection>

      <SideDivider />

      {/* Scrollable region list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2">
        <span className="text-[10px] text-th-muted uppercase tracking-wider">Regions</span>
        <RegionList assetId={asset.id} />
      </div>

      {/* Conditional edit form */}
      {selectedRegionId && (
        <div className="border-t border-th/10 p-2">
          <RegionEditForm
            assetId={asset.id}
            regionId={selectedRegionId}
            onClose={() => selectRegion(null)}
          />
        </div>
      )}
    </OverlaySidePanel>
  );
}
