import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useProviders } from '../hooks/useProviders';
import { useAssetsController } from '../hooks/useAssetsController';
import { MediaCard } from '../components/media/MediaCard';
import { useJobsSocket } from '../hooks/useJobsSocket';
import { Tabs, Modal } from '@pixsim7/shared.ui';
import { Button } from '@pixsim7/shared.ui';
import { MasonryGrid } from '../components/layout/MasonryGrid';
import { LocalFoldersPanel } from '../components/assets/LocalFoldersPanel';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { usePanelConfigStore } from '../stores/panelConfigStore';
import { GalleryToolsPanel } from '@/components/gallery/panels/GalleryToolsPanel';
import { GallerySurfaceSwitcher } from '../components/gallery/GallerySurfaceSwitcher';
import { GalleryLayoutControls } from '../components/gallery/GalleryLayoutControls';
import { gallerySurfaceRegistry } from '../lib/gallery/surfaceRegistry';
import { mergeBadgeConfig, deriveOverlayPresetIdFromBadgeConfig } from '../lib/gallery/badgeConfigMerge';
import { mediaCardPresets } from '@/lib/overlay';
import type { GalleryToolContext, GalleryAsset } from '../lib/gallery/types';
import { ThemedIcon } from '../lib/icons';
import { useControlCenterStore } from '../stores/controlCenterStore';
import type { GalleryPanelSettings } from '../stores/panelConfigStore';

const SCOPE_TABS = [
  { id: 'all', label: 'All' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'mine', label: 'Mine' },
  { id: 'recent', label: 'Recent' },
];

export function AssetsRoute() {
  const navigate = useNavigate();

  // Use the assets controller for all business logic
  const controller = useAssetsController();

  const { providers } = useProviders();
  const jobsSocket = useJobsSocket({ autoConnect: true });

  const currentTab = SCOPE_TABS.find((t) => t.id === controller.scope);
  // UI state (not part of controller - route-specific display settings)
  const [view, setView] = useState<'remote' | 'local'>('remote');
  const [layout, setLayout] = useState<'masonry' | 'grid'>('masonry');
  const [layoutSettings, setLayoutSettings] = useState({ rowGap: 16, columnGap: 16 });
  const [cardSize, setCardSize] = useState<number>(260); // Card width in pixels (160-400 range)
  const [showLayoutSettings, setShowLayoutSettings] = useState(false);
  const [showToolsPanel, setShowToolsPanel] = useState(false);

  // Get current surface ID from URL
  const location = useLocation();
  const currentSurfaceId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('surface') || 'assets-default';
  }, [location.search]);

  // Get badge config from panel settings
  const panelConfig = usePanelConfigStore((s) => s.panelConfigs.gallery);
  const updatePanelSettings = usePanelConfigStore((s) => s.updatePanelSettings);

  // Get current control center state for smart quick actions
  const controlCenterOpen = useControlCenterStore((s) => s.isOpen);
  const controlCenterOperation = useControlCenterStore((s) => s.operationType);

  // Merge badge configurations: surface < panel < widget
  // Add smart quick action based on control center state
  const effectiveBadgeConfig = useMemo(() => {
    const surface = gallerySurfaceRegistry.get(currentSurfaceId);
    const surfaceBadgeConfig = surface?.badgeConfig;
    const panelBadgeConfig = panelConfig?.settings?.badgeConfig;

    const merged = mergeBadgeConfig(surfaceBadgeConfig, panelBadgeConfig);

    // Smart quick action: if control center is open, use its current operation
    if (controlCenterOpen && controlCenterOperation) {
      const smartAction =
        controlCenterOperation === 'video_transition' ? 'add_to_transition'
        : controlCenterOperation === 'image_to_video' ? 'image_to_video'
        : controlCenterOperation === 'video_extend' ? 'video_extend'
        : merged.generationQuickAction || 'auto';

      return { ...merged, generationQuickAction: smartAction };
    }

    return merged;
  }, [currentSurfaceId, panelConfig, controlCenterOpen, controlCenterOperation]);

  // Get current overlay preset ID, with best-effort migration from legacy badgeConfig
  const currentOverlayPresetId = useMemo(() => {
    const settings = (panelConfig?.settings || {}) as GalleryPanelSettings;
    if (settings.overlayPresetId) {
      return settings.overlayPresetId;
    }
    if (settings.badgeConfig) {
      return deriveOverlayPresetIdFromBadgeConfig(settings.badgeConfig);
    }
    return 'media-card-default';
  }, [panelConfig]);

  // Handle overlay preset change
  const handleOverlayPresetChange = (presetId: string) => {
    const preset = mediaCardPresets.find(p => p.id === presetId);
    if (preset) {
      updatePanelSettings('gallery', { overlayPresetId: preset.id });
    }
  };

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
        // Trigger a refresh by clearing and reloading
        window.location.reload();
      },
      updateFilters: controller.setFilters,
      isSelectionMode: controller.isSelectionMode,
    }),
    [controller.assets, selectedAssets, controller.filters, controller.setFilters, controller.isSelectionMode]
  );

  // Handle asset selection for gallery tools (with auto-show panel)
  const toggleAssetSelection = (assetId: number | string) => {
    const idStr = String(assetId);
    controller.toggleAssetSelection(idStr);

    // Auto-show tools panel when assets are selected
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

  // Rendered cards for remote assets (shared between masonry/grid layouts)
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
	              // In selection mode, disable card open behavior to avoid navigation
	              onOpen={undefined}
              actions={controller.getAssetActions(a)}
              badgeConfig={effectiveBadgeConfig}
              overlayPresetId={currentOverlayPresetId}
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
	          // Ctrl/Shift/Meta click: toggle selection instead of opening viewer
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
              // Upload to provider choice:
              // - If a provider is selected in filters, use that directly.
              // - Otherwise, prompt user to choose a provider ID.
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
                badgeConfig={effectiveBadgeConfig}
                overlayPresetId={currentOverlayPresetId}
              />
            );
          })()}
        </div>
      );
	  });

  return (
    <div className="p-6 space-y-4 content-with-dock min-h-screen">
      {/* Selection Mode Banner */}
      {controller.isSelectionMode && (
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
            <Button variant="secondary" onClick={controller.cancelSelection}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Gallery Tools Selection Banner */}
      {!controller.isSelectionMode && controller.selectedAssetIds.size > 0 && (
        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-500 dark:border-purple-400 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-purple-900 dark:text-purple-100 flex items-center gap-2">
                <ThemedIcon name="wrench" size={20} variant="primary" />
                {controller.selectedAssetIds.size} Asset{controller.selectedAssetIds.size !== 1 ? 's' : ''} Selected
              </h2>
              <p className="text-sm text-purple-700 dark:text-purple-300">
                Use the tools panel below to perform actions on selected assets
              </p>
            </div>
            <Button variant="secondary" onClick={controller.clearSelection}>
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

          {/* MediaCard Preset Switcher */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">MediaCard Preset:</span>
            <select
              value={currentOverlayPresetId}
              onChange={(e) => handleOverlayPresetChange(e.target.value)}
              className="px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              title="Quick MediaCard overlay presets"
            >
              {mediaCardPresets.map(preset => (
                <option key={preset.id} value={preset.id}>
                  {preset.icon} {preset.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                const settingsPanel = useWorkspaceStore.getState().openFloatingPanel('settings', { width: 900, height: 700 });
                // TODO: Navigate to Panels tab and scroll to gallery section
              }}
              className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
              title="Open panel configuration settings"
            >
              <ThemedIcon name="settings" size={14} variant="default" />
            </button>
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
            <GalleryLayoutControls
              layout={layout}
              setLayout={setLayout}
              cardSize={cardSize}
              setCardSize={setCardSize}
              onSettingsClick={() => setShowLayoutSettings(true)}
            />
          )}
          {!controller.isSelectionMode && (
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
            <button
              type="button"
              onClick={() => {
                if (jobsSocket.connected) {
                  // Open generation dev panel or show info
                  const hasDevPanel = useWorkspaceStore.getState().openFloatingPanel('generation-dev', { width: 800, height: 600 });
                } else {
                  alert('Jobs feed is offline.\n\nThe WebSocket connection to the backend is not available. This may be because:\n\n• Backend server is not running\n• Network connectivity issue\n• WebSocket endpoint not configured\n\nGeneration requests will still work, but you won\'t receive real-time status updates.');
                }
              }}
              className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] transition-all hover:shadow-md ${
                jobsSocket.connected
                  ? 'border-green-500 text-green-600 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20 cursor-pointer'
                  : 'border-amber-500 text-amber-600 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 cursor-help'
              }`}
              title={
                jobsSocket.connected
                  ? 'Click to view generation jobs and status'
                  : 'Jobs feed offline - Click for more info'
              }
            >
              <span
                className={`w-2 h-2 rounded-full mr-1 ${
                  jobsSocket.connected ? 'bg-green-500 animate-pulse-subtle' : 'bg-amber-500'
                }`}
              />
              Jobs feed: {jobsSocket.connected ? 'live' : 'offline'}
            </button>
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
          <Tabs tabs={SCOPE_TABS} value={controller.scope} onChange={controller.setScope} />
          {controller.error && <div className="text-red-600 text-sm">{controller.error}</div>}
          <div className="space-y-2 bg-neutral-50 dark:bg-neutral-800 p-3 rounded border border-neutral-200 dark:border-neutral-700">
            <div className="flex flex-wrap gap-2 items-center">
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
              <GalleryToolsPanel context={galleryContext} surfaceId={currentSurfaceId} />
            </div>
          )}

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
	          <div className="pt-4">
            {controller.hasMore && (
              <button disabled={controller.loading} onClick={controller.loadMore} className="border px-4 py-2 rounded">
                {controller.loading ? 'Loading...' : 'Load More'}
              </button>
            )}
            {!controller.hasMore && <div className="text-sm text-neutral-500">No more assets</div>}
          </div>
        </>
      )}
	      {view === 'local' && <LocalFoldersPanel />}

	      {/* Fullscreen viewer for remote assets */}
	      {controller.viewerAsset && controller.viewerSrc && (
	        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-6">
	          <div className="relative max-w-6xl max-h-[90vh] w-full flex flex-col gap-4">
	            <div className="bg-black rounded-lg overflow-hidden shadow-2xl flex-1 flex items-center justify-center">
	              {controller.viewerAsset.media_type === 'video' ? (
	                <video
	                  src={controller.viewerSrc}
	                  className="w-full h-full object-contain"
	                  controls
	                  autoPlay
	                />
	              ) : (
	                <img
	                  src={controller.viewerSrc}
	                  alt={controller.viewerAsset.description || `asset-${controller.viewerAsset.id}`}
	                  className="w-full h-full object-contain"
	                />
	              )}
	            </div>

	            <div className="flex items-center justify-between text-sm text-neutral-200">
	              <div className="flex flex-col gap-1">
	                <div className="text-lg font-semibold truncate">
	                  {controller.viewerAsset.description || `Asset #${controller.viewerAsset.id}`}
	                </div>
	                <div className="flex gap-3 text-xs text-neutral-400">
	                  <span>{controller.viewerAsset.media_type}</span>
	                  <span>{controller.viewerAsset.provider_id}</span>
	                  <span>
	                    {new Date(controller.viewerAsset.created_at).toLocaleString()}
	                  </span>
	                </div>
	              </div>
	              <div className="flex items-center gap-3">
	                <button
	                  type="button"
	                  onClick={() => controller.navigateViewer('prev')}
	                  disabled={controller.assets.findIndex((a) => a.id === controller.viewerAsset?.id) <= 0}
	                  className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 disabled:opacity-40 text-xs flex items-center gap-1"
	                >
	                  <ThemedIcon name="chevronLeft" size={14} variant="default" />
	                  Prev
	                </button>
	                <button
	                  type="button"
	                  onClick={() => controller.navigateViewer('next')}
	                  disabled={controller.assets.findIndex((a) => a.id === controller.viewerAsset?.id) >= controller.assets.length - 1}
	                  className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 disabled:opacity-40 text-xs flex items-center gap-1"
	                >
	                  Next
	                  <ThemedIcon name="chevronRight" size={14} variant="default" />
	                </button>
	                <button
	                  type="button"
	                  onClick={controller.closeViewer}
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
	      {controller.detailAssetId !== null && (
	        <Modal
	          isOpen={true}
	          onClose={() => controller.setDetailAssetId(null)}
	          title={`Asset #${controller.detailAssetId}`}
	          size="lg"
	        >
	          <div className="space-y-3 max-h-[70vh] overflow-auto text-xs">
	            {controller.detailLoading && <div>Loading...</div>}
	            {controller.detailError && (
	              <div className="text-red-600 text-sm">{controller.detailError}</div>
	            )}
	            {controller.detailAsset && (
	              <pre className="bg-neutral-100 dark:bg-neutral-900 p-3 rounded whitespace-pre-wrap break-all">
	                {JSON.stringify(controller.detailAsset, null, 2)}
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
