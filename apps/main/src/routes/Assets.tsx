import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAssets, type AssetSummary } from '../hooks/useAssets';
import { useAsset } from '../hooks/useAsset';
import { useProviders } from '../hooks/useProviders';
import { MediaCard } from '../components/media/MediaCard';
import { useJobsSocket } from '../hooks/useJobsSocket';
import { Tabs, Modal } from '@pixsim7/shared.ui';
import { Badge, Button } from '@pixsim7/shared.ui';
import { MasonryGrid } from '../components/layout/MasonryGrid';
import { LocalFoldersPanel } from '../components/assets/LocalFoldersPanel';
import { useAssetPickerStore } from '../stores/assetPickerStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { usePanelConfigStore } from '../stores/panelConfigStore';
import { useMediaGenerationActions } from '../hooks/useMediaGenerationActions';
import { GalleryToolsPanel } from '../components/gallery/GalleryToolsPanel';
import { GallerySurfaceSwitcher } from '../components/gallery/GallerySurfaceSwitcher';
import { gallerySurfaceRegistry } from '../lib/gallery/surfaceRegistry';
import { mergeBadgeConfig } from '../lib/gallery/badgeConfigMerge';
import { BADGE_CONFIG_PRESETS, findMatchingPreset } from '../lib/gallery/badgeConfigPresets';
import type { GalleryToolContext, GalleryAsset } from '../lib/gallery/types';
import { ThemedIcon } from '../lib/icons';
import { BACKEND_BASE } from '../lib/api/client';

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

  const {
    queueImageToVideo,
    queueVideoExtend,
    queueAddToTransition,
    queueAutoGenerate,
  } = useMediaGenerationActions();

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
  const [viewerAsset, setViewerAsset] = useState<AssetSummary | null>(null);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [detailAssetId, setDetailAssetId] = useState<number | null>(null);
  const { asset: detailAsset, loading: detailLoading, error: detailError } = useAsset(detailAssetId);

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
  // Layout toggle for remote gallery
  const [layout, setLayout] = useState<'masonry' | 'grid'>('masonry');
  const [layoutSettings, setLayoutSettings] = useState({ rowGap: 16, columnGap: 16 });
  const [showLayoutSettings, setShowLayoutSettings] = useState(false);

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
	
	  const handleOpenInViewer = (asset: AssetSummary) => {
	    setViewerAsset(asset);
	  };
	
	  const handleCloseViewer = () => {
	    setViewerAsset(null);
	    if (viewerSrc && viewerSrc.startsWith('blob:')) {
	      URL.revokeObjectURL(viewerSrc);
	    }
	    setViewerSrc(null);
	  };
	
	  const handleNavigateViewer = (direction: 'prev' | 'next') => {
	    if (!viewerAsset) return;
	    const index = items.findIndex(a => a.id === viewerAsset.id);
	    if (index === -1) return;
	    const nextIndex = direction === 'prev' ? index - 1 : index + 1;
	    if (nextIndex < 0 || nextIndex >= items.length) return;
	    setViewerAsset(items[nextIndex]);
	  };
	
	  // Load viewer media source (supports backend-relative URLs with auth)
	  useEffect(() => {
	    let cancelled = false;
	
	    const load = async () => {
	      if (!viewerAsset) {
	        if (viewerSrc && viewerSrc.startsWith('blob:')) {
	          URL.revokeObjectURL(viewerSrc);
	        }
	        setViewerSrc(null);
	        return;
	      }
	
	      const candidate = viewerAsset.remote_url || viewerAsset.thumbnail_url;
	      if (!candidate) {
	        setViewerSrc(null);
	        return;
	      }
	
	      // Absolute URL or blob URL: use directly
	      if (candidate.startsWith('http://') || candidate.startsWith('https://') || candidate.startsWith('blob:')) {
	        setViewerSrc(candidate);
	        return;
	      }
	
	      // Backend-relative path: fetch with Authorization and create blob URL
	      const fullUrl = candidate.startsWith('/')
	        ? `${BACKEND_BASE}${candidate}`
	        : `${BACKEND_BASE}/${candidate}`;
	
	      const token = localStorage.getItem('access_token');
	      if (!token) {
	        setViewerSrc(fullUrl);
	        return;
	      }
	
	      try {
	        const res = await fetch(fullUrl, {
	          headers: { Authorization: `Bearer ${token}` },
	        });
	        if (!res.ok) {
	          setViewerSrc(fullUrl);
	          return;
	        }
	        const blob = await res.blob();
	        const url = URL.createObjectURL(blob);
	        if (!cancelled) {
	          if (viewerSrc && viewerSrc.startsWith('blob:')) {
	            URL.revokeObjectURL(viewerSrc);
	          }
	          setViewerSrc(url);
	        } else {
	          URL.revokeObjectURL(url);
	        }
	      } catch {
	        if (!cancelled) {
	          setViewerSrc(fullUrl);
	        }
	      }
	    };
	
	    load();
	
	    return () => {
	      cancelled = true;
	    };
	    // eslint-disable-next-line react-hooks/exhaustive-deps
	  }, [viewerAsset]);

	  // Rendered cards for remote assets (shared between masonry/grid layouts)
	  const cardItems = items.map(a => {
	    const isSelected = selectedAssetIds.has(a.id);

	    if (isSelectionMode) {
	      return (
	        <div key={a.id} className="relative group rounded-md overflow-hidden">
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
	              // In selection mode, disable card open behavior to avoid navigation
	              onOpen={undefined}
	              actions={{
	                onOpenDetails: (id) => setDetailAssetId(id),
	                onShowMetadata: (id) => setDetailAssetId(id),
	                onImageToVideo: () => queueImageToVideo(a),
	                onVideoExtend: () => queueVideoExtend(a),
	                onAddToTransition: () => queueAddToTransition(a),
	                onAddToGenerate: () => queueAutoGenerate(a),
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
	      );
	    }

	    return (
	      <div
	        key={a.id}
	        className={`relative cursor-pointer group rounded-md overflow-hidden ${
	          isSelected ? 'ring-4 ring-purple-500' : ''
	        }`}
	        onClick={(e) => {
	          // Ctrl/Shift/Meta click: toggle selection instead of opening viewer
	          if (e.ctrlKey || e.metaKey || e.shiftKey) {
	            e.preventDefault();
	            e.stopPropagation();
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
	          onOpen={() => handleOpenInViewer(a)}
	          actions={{
	            onOpenDetails: (id) => setDetailAssetId(id),
	            onShowMetadata: (id) => setDetailAssetId(id),
	            onImageToVideo: () => queueImageToVideo(a),
	            onVideoExtend: () => queueVideoExtend(a),
	            onAddToTransition: () => queueAddToTransition(a),
	            onAddToGenerate: () => queueAutoGenerate(a),
	          }}
	          badgeConfig={effectiveBadgeConfig}
	        />
	      </div>
	    );
	  });

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
          {view === 'remote' && (
            <div className="flex items-center gap-1 text-xs">
              <button
                className={`px-2 py-1 rounded ${
                  layout === 'masonry'
                    ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                    : 'bg-neutral-200 dark:bg-neutral-700'
                }`}
                onClick={() => setLayout('masonry')}
              >
                Masonry
              </button>
              <button
                className={`px-2 py-1 rounded ${
                  layout === 'grid'
                    ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                    : 'bg-neutral-200 dark:bg-neutral-700'
                }`}
                onClick={() => setLayout('grid')}
              >
                Grid
              </button>
              <button
                type="button"
                className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700"
                title="Layout settings"
                onClick={() => setShowLayoutSettings(true)}
              >
                <ThemedIcon name="settings" size={12} variant="default" />
              </button>
            </div>
          )}
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

	          {layout === 'masonry' ? (
	            <MasonryGrid
	              items={cardItems}
	              rowGap={layoutSettings.rowGap}
              columnGap={layoutSettings.columnGap}
            />
          ) : (
            <div
              className="grid md:grid-cols-3 lg:grid-cols-4"
              style={{
                rowGap: `${layoutSettings.rowGap}px`,
	              columnGap: `${layoutSettings.columnGap}px`,
	              }}
	            >
	              {cardItems}
	            </div>
	          )}
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

	      {/* Fullscreen viewer for remote assets */}
	      {viewerAsset && viewerSrc && (
	        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-6">
	          <div className="relative max-w-6xl max-h-[90vh] w-full flex flex-col gap-4">
	            <div className="bg-black rounded-lg overflow-hidden shadow-2xl flex-1 flex items-center justify-center">
	              {viewerAsset.media_type === 'video' ? (
	                <video
	                  src={viewerSrc}
	                  className="w-full h-full object-contain"
	                  controls
	                  autoPlay
	                />
	              ) : (
	                <img
	                  src={viewerSrc}
	                  alt={viewerAsset.description || `asset-${viewerAsset.id}`}
	                  className="w-full h-full object-contain"
	                />
	              )}
	            </div>
	
	            <div className="flex items-center justify-between text-sm text-neutral-200">
	              <div className="flex flex-col gap-1">
	                <div className="text-lg font-semibold truncate">
	                  {viewerAsset.description || `Asset #${viewerAsset.id}`}
	                </div>
	                <div className="flex gap-3 text-xs text-neutral-400">
	                  <span>{viewerAsset.media_type}</span>
	                  <span>{viewerAsset.provider_id}</span>
	                  <span>
	                    {new Date(viewerAsset.created_at).toLocaleString()}
	                  </span>
	                </div>
	              </div>
	              <div className="flex items-center gap-3">
	                <button
	                  type="button"
	                  onClick={() => handleNavigateViewer('prev')}
	                  disabled={items.findIndex(a => a.id === viewerAsset.id) <= 0}
	                  className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 disabled:opacity-40 text-xs flex items-center gap-1"
	                >
	                  <ThemedIcon name="chevronLeft" size={14} variant="default" />
	                  Prev
	                </button>
	                <button
	                  type="button"
	                  onClick={() => handleNavigateViewer('next')}
	                  disabled={items.findIndex(a => a.id === viewerAsset.id) >= items.length - 1}
	                  className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 disabled:opacity-40 text-xs flex items-center gap-1"
	                >
	                  Next
	                  <ThemedIcon name="chevronRight" size={14} variant="default" />
	                </button>
	                <button
	                  type="button"
	                  onClick={handleCloseViewer}
	                  className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-xs flex items-center gap-1"
	                >
	                  <ThemedIcon name="close" size={14} variant="default" />
	                  Close
	                </button>
	              </div>
	            </div>
	          </div>
	        </div>
	      )}
	
	      {/* Floating asset detail window */}
	      {detailAssetId !== null && (
	        <Modal
	          isOpen={true}
	          onClose={() => setDetailAssetId(null)}
	          title={`Asset #${detailAssetId}`}
	          size="lg"
	        >
	          <div className="space-y-3 max-h-[70vh] overflow-auto text-xs">
	            {detailLoading && <div>Loading...</div>}
	            {detailError && (
	              <div className="text-red-600 text-sm">{detailError}</div>
	            )}
	            {detailAsset && (
	              <pre className="bg-neutral-100 dark:bg-neutral-900 p-3 rounded whitespace-pre-wrap break-all">
	                {JSON.stringify(detailAsset, null, 2)}
	              </pre>
	            )}
	          </div>
	        </Modal>
	      )}

	      {/* Layout settings modal */}
	      {showLayoutSettings && (
	        <Modal
	          isOpen={true}
	          onClose={() => setShowLayoutSettings(false)}
	          title="Gallery Layout Settings"
	          size="sm"
	        >
	          <div className="space-y-3 text-sm">
	            <label className="flex items-center justify-between gap-2">
	              <span>Vertical gap (px)</span>
	              <input
	                type="number"
	                className="w-20 px-1 py-0.5 border rounded text-right"
	                value={layoutSettings.rowGap}
	                onChange={(e) =>
	                  setLayoutSettings((s) => ({
	                    ...s,
	                    rowGap: Number(e.target.value) || 0,
	                  }))
	                }
	              />
	            </label>
	            <label className="flex items-center justify-between gap-2">
	              <span>Horizontal gap (px)</span>
	              <input
	                type="number"
	                className="w-20 px-1 py-0.5 border rounded text-right"
	                value={layoutSettings.columnGap}
	                onChange={(e) =>
	                  setLayoutSettings((s) => ({
	                    ...s,
	                    columnGap: Number(e.target.value) || 0,
	                  }))
	                }
	              />
	            </label>
	          </div>
	        </Modal>
	      )}
	    </div>
	  );
	}
