/**
 * InlineAssetSearchPicker
 *
 * Reusable inline asset search dropdown.
 * Shows a text search field and a dropdown grid of matching assets
 * rendered with `CompactAssetCard`.
 *
 * Extracted from Gizmo `AssetInput` so any feature can reuse the same
 * search + dropdown pattern.
 */

import { Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { listAssets } from '@lib/api/assets';

import { fromAssetResponses, getAssetDisplayUrls, type AssetModel } from '@features/assets';

import { CompactAssetCard } from '../shared/CompactAssetCard';

import type { PickedAsset } from './types';

export interface InlineAssetSearchPickerProps {
  /** Currently selected asset (shown as a compact card with clear button). */
  value?: PickedAsset | null;
  /** Called when the user picks an asset from the dropdown. */
  onSelect: (asset: PickedAsset) => void;
  /** Called when the user clears the selected asset. */
  onClear?: () => void;
  /** Restrict search to these media types (default `['image', 'video']`). */
  mediaTypes?: string[];
  /** Max results to show (default 12). */
  limit?: number;
  /** Search input placeholder text. */
  placeholder?: string;
  /** Additional CSS class on the root container. */
  className?: string;
  /** Number of grid columns in the dropdown (default 3). */
  columns?: number;
}

function assetModelToPickedAsset(asset: AssetModel): PickedAsset {
  const urls = getAssetDisplayUrls(asset);
  const url =
    asset.mediaType === 'video'
      ? urls.previewUrl || urls.thumbnailUrl || urls.mainUrl
      : urls.mainUrl || urls.previewUrl || urls.thumbnailUrl;
  return {
    id: asset.id,
    mediaType: asset.mediaType,
    thumbnailUrl: urls.thumbnailUrl,
    url: url ?? undefined,
    name: asset.description || `Asset ${asset.id}`,
  };
}

export function InlineAssetSearchPicker({
  value,
  onSelect,
  onClear,
  mediaTypes = ['image', 'video'],
  limit = 12,
  placeholder = 'Search assets...',
  className,
  columns = 3,
}: InlineAssetSearchPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AssetModel[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    if (!query.trim() && !isOpen) return;

    searchTimerRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await listAssets({
          q: query || undefined,
          filters: { media_type: mediaTypes },
          limit,
        });
        setResults(fromAssetResponses(response.assets));
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(searchTimerRef.current);
  }, [query, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = useCallback(
    (asset: AssetModel) => {
      onSelect(assetModelToPickedAsset(asset));
      setIsOpen(false);
      setQuery('');
    },
    [onSelect],
  );

  // Selected-asset display
  if (value) {
    return (
      <div className={`flex items-center gap-2 ${className ?? ''}`}>
        <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate flex-1 min-w-0">
          {value.name || `Asset #${value.id}`}
        </div>
        {onClear && (
          <button
            onClick={onClear}
            className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            title="Clear asset"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  // Search input + dropdown
  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <div className="flex items-center gap-2 border border-neutral-300 dark:border-neutral-600 rounded px-2 py-1.5 bg-white dark:bg-neutral-800">
        <Search className="w-4 h-4 text-neutral-400 flex-shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="flex-1 text-sm bg-transparent outline-none placeholder-neutral-400"
        />
        {isLoading && (
          <div className="w-3 h-3 border-2 border-neutral-300 border-t-blue-500 rounded-full animate-spin" />
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg">
          <div
            className="gap-1 p-1"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            }}
          >
            {results.map((asset) => (
              <div key={asset.id} className="cursor-pointer">
                <CompactAssetCard
                  asset={asset}
                  hideFooter
                  fillHeight
                  onClick={() => handleSelect(asset)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {isOpen && !isLoading && results.length === 0 && query.trim() && (
        <div className="absolute z-50 left-0 right-0 mt-1 py-3 text-center text-xs text-neutral-400 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg">
          No assets found
        </div>
      )}
    </div>
  );
}
