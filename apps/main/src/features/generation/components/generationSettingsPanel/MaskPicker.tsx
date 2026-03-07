import { useCallback, useMemo, useRef, useState } from 'react';

import { Icon } from '@lib/icons';

import { useAssets, type AssetModel } from '@features/assets';

import { DROPDOWN_MENU_CLS, DROPDOWN_ITEM_CLS, useClickOutside } from './constants';

interface MaskPickerProps {
  maskUrl: string | undefined;
  onMaskChange: (maskUrl: string | undefined) => void;
  /** Whether mask_url param is in the provider's param specs */
  hasMaskParam: boolean;
  /** Current input asset ID (from input store) */
  sourceAssetId: number | null;
  disabled?: boolean;
}

function parseMaskAssetId(maskUrl: string | undefined): number | null {
  if (!maskUrl) return null;
  const match = maskUrl.match(/^asset:(\d+)$/);
  return match ? Number(match[1]) : null;
}

function formatMaskLabel(mask: AssetModel): string {
  const created = Number.isFinite(Date.parse(mask.createdAt))
    ? new Date(mask.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
  return created ? `#${mask.id} \u2022 ${created}` : `#${mask.id}`;
}

export function MaskPicker({
  maskUrl,
  onMaskChange,
  hasMaskParam,
  sourceAssetId,
  disabled,
}: MaskPickerProps) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, () => setOpen(false));

  const selectedMaskId = parseMaskAssetId(maskUrl);

  // Masks linked to the current source asset (uses -1 guard when no source)
  const linkedQuery = useAssets({
    limit: 50,
    filters: {
      source_asset_id: sourceAssetId ?? -1,
      media_type: 'image',
      upload_method: 'mask_draw',
      sort: 'new',
    },
  });

  // All recent masks
  const allQuery = useAssets({
    limit: 50,
    filters: {
      media_type: 'image',
      upload_method: 'mask_draw',
      sort: 'new',
    },
  });

  const linkedMasks = useMemo(() => {
    if (!sourceAssetId) return [];
    return [...linkedQuery.items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [sourceAssetId, linkedQuery.items]);

  const allMasks = useMemo(() => {
    return [...allQuery.items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [allQuery.items]);

  const displayMasks = showAll || !sourceAssetId ? allMasks : linkedMasks;
  const loading = showAll || !sourceAssetId ? allQuery.loading : linkedQuery.loading;

  const handleSelect = useCallback(
    (mask: AssetModel) => {
      onMaskChange(`asset:${mask.id}`);
      setOpen(false);
    },
    [onMaskChange],
  );

  const handleClear = useCallback(() => {
    onMaskChange(undefined);
    setOpen(false);
  }, [onMaskChange]);

  if (!hasMaskParam) return null;

  const hasSelection = !!maskUrl;

  return (
    <div ref={ref} className="relative flex items-center gap-1.5">
      {/* Mask picker button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className={
          hasSelection
            ? 'flex items-center gap-1.5 px-2 py-1 rounded-lg bg-accent/15 border border-accent/30 text-accent text-[11px] font-medium hover:bg-accent/25 transition-colors disabled:opacity-50'
            : 'flex items-center gap-1.5 px-2 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 text-[11px] hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50'
        }
        title={hasSelection ? `Mask: ${maskUrl}` : 'Select inpaint mask'}
      >
        <Icon name="paintbrush" size={11} />
        <span>{hasSelection ? `Mask #${selectedMaskId ?? '?'}` : 'Mask'}</span>
        <Icon name="chevronDown" size={9} className="ml-0.5 opacity-60" />
      </button>

      {/* Clear button when mask is attached */}
      {hasSelection && (
        <button
          type="button"
          onClick={handleClear}
          disabled={disabled}
          className="p-0.5 rounded hover:bg-accent/30 text-accent hover:text-accent-hover transition-colors disabled:opacity-50"
          title="Remove mask"
        >
          <Icon name="x" size={10} />
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div className={DROPDOWN_MENU_CLS} style={{ minWidth: 200 }}>
          {/* Header with toggle */}
          {sourceAssetId && (
            <div className="flex items-center justify-between px-3 py-1 border-b border-neutral-200 dark:border-neutral-700">
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                {showAll ? 'All masks' : 'Asset masks'}
              </span>
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="text-[10px] text-accent hover:underline"
              >
                {showAll ? 'Show linked' : 'Show all'}
              </button>
            </div>
          )}

          {/* Clear option */}
          {hasSelection && (
            <button
              type="button"
              onClick={handleClear}
              className={DROPDOWN_ITEM_CLS + ' text-red-500 dark:text-red-400'}
            >
              <Icon name="x" size={10} />
              Remove mask
            </button>
          )}

          {/* Loading state */}
          {loading && (
            <div className="px-3 py-2 text-[10px] text-neutral-400">Loading masks...</div>
          )}

          {/* Mask list */}
          {!loading && displayMasks.length === 0 && (
            <div className="px-3 py-2 text-[10px] text-neutral-400">
              {sourceAssetId && !showAll ? 'No masks for this asset' : 'No saved masks'}
            </div>
          )}

          {displayMasks.map((mask) => (
            <button
              key={mask.id}
              type="button"
              onClick={() => handleSelect(mask)}
              className={
                DROPDOWN_ITEM_CLS +
                (selectedMaskId === mask.id ? ' font-semibold bg-accent/10' : '')
              }
            >
              <Icon name="paintbrush" size={10} className="shrink-0 text-neutral-400" />
              <span className="truncate">{formatMaskLabel(mask)}</span>
              {selectedMaskId === mask.id && (
                <Icon name="check" size={10} className="ml-auto text-accent shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
