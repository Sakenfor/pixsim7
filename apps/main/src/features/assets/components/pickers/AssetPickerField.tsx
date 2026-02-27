/**
 * AssetPickerField
 *
 * Compound field component for picking a single asset. Displays the
 * currently-selected asset (thumbnail + label + clear button), and
 * provides trigger buttons for:
 *   - Gallery mode (opens floating gallery in selection mode)
 *   - Inline search (shows InlineAssetSearchPicker dropdown)
 *
 * Props let the consumer choose which modes are available.
 */

import { Image, Search, X } from 'lucide-react';
import { useCallback, useState } from 'react';

import { InlineAssetSearchPicker } from './InlineAssetSearchPicker';
import type { PickedAsset } from './types';
import { useGalleryAssetPicker } from './useGalleryAssetPicker';

export interface AssetPickerFieldProps {
  /** Currently selected asset. `null` / `undefined` = nothing selected. */
  value?: PickedAsset | null;
  /** Called when an asset is selected (via gallery or inline search). */
  onChange: (asset: PickedAsset | null) => void;
  /** Enable gallery-mode picking (default true). */
  enableGallery?: boolean;
  /** Enable inline search picking (default true). */
  enableInlineSearch?: boolean;
  /** Restrict inline search to these media types. */
  mediaTypes?: string[];
  /** Label text shown above the field. */
  label?: string;
  /** Additional CSS class on the root container. */
  className?: string;
}

export function AssetPickerField({
  value,
  onChange,
  enableGallery = true,
  enableInlineSearch = true,
  mediaTypes,
  label,
  className,
}: AssetPickerFieldProps) {
  const [showInlineSearch, setShowInlineSearch] = useState(false);
  const { pick, isActive: galleryActive } = useGalleryAssetPicker();

  const handleGalleryPick = useCallback(() => {
    pick((asset) => onChange(asset));
  }, [pick, onChange]);

  const handleInlineSelect = useCallback(
    (asset: PickedAsset) => {
      onChange(asset);
      setShowInlineSearch(false);
    },
    [onChange],
  );

  const handleClear = useCallback(() => {
    onChange(null);
    setShowInlineSearch(false);
  }, [onChange]);

  return (
    <div className={className}>
      {label && (
        <label className="block text-[10px] text-neutral-500 dark:text-neutral-400 mb-0.5">
          {label}
        </label>
      )}

      {/* Selected asset display */}
      {value ? (
        <div className="flex items-center gap-2 p-1.5 border border-neutral-200 dark:border-neutral-700 rounded bg-neutral-50 dark:bg-neutral-800/50">
          {/* Thumbnail */}
          {value.thumbnailUrl ? (
            <img
              src={value.thumbnailUrl}
              alt=""
              className="w-8 h-8 rounded object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center flex-shrink-0">
              <Image className="w-4 h-4 text-neutral-400" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs text-neutral-700 dark:text-neutral-200 truncate">
              {value.name || `Asset #${value.id}`}
            </div>
            <div className="text-[10px] text-neutral-400">{value.mediaType}</div>
          </div>
          <button
            onClick={handleClear}
            className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            title="Clear asset"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {/* Action buttons */}
          <div className="flex items-center gap-1.5">
            {enableGallery && (
              <button
                type="button"
                onClick={handleGalleryPick}
                disabled={galleryActive}
                className="text-[11px] px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
              >
                <Image className="w-3 h-3 inline mr-1" />
                Browse
              </button>
            )}
            {enableInlineSearch && !showInlineSearch && (
              <button
                type="button"
                onClick={() => setShowInlineSearch(true)}
                className="text-[11px] px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <Search className="w-3 h-3 inline mr-1" />
                Search
              </button>
            )}
          </div>

          {/* Inline search (expanded) */}
          {enableInlineSearch && showInlineSearch && (
            <InlineAssetSearchPicker
              onSelect={handleInlineSelect}
              onClear={() => setShowInlineSearch(false)}
              mediaTypes={mediaTypes}
            />
          )}
        </div>
      )}
    </div>
  );
}
