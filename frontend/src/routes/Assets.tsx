import { useState, useEffect, useMemo } from 'react';
import { useAssets } from '../hooks/useAssets';
import { useProviders } from '../hooks/useProviders';
import { MediaCard } from '../components/media/MediaCard';
import { useJobsSocket } from '../hooks/useJobsSocket';
import { Tabs } from '../components/navigation/Tabs';
import { Badge, Button } from '@pixsim7/ui';
import { MasonryGrid } from '../components/layout/MasonryGrid';
import { LocalFoldersPanel } from '../components/assets/LocalFoldersPanel';
import { useAssetPickerStore } from '../stores/assetPickerStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { GalleryToolsPanel } from '../components/gallery/GalleryToolsPanel';
import type { GalleryToolContext, GalleryAsset } from '../lib/gallery/types';

const SCOPE_TABS = [
  { id: 'all', label: 'All' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'mine', label: 'Mine' },
  { id: 'recent', label: 'Recent' },
];

export function AssetsRoute() {
  // Asset picker mode
  const isSelectionMode = useAssetPickerStore((s) => s.isSelectionMode);
  const selectAsset = useAssetPickerStore((s) => s.selectAsset);
  const exitSelectionMode = useAssetPickerStore((s) => s.exitSelectionMode);
  const closeFloatingPanel = useWorkspaceStore((s) => s.closeFloatingPanel);

  // Filters state derived from URL + sessionStorage
  const params = new URLSearchParams(window.location.search);
  const sessionKey = 'assets_filters';
  const persisted = (() => {
    try { return JSON.parse(sessionStorage.getItem(sessionKey) || '{}'); } catch { return {}; }
  })();
  const initialFilters = {
    q: params.get('q') || persisted.q || '',
    tag: params.get('tag') || persisted.tag || undefined,
    provider_id: params.get('provider_id') || persisted.provider_id || undefined,
    sort: (params.get('sort') as any) || persisted.sort || 'new',
    media_type: (params.get('media_type') as any) || persisted.media_type || undefined,
  };
  const [filters, setFilters] = useState(initialFilters);
  const { providers } = useProviders();
  const { items, loadMore, loading, error, hasMore } = useAssets({ filters });
  const jobsSocket = useJobsSocket({ autoConnect: true });

  // Handle asset selection
  const handleSelectAsset = (asset: any) => {
    selectAsset({
      id: asset.id,
      mediaType: asset.media_type,
      providerId: asset.provider_id,
      providerAssetId: asset.provider_asset_id,
      remoteUrl: asset.remote_url,
      thumbnailUrl: asset.thumbnail_url,
    });
    // Close floating gallery panel
    closeFloatingPanel('gallery');
  };

  const handleCancelSelection = () => {
    exitSelectionMode();
    closeFloatingPanel('gallery');
  };

  function updateURL(next: typeof filters) {
    const p = new URLSearchParams();
    if (next.q) p.set('q', next.q);
    if (next.tag) p.set('tag', next.tag);
    if (next.provider_id) p.set('provider_id', next.provider_id);
    if (next.sort) p.set('sort', next.sort);
    if (next.media_type) p.set('media_type', next.media_type);
    const newUrl = `${window.location.pathname}?${p.toString()}`;
    window.history.replaceState({}, '', newUrl);
    sessionStorage.setItem(sessionKey, JSON.stringify(next));
  }

  function setAndPersist(partial: Partial<typeof filters>) {
    setFilters(prev => {
      const next = { ...prev, ...partial };
      updateURL(next);
      return next;
    });
  }

  // Read scope from URL on mount
  const [scope, setScope] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('scope') || 'all';
  });

  // Sync scope to URL when it changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (scope === 'all') {
      params.delete('scope');
    } else {
      params.set('scope', scope);
    }
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }, [scope]);

  const handleScopeChange = (newScope: string) => {
    setScope(newScope);
  };

  const currentTab = SCOPE_TABS.find(t => t.id === scope);
  // View toggle between remote assets and local folders panel
  const [view, setView] = useState<'remote' | 'local'>('remote');

  // Gallery tools state
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [showToolsPanel, setShowToolsPanel] = useState(false);

  // Convert selected IDs to GalleryAsset objects
  const selectedAssets: GalleryAsset[] = useMemo(() => {
    return items.filter(a => selectedAssetIds.has(a.id));
  }, [items, selectedAssetIds]);

  // Gallery tool context
  const galleryContext: GalleryToolContext = useMemo(() => ({
    assets: items,
    selectedAssets,
    filters,
    refresh: () => {
      // Trigger a refresh by clearing and reloading
      window.location.reload();
    },
    updateFilters: setAndPersist,
    isSelectionMode,
  }), [items, selectedAssets, filters, isSelectionMode]);

  // Handle asset selection for gallery tools
  const toggleAssetSelection = (assetId: string) => {
    const newSelection = new Set(selectedAssetIds);
    if (newSelection.has(assetId)) {
      newSelection.delete(assetId);
    } else {
      newSelection.add(assetId);
    }
    setSelectedAssetIds(newSelection);

    // Auto-show tools panel when assets are selected
    if (newSelection.size > 0 && !showToolsPanel) {
      setShowToolsPanel(true);
    }
  };

  const clearSelection = () => {
    setSelectedAssetIds(new Set());
  };

  return (
    <div className="p-6 space-y-4 content-with-dock min-h-screen">
      {/* Selection Mode Banner */}
      {isSelectionMode && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500 dark:border-blue-400 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
                📎 Asset Selection Mode
              </h2>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Click on an asset to select it for your scene node
              </p>
            </div>
            <Button variant="secondary" onClick={handleCancelSelection}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Gallery Tools Selection Banner */}
      {!isSelectionMode && selectedAssetIds.size > 0 && (
        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-500 dark:border-purple-400 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-purple-900 dark:text-purple-100">
                🛠️ {selectedAssetIds.size} Asset{selectedAssetIds.size !== 1 ? 's' : ''} Selected
              </h2>
              <p className="text-sm text-purple-700 dark:text-purple-300">
                Use the tools panel below to perform actions on selected assets
              </p>
            </div>
            <Button variant="secondary" onClick={clearSelection}>
              Clear Selection
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Assets</h1>
        <div className="flex items-center gap-4">
          <div className="flex gap-1 text-xs">
            <button
              className={`px-2 py-1 rounded ${view==='remote' ? 'bg-blue-600 text-white' : 'bg-neutral-200 dark:bg-neutral-700'}`}
              onClick={() => setView('remote')}
            >Remote</button>
            <button
              className={`px-2 py-1 rounded ${view==='local' ? 'bg-blue-600 text-white' : 'bg-neutral-200 dark:bg-neutral-700'}`}
              onClick={() => setView('local')}
            >Local</button>
          </div>
          {!isSelectionMode && (
            <button
              className={`px-3 py-1 text-xs rounded border transition-colors ${
                showToolsPanel
                  ? 'bg-purple-500 text-white border-purple-600'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-600'
              }`}
              onClick={() => setShowToolsPanel(!showToolsPanel)}
            >
              🛠️ Tools {showToolsPanel ? '▼' : '▶'}
            </button>
          )}
          <div className="flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] ${
              jobsSocket.connected
                ? 'border-green-500 text-green-600 dark:text-green-300'
                : 'border-amber-500 text-amber-600 dark:text-amber-300'
            }`}>
              <span
                className={`w-2 h-2 rounded-full mr-1 ${
                  jobsSocket.connected ? 'bg-green-500' : 'bg-amber-500'
                }`}
              />
              Jobs feed: {jobsSocket.connected ? 'live' : 'offline'}
            </span>
            {jobsSocket.error && (
              <span className="text-[10px] text-red-500 dark:text-red-400">
                ({jobsSocket.error})
              </span>
            )}
          </div>
        </div>
      </div>

      {view === 'remote' && (
        <>
          <Tabs tabs={SCOPE_TABS} value={scope} onChange={handleScopeChange} />
          {currentTab && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-600">Viewing:</span>
              <Badge color="blue">{currentTab.label}</Badge>
            </div>
          )}
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <div className="space-y-2 bg-neutral-50 dark:bg-neutral-800 p-3 rounded border border-neutral-200 dark:border-neutral-700">
            <div className="flex flex-wrap gap-2 items-center">
              <input
                placeholder="Search..."
                className="px-2 py-1 text-sm border rounded"
                value={filters.q}
                onChange={(e) => setAndPersist({ q: e.target.value })}
              />
              <select
                className="px-2 py-1 text-sm border rounded"
                value={filters.provider_id || ''}
                onChange={(e) => setAndPersist({ provider_id: e.target.value || undefined })}
              >
                <option value="">All Providers</option>
                {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select
                className="px-2 py-1 text-sm border rounded"
                value={filters.sort}
                onChange={(e) => setAndPersist({ sort: e.target.value as any })}
              >
                <option value="new">Newest</option>
                <option value="old">Oldest</option>
                <option value="alpha">A–Z</option>
              </select>
            </div>
          </div>

          {/* Gallery Tools Panel */}
          {showToolsPanel && !isSelectionMode && (
            <div className="mb-4">
              <GalleryToolsPanel context={galleryContext} />
            </div>
          )}

          <MasonryGrid
            items={items.map(a => {
              const isSelected = selectedAssetIds.has(a.id);

              return (
                <div key={a.id} className="break-inside-avoid rounded overflow-hidden inline-block w-full">
                  {isSelectionMode ? (
                    <div className="relative group">
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
                        />
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <Button
                          variant="primary"
                          onClick={() => handleSelectAsset(a)}
                          className="pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                        >
                          ✓ Select Asset
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`relative cursor-pointer group ${
                        isSelected ? 'ring-4 ring-purple-500 rounded' : ''
                      }`}
                      onClick={(e) => {
                        // Allow selection via click when not in picker mode
                        if (e.shiftKey || e.ctrlKey || e.metaKey) {
                          toggleAssetSelection(a.id);
                        }
                      }}
                    >
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
                      />
                      {/* Selection indicator */}
                      {isSelected && (
                        <div className="absolute top-2 right-2 bg-purple-500 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-lg">
                          ✓
                        </div>
                      )}
                      {/* Selection hint on hover */}
                      <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="bg-black/70 text-white text-xs px-2 py-1 rounded text-center">
                          {isSelected ? 'Ctrl+Click to deselect' : 'Ctrl+Click to select'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          />
          <div className="pt-4">
            {hasMore && (
              <button disabled={loading} onClick={loadMore} className="border px-4 py-2 rounded">
                {loading ? 'Loading...' : 'Load More'}
              </button>
            )}
            {!hasMore && <div className="text-sm text-neutral-500">No more assets</div>}
          </div>
        </>
      )}
      {view === 'local' && <LocalFoldersPanel />}
    </div>
  );
}
