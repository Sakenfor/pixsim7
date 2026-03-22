import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';

import { Icon } from '@lib/icons';

import type { AssetModel } from '@features/assets';
import type { InputMaskLayer } from '@features/generation';

import { useMaskOverlayStore } from '@/components/media/viewer/overlays/builtins/maskOverlayStore';

import { MiniGalleryPopover } from '../MiniGalleryPopover';

interface MaskPickerProps {
  maskLayers: InputMaskLayer[] | undefined;
  /** Legacy single mask reference */
  maskUrl: string | undefined;
  onAddMaskLayer: (asset: AssetModel) => void;
  onRemoveMaskLayer: (layerId: string) => void;
  onToggleMaskLayer: (layerId: string) => void;
  onClearAllMasks: () => void;
  /** Whether mask_url param is in the provider's param specs */
  hasMaskParam: boolean;
  /** Current input asset ID (from input store) */
  sourceAssetId: number | null;
  disabled?: boolean;
}

/** Extract the numeric asset ID from an `asset:123` URL. */
function parseAssetIdFromUrl(url: string): number | null {
  const m = url.match(/^asset:(\d+)$/);
  return m ? Number(m[1]) : null;
}

export function MaskPicker({
  maskLayers,
  maskUrl,
  onAddMaskLayer,
  onRemoveMaskLayer,
  onToggleMaskLayer,
  onClearAllMasks,
  hasMaskParam,
  sourceAssetId,
  disabled,
}: MaskPickerProps) {
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [showAll, setShowAll] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const forceFullAlpha = useMaskOverlayStore((s) => s.forceFullAlpha);
  const setForceFullAlpha = useMaskOverlayStore((s) => s.setForceFullAlpha);

  const layers = useMemo(() => maskLayers ?? [], [maskLayers]);
  const visibleCount = layers.filter((l) => l.visible).length;
  const hasLayers = layers.length > 0;
  const hasLegacyMask = !hasLayers && !!maskUrl;
  const hasSelection = hasLayers || hasLegacyMask;

  // Build a set of asset IDs currently active in maskLayers (for toggle state).
  const activeAssetIds = useMemo(() => {
    const ids = new Set<number>();
    for (const layer of layers) {
      const id = parseAssetIdFromUrl(layer.assetUrl);
      if (id !== null) ids.add(id);
    }
    return ids;
  }, [layers]);

  const handleTogglePopover = useCallback(() => {
    if (anchorRect) {
      setAnchorRect(null);
    } else {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) setAnchorRect(rect);
    }
  }, [anchorRect]);

  const handleClose = useCallback(() => {
    setAnchorRect(null);
  }, []);

  // Toggle: if this asset is already in maskLayers, remove it; otherwise add it.
  const handleToggleAsset = useCallback(
    (asset: AssetModel) => {
      const existingLayer = layers.find((l) => parseAssetIdFromUrl(l.assetUrl) === asset.id);
      if (existingLayer) {
        onRemoveMaskLayer(existingLayer.id);
      } else {
        onAddMaskLayer(asset);
      }
      // Popover stays open — no setAnchorRect(null)
    },
    [layers, onAddMaskLayer, onRemoveMaskLayer],
  );

  // Show a checkmark overlay on masks that are already toggled on.
  const renderItemOverlay = useCallback(
    (asset: AssetModel): ReactNode => {
      if (!activeAssetIds.has(asset.id)) return null;
      return (
        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-accent flex items-center justify-center shadow-sm z-10">
          <Icon name="check" size={12} color="#fff" />
        </div>
      );
    },
    [activeAssetIds],
  );

  if (!hasMaskParam) return null;

  const isOpen = anchorRect !== null;

  const initialFilters = showAll || !sourceAssetId
    ? { media_type: 'image' as const, upload_method: 'mask_draw' as const, asset_kind: 'mask' as const, sort: 'new' as const }
    : { source_asset_id: sourceAssetId, media_type: 'image' as const, upload_method: 'mask_draw' as const, asset_kind: 'mask' as const, sort: 'new' as const };

  return (
    <div className="flex flex-col gap-1">
      {/* Header row: toggle button + clear all */}
      <div className="flex items-center gap-1.5">
        <button
          ref={buttonRef}
          type="button"
          onClick={handleTogglePopover}
          disabled={disabled}
          className={
            hasSelection
              ? 'flex items-center gap-1.5 px-2 py-1 rounded-lg bg-accent/15 border border-accent/30 text-accent text-[11px] font-medium hover:bg-accent/25 transition-colors disabled:opacity-50'
              : 'flex items-center gap-1.5 px-2 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 text-[11px] hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50'
          }
          title={hasSelection ? `${visibleCount} mask${visibleCount !== 1 ? 's' : ''} active` : 'Pick inpaint masks'}
        >
          <Icon name="paintbrush" size={11} />
          <span>{hasSelection ? `${visibleCount} Mask${visibleCount !== 1 ? 's' : ''}` : 'Masks'}</span>
          <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} size={9} className="ml-0.5 opacity-60" />
        </button>

        {hasSelection && (
          <button
            type="button"
            onClick={onClearAllMasks}
            disabled={disabled}
            className="p-0.5 rounded hover:bg-accent/30 text-accent hover:text-accent-hover transition-colors disabled:opacity-50"
            title="Remove all masks"
          >
            <Icon name="x" size={10} />
          </button>
        )}

        <button
          type="button"
          onClick={() => setForceFullAlpha(!forceFullAlpha)}
          className={`ml-auto px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
            forceFullAlpha
              ? 'bg-accent/15 text-accent border border-accent/30'
              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 border border-neutral-200 dark:border-neutral-700'
          }`}
          title={forceFullAlpha ? 'Full alpha ON: painted pixels export as pure white' : 'Full alpha OFF: preserving brush opacity in export'}
        >
          {forceFullAlpha ? 'Full \u03B1' : 'Raw \u03B1'}
        </button>
      </div>

      {/* Layer list (visibility toggles for already-added masks) */}
      {hasLayers && (
        <div className="flex flex-col gap-0.5 pl-1">
          {layers.map((layer) => {
            const assetId = parseAssetIdFromUrl(layer.assetUrl) ?? '?';
            return (
              <div
                key={layer.id}
                className="flex items-center gap-1 text-[10px] group"
              >
                <button
                  type="button"
                  onClick={() => onToggleMaskLayer(layer.id)}
                  disabled={disabled}
                  className={`flex-shrink-0 ${layer.visible ? 'text-accent' : 'text-neutral-400 opacity-50'}`}
                  title={layer.visible ? 'Hide' : 'Show'}
                >
                  <Icon name={layer.visible ? 'eye' : 'eyeOff'} size={10} />
                </button>
                <span className={`flex-1 truncate ${layer.visible ? 'text-neutral-600 dark:text-neutral-300' : 'text-neutral-400 line-through'}`}>
                  {layer.label || `#${assetId}`}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveMaskLayer(layer.id)}
                  disabled={disabled}
                  className="flex-shrink-0 text-neutral-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove"
                >
                  <Icon name="x" size={9} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Toggle-mode gallery popover — stays open, click to toggle masks on/off */}
      {isOpen && (
        <MiniGalleryPopover
          anchorRect={anchorRect}
          title={showAll || !sourceAssetId ? 'All Masks' : 'Asset Masks'}
          onClose={handleClose}
          width={340}
          height={380}
          galleryProps={{
            initialFilters,
            syncInitialFilters: true,
            showSearch: true,
            showMediaType: false,
            showSort: true,
            suppressHoverActions: true,
            onItemSelect: handleToggleAsset,
            renderItemOverlay,
            emptyMessage: sourceAssetId && !showAll ? 'No masks for this asset.' : 'No saved masks.',
            header: sourceAssetId ? (
              <div className="flex items-center justify-between px-3 py-1 border-b border-neutral-200 dark:border-neutral-700">
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                  {showAll ? 'Showing all masks' : 'Showing masks for this asset'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="text-[10px] text-accent hover:underline"
                >
                  {showAll ? 'Show linked' : 'Show all'}
                </button>
              </div>
            ) : undefined,
          }}
        />
      )}
    </div>
  );
}
