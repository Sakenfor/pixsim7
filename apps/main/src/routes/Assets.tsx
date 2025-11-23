import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAssets } from '../hooks/useAssets';
import { useProviders } from '../hooks/useProviders';
import { MediaCard } from '../components/media/MediaCard';
import { useJobsSocket } from '../hooks/useJobsSocket';
import { Tabs } from '@pixsim7/shared.ui';
import { Badge, Button } from '@pixsim7/shared.ui';
import { MasonryGrid } from '../components/layout/MasonryGrid';
import { LocalFoldersPanel } from '../components/assets/LocalFoldersPanel';
import { useAssetPickerStore } from '../stores/assetPickerStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { usePanelConfigStore } from '../stores/panelConfigStore';
import { GalleryToolsPanel } from '../components/gallery/GalleryToolsPanel';
import { GallerySurfaceSwitcher } from '../components/gallery/GallerySurfaceSwitcher';
import { gallerySurfaceRegistry } from '../lib/gallery/surfaceRegistry';
import { mergeBadgeConfig } from '../lib/gallery/badgeConfigMerge';
import { BADGE_CONFIG_PRESETS, findMatchingPreset } from '../lib/gallery/badgeConfigPresets';
import type { GalleryToolContext, GalleryAsset } from '../lib/gallery/types';
import { ThemedIcon } from '../lib/icons';

const SCOPE_TABS = [
  { id: 'all', label: 'All' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'mine', label: 'Mine' },
  { id: 'recent', label: 'Recent' },
];

export function AssetsRoute() {
  const navigate = useNavigate();
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
    provider_status: (params.get('provider_status') as any) || persisted.provider_status || undefined,
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

  const handleOpenAsset = (asset: any) => {
    navigate(`/assets/${asset.id}`);
  };

  function updateURL(next: typeof filters) {
    const p = new URLSearchParams();
    if (next.q) p.set('q', next.q);
    if (next.tag) p.set('tag', next.tag);
    if (next.provider_id) p.set('provider_id', next.provider_id);
    if (next.sort) p.set('sort', next.sort);
    if (next.media_type) p.set('media_type', next.media_type);
    if (next.provider_status) p.set('provider_status', next.provider_status);
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

  // Get current surface ID from URL
  const location = useLocation();
  const currentSurfaceId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('surface') || 'assets-default';
  }, [location.search]);

  // Get badge config from panel settings
  const panelConfig = usePanelConfigStore((s) => s.panelConfigs.gallery);
  const updatePanelSettings = usePanelConfigStore((s) => s.updatePanelSettings);

  // Merge badge configurations: surface < panel < widget
  const effectiveBadgeConfig = useMemo(() => {
    const surface = gallerySurfaceRegistry.get(currentSurfaceId);
    const surfaceBadgeConfig = surface?.badgeConfig;
    const panelBadgeConfig = panelConfig?.settings?.badgeConfig;

    return mergeBadgeConfig(surfaceBadgeConfig, panelBadgeConfig);
  }, [currentSurfaceId, panelConfig]);

  // Find current badge preset
  const currentBadgePreset = useMemo(() => {
    return findMatchingPreset(panelConfig?.settings?.badgeConfig || {}) || 'default';
  }, [panelConfig]);

  // Handle badge preset change
  const handleBadgePresetChange = (presetId: string) => {
    const preset = BADGE_CONFIG_PRESETS.find(p => p.id === presetId);
    if (preset) {
      updatePanelSettings('gallery', { badgeConfig: preset.config });
    }
  };

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
              <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2">
                <ThemedIcon name="target" size={20} variant="primary" />
                Asset Selection Mode
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
              <h2 className="text-lg font-semibold text-purple-900 dark:text-purple-100 flex items-center gap-2">
                <ThemedIcon name="wrench" size={20} variant="primary" />
                {selectedAssetIds.size} Asset{selectedAssetIds.size !== 1 ? 's' : ''} Selected
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
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Assets</h1>
          {/* Current Surface Indicator */}
          <span className="px-2 py-0.5 text-[10px] bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded border border-purple-300 dark:border-purple-700">
            {currentSurfaceId}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {/* Surface Switcher */}
          <GallerySurfaceSwitcher mode="dropdown" />

          {/* Badge Style Preset Switcher */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">Badge Style:</span>
            <select
              value={currentBadgePreset}
              onChange={(e) => handleBadgePresetChange(e.target.value)}
              className="px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              title="Quick badge style presets"
            >
              {BADGE_CONFIG_PRESETS.map(preset => (
                <option key={preset.id} value={preset.id}>
                  {preset.icon} {preset.name}
                </option>
              ))}
            </select>
          </div>

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
              className={`px-3 py-1 text-xs rounded border transition-colors flex items-center gap-1 ${
                showToolsPanel
                  ? 'bg-purple-500 text-white border-purple-600'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-600'
              }`}
              onClick={() => setShowToolsPanel(!showToolsPanel)}
            >
              <ThemedIcon name="wrench" size={12} variant="default" />
              Tools
              <ThemedIcon name={showToolsPanel ? 'chevronDown' : 'chevronRight'} size={12} variant="default" />
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
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-neutral-600">Viewing:</span>
              <Badge color="blue">{currentTab.label}</Badge>

              {/* Provider Status Overview */}
              {items.length > 0 && (
                <>
                  <span className="text-sm text-neutral-400">|</span>
                  <span className="text-sm text-neutral-600">Status:</span>
                  <Badge color="green" className="text-[10px]">
                    {items.filter(a => a.provider_status === 'ok').length} OK
                  </Badge>
                  <Badge color="yellow" className="text-[10px]">
                    {items.filter(a => a.provider_status === 'local_only').length} Local
                  </Badge>
                  {items.filter(a => a.provider_status === 'flagged').length > 0 && (
                    <Badge color="red" className="text-[10px]">
                      {items.filter(a => a.provider_status === 'flagged').length} Flagged
                    </Badge>
                  )}
                </>
              )}
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
                value={filters.media_type || ''}
                onChange={(e) =>
                  setAndPersist({
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
                value={filters.sort}
                onChange={(e) => setAndPersist({ sort: e.target.value as any })}
              >
                <option value="new">Newest</option>
                <option value="old">Oldest</option>
                <option value="alpha">A–Z</option>
              </select>
              <select
                className="px-2 py-1 text-sm border rounded"
                value={filters.provider_status || ''}
                onChange={(e) => setAndPersist({ provider_status: e.target.value || undefined as any })}
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
          {showToolsPanel && !isSelectionMode && (
            <div className="mb-4">
              <GalleryToolsPanel context={galleryContext} surfaceId={currentSurfaceId} />
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
                          providerStatus={a.provider_status}
                          onOpen={() => handleOpenAsset(a)}
                          actions={{
                            onOpenDetails: () => navigate(`/assets/${a.id}`),
                            onShowMetadata: () => navigate(`/assets/${a.id}`),
                          }}
                          badgeConfig={effectiveBadgeConfig}
                        />
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <Button
                          variant="primary"
                          onClick={() => handleSelectAsset(a)}
                          className="pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity shadow-lg flex items-center gap-1"
                        >
                          <ThemedIcon name="check" size={14} variant="default" />
                          Select Asset
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
                        providerStatus={a.provider_status}
                        onOpen={() => handleOpenAsset(a)}
                        actions={{
                          onOpenDetails: () => navigate(`/assets/${a.id}`),
                          onShowMetadata: () => navigate(`/assets/${a.id}`),
                        }}
                        badgeConfig={effectiveBadgeConfig}
                      />
                      {/* Selection indicator */}
                      {isSelected && (
                        <div className="absolute top-2 right-2 bg-purple-500 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-lg">
                          <ThemedIcon name="check" size={14} variant="default" />
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
