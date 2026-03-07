import { useCallback, useRef, useState } from 'react';

import { Icon } from '@lib/icons';

import type { AssetModel } from '@features/assets';
import type { InputMaskLayer } from '@features/generation';

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

  const layers = maskLayers ?? [];
  const visibleCount = layers.filter((l) => l.visible).length;
  const hasLayers = layers.length > 0;
  // Legacy: show if old maskUrl is set but no layers
  const hasLegacyMask = !hasLayers && !!maskUrl;
  const hasSelection = hasLayers || hasLegacyMask;

  const handleToggle = useCallback(() => {
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

  const handleSelect = useCallback(
    (asset: AssetModel) => {
      onAddMaskLayer(asset);
      setAnchorRect(null);
    },
    [onAddMaskLayer],
  );

  if (!hasMaskParam) return null;

  const isOpen = anchorRect !== null;

  const initialFilters = showAll || !sourceAssetId
    ? { media_type: 'image' as const, upload_method: 'mask_draw' as const, sort: 'new' as const }
    : { source_asset_id: sourceAssetId, media_type: 'image' as const, upload_method: 'mask_draw' as const, sort: 'new' as const };

  return (
    <div className="flex flex-col gap-1">
      {/* Header row: add button + clear all */}
      <div className="flex items-center gap-1.5">
        <button
          ref={buttonRef}
          type="button"
          onClick={handleToggle}
          disabled={disabled}
          className={
            hasSelection
              ? 'flex items-center gap-1.5 px-2 py-1 rounded-lg bg-accent/15 border border-accent/30 text-accent text-[11px] font-medium hover:bg-accent/25 transition-colors disabled:opacity-50'
              : 'flex items-center gap-1.5 px-2 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 text-[11px] hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50'
          }
          title={hasSelection ? `${visibleCount} mask${visibleCount !== 1 ? 's' : ''} active` : 'Add inpaint mask'}
        >
          <Icon name="paintbrush" size={11} />
          <span>{hasSelection ? `${layers.length} Mask${layers.length !== 1 ? 's' : ''}` : 'Mask'}</span>
          <Icon name="plus" size={9} className="ml-0.5 opacity-60" />
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
      </div>

      {/* Layer list */}
      {hasLayers && (
        <div className="flex flex-col gap-0.5 pl-1">
          {layers.map((layer) => {
            const assetId = layer.assetUrl.match(/^asset:(\d+)$/)?.[1] ?? '?';
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

      {/* Mini gallery popover */}
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
            onItemSelect: handleSelect,
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
