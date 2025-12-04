import { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useProviders } from '@/hooks/useProviders';
import { useAssetsController } from '@/hooks/useAssetsController';
import { MediaCard } from '../media/MediaCard';
import { MasonryGrid } from '../layout/MasonryGrid';
import { GalleryToolsPanel } from '../gallery/panels/GalleryToolsPanel';
import { Button } from '@pixsim7/shared.ui';
import { ThemedIcon } from '@/lib/icons';
import type { GalleryToolContext, GalleryAsset } from '@/lib/gallery/types';

const SCOPE_TABS = [
  { id: 'all', label: 'All' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'mine', label: 'Mine' },
  { id: 'recent', label: 'Recent' },
];

interface RemoteGallerySourceProps {
  layout: 'masonry' | 'grid';
  cardSize: number;
}

export function RemoteGallerySource({ layout, cardSize }: RemoteGallerySourceProps) {
  const controller = useAssetsController();
  const { providers } = useProviders();
  const location = useLocation();

  // Layout settings (gaps)
  const [layoutSettings, setLayoutSettings] = useState({ rowGap: 16, columnGap: 16 });
  const [showLayoutSettings, setShowLayoutSettings] = useState(false);
  const [showToolsPanel, setShowToolsPanel] = useState(false);

  // Infinite scroll sentinel ref
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Store controller in ref so observer always has latest values
  const controllerRef = useRef(controller);
  controllerRef.current = controller;

  // Infinite scroll: auto-load more when sentinel comes into view
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      console.log('[InfiniteScroll] No sentinel element');
      return;
    }

    console.log('[InfiniteScroll] Setting up observer');

    const observer = new IntersectionObserver(
      (entries) => {
        const ctrl = controllerRef.current;
        console.log('[InfiniteScroll] Intersection event:', {
          isIntersecting: entries[0].isIntersecting,
          hasMore: ctrl.hasMore,
          loading: ctrl.loading,
        });
        if (entries[0].isIntersecting && ctrl.hasMore && !ctrl.loading) {
          console.log('[InfiniteScroll] Triggering loadMore()');
          ctrl.loadMore();
        }
      },
      {
        rootMargin: '200px', // Start loading 200px before reaching the sentinel
        threshold: 0.1
      }
    );

    observer.observe(sentinel);

    return () => {
      console.log('[InfiniteScroll] Cleaning up observer');
      observer.disconnect();
    };
  }, []); // Empty deps OK - uses ref for latest controller values

  // Convert selected IDs to GalleryAsset objects
  const selectedAssets: GalleryAsset[] = useMemo(() => {
    return controller.assets.filter((a) => controller.selectedAssetIds.has(String(a.id)));
  }, [controller.assets, controller.selectedAssetIds]);

  // Gallery tool context
  const galleryContext: GalleryToolContext = useMemo(
    () => ({
      assets: controller.assets,
      selectedAssets,
      filters: controller.filters,
      refresh: () => {
        window.location.reload();
      },
      updateFilters: controller.setFilters,
      isSelectionMode: controller.isSelectionMode,
    }),
    [controller.assets, selectedAssets, controller.filters, controller.setFilters, controller.isSelectionMode]
  );

  // Handle asset selection for gallery tools
  const toggleAssetSelection = (assetId: number | string) => {
    const idStr = String(assetId);
    controller.toggleAssetSelection(idStr);

    const newSelection = new Set(controller.selectedAssetIds);
    if (newSelection.has(idStr)) {
      newSelection.add(idStr);
    } else {
      newSelection.delete(idStr);
    }
    if (newSelection.size > 0 && !showToolsPanel) {
      setShowToolsPanel(true);
    }
  };

  // Render cards
  const cardItems = controller.assets.map((a) => {
    const isSelected = controller.selectedAssetIds.has(String(a.id));

    if (controller.isSelectionMode) {
      return (
        <div key={a.id} className="relative group rounded-md">
          <div className="opacity-75 group-hover:opacity-100 transition-opacity">
            <MediaCard
              id={a.id}
              mediaType={a.media_type}
              providerId={a.provider_id}
              providerAssetId={a.provider_asset_id}
              thumbUrl={a.thumbnail_url}
              remoteUrl={a.remote_url}
              width={a.width}
              height={a.height}
              durationSec={a.duration_sec}
              tags={a.tags}
              description={a.description}
              createdAt={a.created_at}
              status={a.sync_status}
              providerStatus={a.provider_status}
              onOpen={undefined}
              actions={controller.getAssetActions(a)}
            />
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Button
              variant="primary"
              onClick={() => controller.selectAsset(a)}
              className="pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity shadow-lg flex items-center gap-1"
            >
              <ThemedIcon name="check" size={14} variant="default" />
              Select Asset
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={a.id}
        className={`relative cursor-pointer group rounded-md ${
          isSelected ? 'ring-4 ring-purple-500' : ''
        }`}
        onClick={(e) => {
          if (e.ctrlKey || e.metaKey || e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            toggleAssetSelection(a.id);
          }
        }}
      >
        {(() => {
          const baseActions = controller.getAssetActions(a);
          const filterProviderId = controller.filters.provider_id || undefined;

          const actions = {
            ...baseActions,
            onReupload: async () => {
              let targetProviderId = filterProviderId;

              if (!targetProviderId) {
                if (!providers.length) {
                  alert('No providers configured.');
                  return;
                }
                const options = providers
                  .map((p) => `${p.id} (${p.name})`)
                  .join('\n');
                const defaultId = a.provider_id || providers[0].id;
                const input = window.prompt(
                  `Upload to which provider?\n${options}`,
                  defaultId,
                );
                if (!input) return;
                targetProviderId = input.trim();
              }

              await controller.reuploadAsset(a, targetProviderId);
            },
          };

          return (
            <MediaCard
              id={a.id}
              mediaType={a.media_type}
              providerId={a.provider_id}
              providerAssetId={a.provider_asset_id}
              thumbUrl={a.thumbnail_url}
              remoteUrl={a.remote_url}
              width={a.width}
              height={a.height}
              durationSec={a.duration_sec}
              tags={a.tags}
              description={a.description}
              createdAt={a.created_at}
              status={a.sync_status}
              providerStatus={a.provider_status}
              onOpen={() => controller.openInViewer(a)}
              actions={actions}
            />
          );
        })()}
      </div>
    );
  });

  return (
    <div className="flex flex-col h-full">
      {/* Fixed filters section */}
      <div className="flex-shrink-0 space-y-4">
        {controller.error && <div className="text-red-600 text-sm">{controller.error}</div>}

        <div>
          <h2 className="text-lg font-semibold">Remote Gallery</h2>
        </div>

        <div className="space-y-2 bg-neutral-50 dark:bg-neutral-800 p-3 rounded border border-neutral-200 dark:border-neutral-700">
          <div className="flex flex-wrap gap-2 items-center">
            {/* Scope tabs */}
            <div className="flex gap-1 border-r border-neutral-300 dark:border-neutral-600 pr-2">
              {SCOPE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    controller.scope === tab.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-600'
                  }`}
                  onClick={() => controller.setScope(tab.id as any)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <input
              placeholder="Search..."
              className="px-2 py-1 text-sm border rounded"
              value={controller.filters.q}
              onChange={(e) => controller.setFilters({ q: e.target.value })}
            />
            <select
              className="px-2 py-1 text-sm border rounded"
              value={controller.filters.provider_id || ''}
              onChange={(e) => controller.setFilters({ provider_id: e.target.value || undefined })}
            >
              <option value="">All Providers</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              className="px-2 py-1 text-sm border rounded"
              value={controller.filters.media_type || ''}
              onChange={(e) =>
                controller.setFilters({
                  media_type: (e.target.value || undefined) as any,
                })
              }
            >
              <option value="">All Media</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
              <option value="audio">Audio</option>
              <option value="3d_model">3D Models</option>
            </select>
            <select
              className="px-2 py-1 text-sm border rounded"
              value={controller.filters.sort}
              onChange={(e) => controller.setFilters({ sort: e.target.value as any })}
            >
              <option value="new">Newest</option>
              <option value="old">Oldest</option>
              <option value="alpha">A–Z</option>
            </select>
            <select
              className="px-2 py-1 text-sm border rounded"
              value={controller.filters.provider_status || ''}
              onChange={(e) => controller.setFilters({ provider_status: (e.target.value || undefined) as any })}
            >
              <option value="">All Status</option>
              <option value="ok">Provider OK</option>
              <option value="local_only">Local Only</option>
              <option value="flagged">Flagged</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
        </div>

        {/* Gallery Tools Panel */}
        {showToolsPanel && !controller.isSelectionMode && (
          <div className="mb-4">
            <GalleryToolsPanel context={galleryContext} surfaceId="assets-default" />
          </div>
        )}
      </div>

      {/* Scrollable gallery */}
      <div className="flex-1 overflow-auto mt-4">
        {layout === 'masonry' ? (
          <MasonryGrid
            items={cardItems}
            rowGap={layoutSettings.rowGap}
            columnGap={layoutSettings.columnGap}
            minColumnWidth={cardSize}
          />
        ) : (
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))`,
              rowGap: `${layoutSettings.rowGap}px`,
              columnGap: `${layoutSettings.columnGap}px`,
            }}
          >
            {cardItems}
          </div>
        )}
        {/* Infinite scroll sentinel and loading indicator */}
        <div className="pt-4 pb-8 flex justify-center">
          {controller.hasMore && (
            <div ref={sentinelRef} className="text-sm text-neutral-500">
              {controller.loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span>Loading more assets...</span>
                </div>
              ) : (
                <span className="text-neutral-400">Scroll for more</span>
              )}
            </div>
          )}
          {!controller.hasMore && controller.assets.length > 0 && (
            <div className="text-sm text-neutral-500">No more assets</div>
          )}
        </div>
      </div>
    </div>
  );
}
