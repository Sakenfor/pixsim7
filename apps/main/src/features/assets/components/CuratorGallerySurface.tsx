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

import { MediaCard } from '@/components/media/MediaCard';
import { Button } from '@pixsim7/shared.ui';
import { useCuratorGalleryController } from '@features/gallery';
import {
  GalleryFilters,
  LoadMoreSection,
  AssetGrid,
  AssetCardWrapper,
  SelectionIndicator,
  mediaCardPropsFromAsset,
} from './shared';

export function CuratorGallerySurface() {
  const controller = useCuratorGalleryController();

  const gridPreset = controller.viewMode === 'compact' ? 'compact' : 'default';

  return (
    <div className="p-6 space-y-4 content-with-dock min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Asset Curator</h1>
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => controller.setViewMode('grid')}
            className={`px-2 py-1 rounded ${controller.viewMode === 'grid' ? 'bg-blue-500 text-white' : 'bg-neutral-200 dark:bg-neutral-700'}`}
          >
            Grid
          </button>
          <button
            onClick={() => controller.setViewMode('list')}
            className={`px-2 py-1 rounded ${controller.viewMode === 'list' ? 'bg-blue-500 text-white' : 'bg-neutral-200 dark:bg-neutral-700'}`}
          >
            List
          </button>
          <button
            onClick={() => controller.setViewMode('compact')}
            className={`px-2 py-1 rounded ${controller.viewMode === 'compact' ? 'bg-blue-500 text-white' : 'bg-neutral-200 dark:bg-neutral-700'}`}
          >
            Compact
          </button>
        </div>
      </div>

      {/* Selection Tools */}
      {controller.selectedAssetIds.size > 0 && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500 dark:border-blue-400 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                {controller.selectedAssetIds.size} asset{controller.selectedAssetIds.size !== 1 ? 's' : ''} selected
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-300">
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

      {/* Collections */}
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

      {/* Filters */}
      <div className="bg-neutral-50 dark:bg-neutral-800 p-4 rounded border border-neutral-200 dark:border-neutral-700 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Filters</h3>
          <Button variant="secondary" onClick={controller.selectAll} className="text-xs">
            Select All ({controller.assets.length})
          </Button>
        </div>

        <GalleryFilters
          filters={controller.filters}
          onFiltersChange={(updates) => controller.setFilters(prev => ({ ...prev, ...updates }))}
          showSearch
          showMediaType
          showSort
          extraSortOptions={[{ value: 'alpha', label: 'A→Z' }]}
          layout="grid"
        />
      </div>

      {controller.error && <div className="text-red-600 text-sm">{controller.error}</div>}

      {/* Asset Grid/List */}
      {controller.viewMode === 'list' ? (
        <div className="space-y-2">
          {controller.assets.map(asset => {
            const isSelected = controller.selectedAssetIds.has(String(asset.id));
            return (
              <div
                key={asset.id}
                className={`flex items-center gap-3 p-2 bg-white dark:bg-neutral-800 rounded border cursor-pointer ${
                  isSelected ? 'border-blue-500 ring-2 ring-blue-500' : 'border-neutral-200 dark:border-neutral-700'
                }`}
                onClick={() => controller.toggleAssetSelection(asset.id)}
              >
                <div className="w-16 h-16 flex-shrink-0">
                  <MediaCard
                    {...mediaCardPropsFromAsset(asset)}
                    contextMenuAsset={asset}
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
                  <div className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center">
                    ✓
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
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
                  {...mediaCardPropsFromAsset(asset)}
                  contextMenuAsset={asset}
                  contextMenuSelection={controller.selectedAssets}
                />
                {isSelected && <SelectionIndicator />}
              </AssetCardWrapper>
            );
          })}
        </AssetGrid>
      )}

      {/* Load More */}
      <LoadMoreSection
        hasMore={controller.hasMore}
        loading={controller.loading}
        onLoadMore={controller.loadMore}
        itemCount={controller.assets.length}
        mode="button"
      />
    </div>
  );
}
