/**
 * ViewerLayersPanel
 *
 * Unified right-side panel that shows all layer groups (mask, annotation, capture)
 * in one collapsible list. Replaces per-overlay right panels.
 *
 * Each group only renders when its data is non-empty or its overlay is active.
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import { Icon, type IconName } from '@lib/icons';
import { VersionNavigator, useVersions } from '@lib/ui/versioning';

import { type AssetModel } from '@features/assets';
import { MaskBrowserPopover } from '@features/generation/components/MaskBrowserPopover';
import {
  useAssetRegionStore,
  useCaptureRegionStore,
  type AssetRegion,
} from '@features/mediaViewer';

import { RegionList, RegionEditForm } from '../../panels/RegionEditForm';
import { useMaskOverlayStore, type MaskLayerInfo } from '../builtins/maskOverlayStore';
import { useRegionStoreSelectors } from '../index';

import { LayerPanel } from './LayerPanel';

// ============================================================================
// Collapsible Section
// ============================================================================

function LayerGroup({
  label,
  icon,
  count,
  defaultOpen = true,
  children,
}: {
  label: string;
  icon: IconName;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="flex flex-col">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] uppercase tracking-wider font-medium text-th-muted hover:text-th-secondary hover:bg-th/5 transition-colors"
      >
        <Icon name={icon} size={11} />
        <span className="flex-1 text-left">{label}</span>
        {count > 0 && <span className="text-[9px] tabular-nums">{count}</span>}
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={9} />
      </button>
      {open && <div className="px-1.5 pb-2">{children}</div>}
    </div>
  );
}

// ============================================================================
// Mask Layers Group
// ============================================================================

function MaskLayerGroup({
  sourceAssetId,
  sourceAssetIds,
}: {
  sourceAssetId: number | null;
  sourceAssetIds?: number[];
}) {
  const {
    layers,
    activeLayerId,
    addLayer: storeAddLayer,
    removeLayer: storeRemoveLayer,
    setActiveLayer,
    toggleLayerVisibility,
    renameLayer,
    importSavedMask,
  } = useMaskOverlayStore();

  const activeLayer = layers.find((l) => l.id === activeLayerId) ?? null;
  const [importAnchorRect, setImportAnchorRect] = useState<DOMRect | null>(null);
  const importButtonRef = useRef<HTMLButtonElement>(null);

  const handleToggleImport = useCallback(() => {
    if (importAnchorRect) {
      setImportAnchorRect(null);
    } else {
      const rect = importButtonRef.current?.getBoundingClientRect();
      if (rect) setImportAnchorRect(rect);
    }
  }, [importAnchorRect]);

  const setPreviewMaskUrl = useMaskOverlayStore((s) => s.setPreviewMaskUrl);

  const handleCloseImport = useCallback(() => {
    setImportAnchorRect(null);
    setPreviewMaskUrl(null);
  }, [setPreviewMaskUrl]);

  const handleMaskHover = useCallback((asset: AssetModel | null) => {
    if (!asset) {
      setPreviewMaskUrl(null);
      return;
    }
    const url = asset.previewUrl || asset.thumbnailUrl || asset.fileUrl;
    if (url) setPreviewMaskUrl(url);
  }, [setPreviewMaskUrl]);

  const handleSelectMask = useCallback((asset: AssetModel) => {
    setPreviewMaskUrl(null);
    importSavedMask(asset.id);
    setImportAnchorRect(null);
  }, [importSavedMask, setPreviewMaskUrl]);

  const renderLayerExtra = useCallback((layer: MaskLayerInfo) => {
    if (!layer.savedAssetId) return null;
    return (
      <LayerVersionNavigator
        assetId={layer.savedAssetId}
        onVersionSelect={(newAssetId) => importSavedMask(newAssetId, { targetLayerId: layer.id })}
      />
    );
  }, [importSavedMask]);

  if (layers.length === 0) return null;

  return (
    <LayerGroup label="Mask" icon="paintbrush" count={layers.length}>
      <LayerPanel
        layers={layers}
        activeLayerId={activeLayerId}
        onSelectLayer={setActiveLayer}
        onToggleVisibility={toggleLayerVisibility}
        onRenameLayer={renameLayer}
        onAddLayer={storeAddLayer}
        onRemoveLayer={storeRemoveLayer}
        renderLayerExtra={renderLayerExtra}
      />

      {/* Import saved masks */}
      <div className="mt-2 flex flex-col gap-1">
        {activeLayer && !activeLayer.hasContent && (
          <div className="text-[10px] text-th-muted leading-snug">
            Loads into active layer
          </div>
        )}
        <button
          ref={importButtonRef}
          type="button"
          onClick={handleToggleImport}
          className="w-full h-7 rounded bg-th/10 hover:bg-th/15 border border-th/10 text-[11px] text-th-secondary px-1.5 flex items-center gap-1.5"
          title={activeLayer && !activeLayer.hasContent ? 'Load into active layer' : 'Import as new layer'}
        >
          <Icon name="paintbrush" size={11} />
          <span className="flex-1 text-left truncate">Browse masks...</span>
          <Icon name={importAnchorRect ? 'chevronUp' : 'chevronDown'} size={9} className="opacity-60" />
        </button>

        {importAnchorRect && (
          <MaskBrowserPopover
            anchorRect={importAnchorRect}
            onClose={handleCloseImport}
            onItemSelect={handleSelectMask}
            sourceAssetId={sourceAssetId}
            sourceAssetIds={sourceAssetIds}
            onItemHover={handleMaskHover}
            width={320}
            height={360}
          />
        )}
      </div>
    </LayerGroup>
  );
}

// ============================================================================
// Annotation Layers Group
// ============================================================================

function AnnotationLayerGroup({ assetId }: { assetId: string | number }) {
  const {
    regions,
    layers,
    activeLayerId,
    selectedRegionId,
    addLayer,
    removeLayer,
    setActiveLayer,
    toggleLayerVisibility,
    toggleLayerLock,
    moveLayer,
    renameLayer,
    selectRegion,
  } = useRegionStoreSelectors(useAssetRegionStore, assetId);

  const layerInfos = useMemo(
    () => layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      locked: layer.locked,
      opacity: layer.opacity,
      hasContent: regions.some((region: AssetRegion) => region.layerId === layer.id),
    })),
    [layers, regions]
  );

  if (layers.length === 0) return null;

  return (
    <LayerGroup label="Annotations" icon="pencil" count={regions.length}>
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
      <div className="mt-1">
        <RegionList assetId={assetId} />
      </div>
      {selectedRegionId && (
        <div className="mt-1 border-t border-th/10 pt-1">
          <RegionEditForm
            assetId={assetId}
            regionId={selectedRegionId}
            onClose={() => selectRegion(null)}
          />
        </div>
      )}
    </LayerGroup>
  );
}

// ============================================================================
// Capture Layers Group
// ============================================================================

function CaptureLayerGroup({ assetId }: { assetId: string | number }) {
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
  } = useRegionStoreSelectors(useCaptureRegionStore, assetId);

  const layerInfos = useMemo(
    () => layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      locked: layer.locked,
      opacity: layer.opacity,
      hasContent: regions.some((region: AssetRegion) => region.layerId === layer.id),
    })),
    [layers, regions]
  );

  if (layers.length === 0) return null;

  return (
    <LayerGroup label="Capture" icon="camera" count={regions.length}>
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
    </LayerGroup>
  );
}

// ============================================================================
// Layer Version Navigator (mask-specific)
// ============================================================================

function LayerVersionNavigator({
  assetId,
  onVersionSelect,
}: {
  assetId: number;
  onVersionSelect: (assetId: number) => void;
}) {
  const { versions, loading } = useVersions('asset', assetId);

  if (loading || versions.length <= 1) return null;

  return (
    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      <VersionNavigator
        versions={versions}
        currentEntityId={assetId}
        onSelect={(v) => onVersionSelect(Number(v.entityId))}
        compact
      />
    </div>
  );
}

// ============================================================================
// Unified Panel
// ============================================================================

export interface ViewerLayersPanelProps {
  assetId: string | number;
  activeOverlayId: string | null;
  sourceAssetId: number | null;
  sourceAssetIds?: number[];
}

export function ViewerLayersPanel({
  assetId,
  activeOverlayId,
  sourceAssetId,
  sourceAssetIds,
}: ViewerLayersPanelProps) {
  const hasMaskLayers = useMaskOverlayStore((s) => s.layers.length > 0);
  const hasAnnotationLayers = useAssetRegionStore((s) => s.getLayers(assetId).length > 0);
  const hasCaptureRegions = useCaptureRegionStore((s) => s.getRegions(assetId).length > 0);

  const showMask = hasMaskLayers || activeOverlayId === 'mask';
  const showAnnotation = hasAnnotationLayers || activeOverlayId === 'annotate';
  const showCapture = hasCaptureRegions || activeOverlayId === 'capture';

  if (!showMask && !showAnnotation && !showCapture) return null;

  return (
    <div className="flex flex-col w-44 h-full flex-shrink-0 border-l border-th/10 bg-surface-secondary/95 text-xs select-none overflow-y-auto">
      {showMask && (
        <MaskLayerGroup
          sourceAssetId={sourceAssetId}
          sourceAssetIds={sourceAssetIds}
        />
      )}
      {showMask && showAnnotation && <div className="h-px bg-th/10 mx-1" />}
      {showAnnotation && <AnnotationLayerGroup assetId={assetId} />}
      {(showMask || showAnnotation) && showCapture && <div className="h-px bg-th/10 mx-1" />}
      {showCapture && <CaptureLayerGroup assetId={assetId} />}
    </div>
  );
}
