/**
 * Curator Gallery Surface
 *
 * Advanced curation view for power users with enhanced organization tools.
 * Features:
 * - Metadata editing
 * - Collection building
 * - Bulk operations
 * - Advanced filtering
 */

import { Button } from '@pixsim7/shared.ui';
import { useMemo } from 'react';

import { GalleryToolsPanel, useCuratorGalleryController } from '@features/gallery';

import { MediaCard } from '@/components/media/MediaCard';

import { toggleFavoriteTag } from '../lib/favoriteTag';

import {
  GallerySurfaceShell,
  AssetGrid,
  AssetCardWrapper,
  SelectionIndicator,
} from './shared';

export function CuratorGallerySurface() {
  const controller = useCuratorGalleryController();

  const gridPreset = controller.viewMode === 'compact' ? 'compact' : 'default';

  const galleryContext = useMemo(
    () => ({
      assets: controller.assets,
      selectedAssets: controller.selectedAssets,
      filters: controller.filters,
      refresh: controller.refresh,
      updateFilters: (updates: Partial<typeof controller.filters>) =>
        controller.setFilters((prev) => ({ ...prev, ...updates })),
      isSelectionMode: false,
    }),
    [
      controller.assets,
      controller.selectedAssets,
      controller.filters,
      controller.refresh,
      controller.setFilters,
    ]
  );

  // View mode toggle buttons
  const headerActions = (
    <div className="flex items-center gap-2 text-xs">
      <button
        onClick={() => controller.setViewMode('grid')}
        className={`px-2 py-1 rounded ${controller.viewMode === 'grid' ? 'bg-accent text-accent-text' : 'bg-neutral-200 dark:bg-neutral-700'}`}
      >
        Grid
      </button>
      <button
        onClick={() => controller.setViewMode('list')}
        className={`px-2 py-1 rounded ${controller.viewMode === 'list' ? 'bg-accent text-accent-text' : 'bg-neutral-200 dark:bg-neutral-700'}`}
      >
        List
      </button>
      <button
        onClick={() => controller.setViewMode('compact')}
        className={`px-2 py-1 rounded ${controller.viewMode === 'compact' ? 'bg-accent text-accent-text' : 'bg-neutral-200 dark:bg-neutral-700'}`}
      >
        Compact
      </button>
    </div>
  );

  // Selection tools panel
  const selectionSummary =
    controller.selectedAssetIds.size > 0 || controller.collections.size > 0 ? (
      <div className="space-y-4">
        {controller.selectedAssetIds.size > 0 && (
          <div className="p-4 bg-accent-subtle border-2 border-accent rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
                  {controller.selectedAssetIds.size} asset{controller.selectedAssetIds.size !== 1 ? 's' : ''} selected
                </h3>
                <p className="text-sm text-neutral-700 dark:text-neutral-300">
                  Use bulk operations or create a collection
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  onClick={() => controller.addCollection(prompt('Collection name:') ?? null)}
                  className="text-xs"
                >
                  Create Collection
                </Button>
                <Button variant="secondary" onClick={controller.clearSelection} className="text-xs">
                  Clear
                </Button>
              </div>
            </div>
          </div>
        )}

        {controller.selectedAssetIds.size > 0 && (
          <GalleryToolsPanel context={galleryContext} surfaceId="assets-curator" />
        )}

        {controller.collections.size > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Collections</h3>
            <div className="flex flex-wrap gap-2">
              {Array.from(controller.collections.entries()).map(([name, assetIds]) => (
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
            onClick={() => controller.toggleAssetSelection(asset.id)}
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
            onClick={() => controller.toggleAssetSelection(asset.id)}
          >
            <MediaCard
              asset={asset}
              onToggleFavorite={() => toggleFavoriteTag(asset)}
              contextMenuSelection={controller.selectedAssets}
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
      onFiltersChange={(updates) => controller.setFilters(prev => ({ ...prev, ...updates }))}
      showSearch
      showMediaType
      showSort
      extraSortOptions={[{ value: 'alpha', label: 'A→Z' }]}
      filtersLayout="grid"
      filtersHeader={<h3 className="text-sm font-semibold">Filters</h3>}
      filtersActions={
        <Button variant="secondary" onClick={controller.selectAll} className="text-xs">
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
      {controller.viewMode === 'list' ? listView : gridView}
    </GallerySurfaceShell>
  );
}
