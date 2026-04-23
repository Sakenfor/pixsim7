/**
 * MaskBrowserPopover — shared mask browsing popover used by both
 * the generation-side MaskPicker and the viewer-side MaskLayerGroup.
 *
 * Encapsulates the common filter logic, "show linked / show all" toggle,
 * and MiniGalleryPopover wiring.
 */
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import type { AssetModel } from '@features/assets';

import { MiniGalleryPopover } from './MiniGalleryPopover';

export interface MaskBrowserPopoverProps {
  anchorRect: DOMRect;
  onClose: () => void;
  onItemSelect: (asset: AssetModel) => void;
  sourceAssetId: number | null;
  /** Optional equivalent source IDs (version/local/library variants). */
  sourceAssetIds?: number[];
  /** Called when hovering over a mask (e.g. for live preview). */
  onItemHover?: (asset: AssetModel | null) => void;
  /** Custom overlay rendered on each card (e.g. checkmark for active masks). */
  renderItemOverlay?: (asset: AssetModel) => ReactNode;
  /** Title override. Defaults to "All Masks" / "Asset Masks". */
  title?: string;
  /** Popover width (default 340). */
  width?: number;
  /** Popover height (default 380). */
  height?: number;
}

export function MaskBrowserPopover({
  anchorRect,
  onClose,
  onItemSelect,
  sourceAssetId,
  sourceAssetIds,
  onItemHover,
  renderItemOverlay,
  title,
  width = 340,
  height = 380,
}: MaskBrowserPopoverProps) {
  const linkedSourceIds = useMemo(() => {
    const ids: number[] = [];
    const pushId = (value: unknown) => {
      const num = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(num) || num <= 0) return;
      if (!ids.includes(num)) ids.push(num);
    };
    pushId(sourceAssetId);
    sourceAssetIds?.forEach(pushId);
    return ids;
  }, [sourceAssetId, sourceAssetIds]);

  const [showAll, setShowAll] = useState(linkedSourceIds.length === 0);

  const initialFilters = useMemo(() => {
    const base = {
      media_type: 'image' as const,
      upload_method: 'mask_draw' as const,
      asset_kind: 'mask' as const,
      sort: 'new' as const,
    };
    if (!showAll && linkedSourceIds.length > 0) {
      return {
        ...base,
        source_asset_id: linkedSourceIds[0],
        source_asset_ids: linkedSourceIds,
      };
    }
    return base;
  }, [showAll, linkedSourceIds]);

  const resolvedTitle = title
    ?? (showAll || linkedSourceIds.length === 0 ? 'All Masks' : 'Asset Masks');

  return (
    <MiniGalleryPopover
      anchorRect={anchorRect}
      title={resolvedTitle}
      onClose={onClose}
      width={width}
      height={height}
      galleryProps={{
        initialFilters,
        syncInitialFilters: true,
        showSearch: true,
        showMediaType: false,
        showSort: true,
        suppressHoverActions: true,
        onItemSelect,
        onItemHover,
        renderItemOverlay,
        emptyMessage: linkedSourceIds.length > 0 && !showAll
          ? 'No masks for this asset.'
          : 'No saved masks.',
        header: linkedSourceIds.length > 0 ? (
          <div className="flex items-center justify-between px-3 py-1 border-b border-neutral-200 dark:border-neutral-700">
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
              {showAll ? 'All masks' : 'Linked to this asset'}
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
  );
}
