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

import { MediaCard } from '../media/MediaCard';
import { Button } from '@pixsim7/shared.ui';
import { useCuratorGalleryController } from '../../hooks/useCuratorGalleryController';
import type { GalleryAsset } from '../../lib/gallery/types';

export function CuratorGallerySurface() {
  const controller = useCuratorGalleryController();

  const selectedAssets: GalleryAsset[] = controller.selectedAssets as any;

  return (
    <div className="p-6 space-y-4 content-with-dock min-h-screen">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Asset Curator</h1>
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => controller.setViewMode('grid')}
            className={`px-2 py-1 rounded ${controller.viewMode === 'grid' ? 'bg-blue-500 text-white' : 'bg-neutral-200 dark:bg-neutral-700'}`}
          >
            dY"ı Grid
          </button>
          <button
            onClick={() => controller.setViewMode('list')}
            className={`px-2 py-1 rounded ${controller.viewMode === 'list' ? 'bg-blue-500 text-white' : 'bg-neutral-200 dark:bg-neutral-700'}`}
          >
            ƒ~ø List
          </button>
          <button
            onClick={() => controller.setViewMode('compact')}
            className={`px-2 py-1 rounded ${controller.viewMode === 'compact' ? 'bg-blue-500 text-white' : 'bg-neutral-200 dark:bg-neutral-700'}`}
          >
            ƒ-İ Compact
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
                dY"? Create Collection
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
                dY"? {name} ({assetIds.size})
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Advanced Filters */}
      <div className="bg-neutral-50 dark:bg-neutral-800 p-4 rounded border border-neutral-200 dark:border-neutral-700 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Advanced Filters</h3>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={controller.selectAll} className="text-xs">
              Select All ({controller.assets.length})
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input
            placeholder="Search..."
            className="px-2 py-1 text-sm border rounded"
            value={controller.filters.q || ''}
            onChange={(e) => controller.setFilters(prev => ({ ...prev, q: e.target.value }))}
          />
          <select
            className="px-2 py-1 text-sm border rounded"
            value={controller.filters.media_type || ''}
            onChange={(e) => controller.setFilters(prev => ({ ...prev, media_type: e.target.value || undefined }))}
          >
            <option value="">All Media Types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
            <option value="audio">Audio</option>
            <option value="3d_model">3D Models</option>
          </select>
          <select
            className="px-2 py-1 text-sm border rounded"
            value={controller.filters.sort || 'new'}
            onChange={(e) => controller.setFilters(prev => ({ ...prev, sort: e.target.value as any }))}
          >
            <option value="new">Newest</option>
            <option value="old">Oldest</option>
            <option value="alpha">Aƒ?"Z</option>
          </select>
          <input
            placeholder="Filter by tag..."
            className="px-2 py-1 text-sm border rounded"
            value={controller.filters.tag || ''}
            onChange={(e) => controller.setFilters(prev => ({ ...prev, tag: e.target.value || undefined }))}
          />
        </div>
      </div>

      {controller.error && <div className="text-red-600 text-sm">{controller.error}</div>}

      {/* Asset Grid/List */}
      <div className={
        controller.viewMode === 'grid'
          ? 'grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4'
          : controller.viewMode === 'list'
          ? 'space-y-2'
          : 'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2'
      }>
        {controller.assets.map(asset => {
          const isSelected = controller.selectedAssetIds.has(String(asset.id));

          return (
            <div
              key={asset.id}
              className={`relative cursor-pointer group ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
              onClick={() => controller.toggleAssetSelection(asset.id)}
            >
              {controller.viewMode === 'list' ? (
                <div className="flex items-center gap-3 p-2 bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700">
                  <div className="w-16 h-16 flex-shrink-0">
                    <MediaCard
                      id={asset.id}
                      mediaType={asset.media_type}
                      providerId={asset.provider_id}
                      providerAssetId={asset.provider_asset_id}
                      thumbUrl={asset.thumbnail_url}
                      remoteUrl={asset.remote_url}
                      width={asset.width}
                      height={asset.height}
                      durationSec={asset.duration_sec}
                      tags={asset.tags}
                      description={asset.description}
                      createdAt={asset.created_at}
                      status={asset.sync_status}
                      providerStatus={asset.provider_status}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{asset.id}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                      {asset.media_type} ƒ?› {asset.provider_id}
                    </div>
                    {asset.tags && asset.tags.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {asset.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="text-[10px] px-1 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <div className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center">
                      ƒo"
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <MediaCard
                    id={asset.id}
                    mediaType={asset.media_type}
                    providerId={asset.provider_id}
                    providerAssetId={asset.provider_asset_id}
                    thumbUrl={asset.thumbnail_url}
                    remoteUrl={asset.remote_url}
                    width={asset.width}
                    height={asset.height}
                    durationSec={asset.duration_sec}
                    tags={asset.tags}
                    description={asset.description}
                    createdAt={asset.created_at}
                    status={asset.sync_status}
                    providerStatus={asset.provider_status}
                  />
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center shadow-lg">
                      ƒo"
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Load More */}
      <div className="pt-4">
        {controller.hasMore && (
          <button
            disabled={controller.loading}
            onClick={controller.loadMore}
            className="border px-4 py-2 rounded"
          >
            {controller.loading ? 'Loading...' : 'Load More'}
          </button>
        )}
        {!controller.hasMore && <div className="text-sm text-neutral-500">No more assets</div>}
      </div>
    </div>
  );
}

