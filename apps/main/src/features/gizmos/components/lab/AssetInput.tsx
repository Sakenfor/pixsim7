/**
 * Asset Input
 *
 * Compact asset picker for the Gizmo Playground.
 * Shows a search field + dropdown of matching assets using CompactAssetCard.
 */

import { Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { listAssets } from '@lib/api/assets';

import { fromAssetResponses, getAssetDisplayUrls, type AssetModel } from '@features/assets';
import { CompactAssetCard } from '@features/assets/components/shared/CompactAssetCard';

import { useGizmoLabStore } from '../../stores/gizmoLabStore';

export function AssetInput() {
  const assetId = useGizmoLabStore((s) => s.assetId);
  const setAsset = useGizmoLabStore((s) => s.setAsset);
  const clearAsset = useGizmoLabStore((s) => s.clearAsset);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AssetModel[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetModel | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Close dropdown when clicking outside
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
          filters: { media_type: 'image' },
          limit: 12,
        });
        setResults(fromAssetResponses(response.assets));
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(searchTimerRef.current);
  }, [query, isOpen]);

  const handleSelect = useCallback((asset: AssetModel) => {
    const urls = getAssetDisplayUrls(asset);
    const url = urls.mainUrl || urls.previewUrl || urls.thumbnailUrl;
    if (url) {
      setAsset(asset.id, url);
      setSelectedAsset(asset);
    }
    setIsOpen(false);
    setQuery('');
  }, [setAsset]);

  const handleClear = useCallback(() => {
    clearAsset();
    setSelectedAsset(null);
  }, [clearAsset]);

  // Show selected asset card when we have one
  if (selectedAsset && assetId) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-16 h-16 flex-shrink-0">
          <CompactAssetCard
            asset={selectedAsset}
            hideFooter
            fillHeight
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
            Asset #{selectedAsset.id}
          </div>
        </div>
        <button
          onClick={handleClear}
          className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
          title="Clear asset"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Show search input
  return (
    <div ref={containerRef} className="relative">
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
          placeholder="Search assets..."
          className="flex-1 text-sm bg-transparent outline-none placeholder-neutral-400"
        />
        {isLoading && (
          <div className="w-3 h-3 border-2 border-neutral-300 border-t-blue-500 rounded-full animate-spin" />
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg">
          <div className="grid grid-cols-3 gap-1 p-1">
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
          No images found
        </div>
      )}
    </div>
  );
}
