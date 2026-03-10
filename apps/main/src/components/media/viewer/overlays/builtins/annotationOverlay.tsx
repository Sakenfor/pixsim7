import { useMemo } from 'react';

import { useAssetRegionStore } from '@features/mediaViewer';

import { RegionAnnotationOverlay } from '../../panels/RegionAnnotationOverlay';
import { RegionEditForm, RegionList } from '../../panels/RegionEditForm';
import { useRegionStoreSelectors } from '../index';
import { LayerPanel } from '../shared/LayerPanel';
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
      <AnnotationToolsPanel asset={asset} />
      <div className="flex-1 min-w-0 relative">
        <RegionAnnotationOverlay asset={asset} settings={settings} />
      </div>
      <AnnotationLayersPanel asset={asset} />
    </div>
  );
}

function AnnotationToolsPanel({ asset }: { asset: MediaOverlayComponentProps['asset'] }) {
  const {
    selectedRegionId,
    drawingMode,
    setDrawingMode,
    selectRegion,
  } = useRegionStoreSelectors(useAssetRegionStore, asset.id);

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
          icon="penTool"
          label="Curve"
          active={drawingMode === 'curve'}
          title="Draw open curves (C)"
          onClick={() => setDrawingMode('curve')}
        />
      </SideSection>

      <SideDivider />

      <div className="flex-1 min-h-0 overflow-y-auto px-2">
        <span className="text-[10px] text-th-muted uppercase tracking-wider">Regions</span>
        <RegionList assetId={asset.id} />
      </div>

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

function AnnotationLayersPanel({ asset }: { asset: MediaOverlayComponentProps['asset'] }) {
  const {
    regions,
    layers,
    activeLayerId,
    addLayer,
    removeLayer,
    setActiveLayer,
    toggleLayerVisibility,
    toggleLayerLock,
    moveLayer,
    renameLayer,
  } = useRegionStoreSelectors(useAssetRegionStore, asset.id);

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

  return (
    <OverlaySidePanel className="w-44" side="right">
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
    </OverlaySidePanel>
  );
}
