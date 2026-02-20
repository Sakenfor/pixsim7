/**
 * Curator Gallery Surface (Presentational)
 *
 * Advanced curation view for power users with enhanced organization tools.
 * Receives controller from RemoteGallerySource — no own data fetching.
 *
 * Features:
 * - Metadata editing
 * - Collection building
 * - Bulk operations
 * - Advanced filtering
 */

import { Button } from '@pixsim7/shared.ui';
import { useCallback, useMemo, useState } from 'react';

import { GalleryToolsPanel } from '@features/gallery';
import type { GalleryToolContext } from '@features/gallery/lib/core/types';

import { MediaCard } from '@/components/media/MediaCard';

import type { AssetModel } from '../hooks/useAssets';
import type { AssetsController } from '../hooks/useAssetsController';
import { toggleFavoriteTag } from '../lib/favoriteTag';

import {
  GallerySurfaceShell,
  AssetGrid,
  AssetCardWrapper,
  SelectionIndicator,
} from './shared';


export interface CuratorSurfaceContentProps {
  controller: AssetsController;
}

export function CuratorSurfaceContent({ controller }: CuratorSurfaceContentProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'compact'>('grid');
  const [collections] = useState<Map<string, Set<string>>>(new Map());

  const gridPreset = viewMode === 'compact' ? 'compact' : 'default';

  // Convert selected IDs to asset array
  const selectedAssets = useMemo(() => {
    return controller.assets.filter((a) => controller.selectedAssetIds.has(String(a.id)));
  }, [controller.assets, controller.selectedAssetIds]);

  const resetAssets = useCallback(() => {
    controller.reset();
  }, [controller]);

  const galleryContext: GalleryToolContext = useMemo(
    () => ({
      assets: controller.assets,
      selectedAssets,
      filters: controller.filters,
      refresh: resetAssets,
      updateFilters: (updates: Partial<typeof controller.filters>) =>
        controller.setFilters({ ...updates }),
      isSelectionMode: false,
    }),
    [
      controller.assets,
      selectedAssets,
      controller.filters,
      controller.setFilters,
      resetAssets,
    ]
  );

  const handleSelectAll = useCallback(() => {
    controller.selectAll(controller.assets);
  }, [controller]);

  const toggleAssetSelection = useCallback((asset: AssetModel) => {
    controller.toggleAssetSelection(asset);
  }, [controller]);

  // View mode toggle buttons
  const headerActions = (
    <div className="flex items-center gap-2 text-xs">
      <button
        onClick={() => setViewMode('grid')}
        className={`px-2 py-1 rounded ${viewMode === 'grid' ? 'bg-accent text-accent-text' : 'bg-neutral-200 dark:bg-neutral-700'}`}
      >
        Grid
      </button>
      <button
        onClick={() => setViewMode('list')}
        className={`px-2 py-1 rounded ${viewMode === 'list' ? 'bg-accent text-accent-text' : 'bg-neutral-200 dark:bg-neutral-700'}`}
      >
        List
      </button>
      <button
        onClick={() => setViewMode('compact')}
        className={`px-2 py-1 rounded ${viewMode === 'compact' ? 'bg-accent text-accent-text' : 'bg-neutral-200 dark:bg-neutral-700'}`}
      >
        Compact
      </button>
    </div>
  );

  // Selection tools panel
  const selectionSummary =
    controller.selectedAssetIds.size > 0 || collections.size > 0 ? (
      <div className="space-y-4">
        {controller.selectedAssetIds.size > 0 && (
          <GalleryToolsPanel context={galleryContext} surfaceId="assets-curator" />
        )}

        {collections.size > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Collections</h3>
            <div className="flex flex-wrap gap-2">
              {Array.from(collections.entries()).map(([name, assetIds]) => (
                <div
                  key={name}
                  className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded border border-purple-300 dark:border-purple-700 text-xs"
                >
                  {name} ({assetIds.size})
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    ) : null;

  // Render list view
  const listView = (
    <div className="space-y-2">
      {controller.assets.map(asset => {
        const isSelected = controller.selectedAssetIds.has(String(asset.id));
        return (
          <div
            key={asset.id}
            className={`flex items-center gap-3 p-2 bg-white dark:bg-neutral-800 rounded border cursor-pointer ${
              isSelected ? 'border-accent ring-2 ring-accent' : 'border-neutral-200 dark:border-neutral-700'
            }`}
            onClick={() => toggleAssetSelection(asset)}
          >
            <div className="w-16 h-16 flex-shrink-0">
              <MediaCard
                asset={asset}
                onToggleFavorite={() => toggleFavoriteTag(asset)}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{asset.id}</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                {asset.mediaType} › {asset.providerId}
              </div>
              {asset.tags && asset.tags.length > 0 && (
                <div className="flex gap-1 mt-1">
                  {asset.tags.slice(0, 3).map(tag => (
                    <span key={tag.slug} className="text-[10px] px-1 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded">
                      {tag.displayName || tag.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {isSelected && (
              <div className="flex-shrink-0 w-6 h-6 bg-accent text-accent-text rounded-full flex items-center justify-center">
                ✓
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // Render grid view
  const gridView = (
    <AssetGrid preset={gridPreset}>
      {controller.assets.map(asset => {
        const isSelected = controller.selectedAssetIds.has(String(asset.id));
        return (
          <AssetCardWrapper
            key={asset.id}
            isSelected={isSelected}
            onClick={() => toggleAssetSelection(asset)}
          >
            <MediaCard
              asset={asset}
              onToggleFavorite={() => toggleFavoriteTag(asset)}
              contextMenuSelection={selectedAssets}
            />
            {isSelected && <SelectionIndicator />}
          </AssetCardWrapper>
        );
      })}
    </AssetGrid>
  );

  return (
    <GallerySurfaceShell
      title="Asset Curator"
      headerActions={headerActions}
      filters={controller.filters}
      onFiltersChange={(updates) => controller.setFilters({ ...updates })}
      showSearch
      showMediaType
      showSort
      extraSortOptions={[{ value: 'alpha', label: 'A→Z' }]}
      filtersLayout="grid"
      filtersHeader={undefined}
      filtersActions={
        <Button variant="secondary" onClick={handleSelectAll} className="text-xs">
          Select All ({controller.assets.length})
        </Button>
      }
      selectionSummary={selectionSummary}
      error={controller.error}
      loading={controller.loading}
      hasMore={controller.hasMore}
      onLoadMore={controller.loadMore}
      itemCount={controller.assets.length}
      loadMoreMode="button"
    >
      {viewMode === 'list' ? listView : gridView}
    </GallerySurfaceShell>
  );
}
