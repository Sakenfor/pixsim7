import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAssetsController } from '../hooks/useAssetsController';
import { useGenerationWebSocket } from '../hooks/useGenerationWebSocket';
import { Modal } from '@pixsim7/shared.ui';
import { Button } from '@pixsim7/shared.ui';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { usePanelConfigStore } from '../stores/panelConfigStore';
import { GallerySurfaceSwitcher } from '../components/gallery/GallerySurfaceSwitcher';
import { GalleryLayoutControls } from '../components/gallery/GalleryLayoutControls';
import { mergeBadgeConfig, deriveOverlayPresetIdFromBadgeConfig } from '../lib/gallery/badgeConfigMerge';
import { mediaCardPresets } from '@/lib/overlay';
import { ThemedIcon } from '../lib/icons';
import { useControlCenterStore } from '../stores/controlCenterStore';
import type { GalleryPanelSettings } from '../stores/panelConfigStore';
import { getAssetSource, getAllAssetSources, type AssetSourceId } from '../lib/gallery/assetSources';
import { registerAssetSources } from '../lib/gallery/registerAssetSources';
import { AssetViewerLayout } from '../components/media/AssetViewerLayout';

// Register all sources once
registerAssetSources();

export function AssetsRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const controller = useAssetsController();
  const { isConnected: generationWsConnected } = useGenerationWebSocket();
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Shared layout state for all sources
  const [layout, setLayout] = useState<'masonry' | 'grid'>('masonry');
  const [cardSize, setCardSize] = useState<number>(260);

  // Get current surface ID from URL (for remote gallery)
  const currentSurfaceId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('surface') || 'assets-default';
  }, [location.search]);

  // Get active source from URL
  const activeSourceId = useMemo<AssetSourceId>(() => {
    const params = new URLSearchParams(location.search);
    return (params.get('source') as AssetSourceId) || 'remote-gallery';
  }, [location.search]);

  const sourceDef = getAssetSource(activeSourceId) ?? getAssetSource('remote-gallery')!;
  const SourceComponent = sourceDef.component;
  const allSources = getAllAssetSources();

  // Get badge config from panel settings
  const panelConfig = usePanelConfigStore((s) => s.panelConfigs.gallery);
  const updatePanelSettings = usePanelConfigStore((s) => s.updatePanelSettings);

  // Get current control center state for smart quick actions
  const controlCenterOpen = useControlCenterStore((s) => s.isOpen);
  const controlCenterOperation = useControlCenterStore((s) => s.operationType);

  // Get current overlay preset ID
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

  // Handle source change with smooth transition
  const handleSourceChange = useCallback((sourceId: AssetSourceId) => {
    if (sourceId === activeSourceId) return;

    setIsTransitioning(true);
    const params = new URLSearchParams(location.search);
    params.set('source', sourceId);

    // Short delay for smooth transition
    setTimeout(() => {
      navigate(`?${params.toString()}`);
      setTimeout(() => setIsTransitioning(false), 100);
    }, 150);
  }, [activeSourceId, location.search, navigate]);

  // Keyboard shortcuts for source switching
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+1, Ctrl+2, etc. to switch sources
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const sourceIndex = parseInt(e.key, 10) - 1;
        if (sourceIndex < allSources.length) {
          handleSourceChange(allSources[sourceIndex].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [allSources, handleSourceChange]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Fixed header section */}
      <div className="flex-shrink-0 p-6 space-y-4 overflow-visible">
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

        {/* Top navigation bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">Assets</h1>
            {/* Current Surface Indicator (only for remote gallery) */}
            {activeSourceId === 'remote-gallery' && (
              <span className="px-2 py-0.5 text-[10px] bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded border border-purple-300 dark:border-purple-700">
                {currentSurfaceId}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {/* Source Switcher */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500 dark:text-neutral-400">Source:</span>
              <select
                value={activeSourceId}
                onChange={(e) => handleSourceChange(e.target.value as AssetSourceId)}
                className="px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                title="Select asset source"
              >
                {allSources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Surface Switcher (only for remote gallery) */}
            {activeSourceId === 'remote-gallery' && (
              <GallerySurfaceSwitcher mode="dropdown" />
            )}

            {/* MediaCard Preset Switcher (only for remote gallery) */}
            {activeSourceId === 'remote-gallery' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500 dark:text-neutral-400">Media Card:</span>
                <select
                  value={currentOverlayPresetId}
                  onChange={(e) => handleOverlayPresetChange(e.target.value)}
                  className="px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  title="Select media card preset"
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
                    useWorkspaceStore.getState().openFloatingPanel('settings', { width: 900, height: 700 });
                  }}
                  className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                  title="Open panel configuration settings"
                >
                  <ThemedIcon name="settings" size={14} variant="default" />
                </button>
              </div>
            )}

            {/* Gallery Layout Controls */}
            <GalleryLayoutControls
              layout={layout}
              setLayout={setLayout}
              cardSize={cardSize}
              setCardSize={setCardSize}
            />

            {/* Generation WebSocket indicator */}
            <div className="flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
              <button
                type="button"
                onClick={() => {
                  if (generationWsConnected) {
                    useWorkspaceStore.getState().openFloatingPanel('generation-dev', { width: 800, height: 600 });
                  } else {
                    alert('Generation feed is offline.');
                  }
                }}
                className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] transition-all hover:shadow-md ${
                  generationWsConnected
                    ? 'border-green-500 text-green-600 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20 cursor-pointer'
                    : 'border-amber-500 text-amber-600 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 cursor-help'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full mr-1 ${
                    generationWsConnected ? 'bg-green-500 animate-pulse-subtle' : 'bg-amber-500'
                  }`}
                />
                Generation feed: {generationWsConnected ? 'live' : 'offline'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable source component with asset viewer */}
      <div className="flex-1 overflow-hidden px-6 pb-6 relative">
        {/* Loading overlay during transition */}
        {isTransitioning && (
          <div className="absolute inset-0 bg-white/50 dark:bg-black/50 backdrop-blur-sm flex items-center justify-center z-10 transition-opacity duration-150">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-neutral-600 dark:text-neutral-400">Loading source...</span>
            </div>
          </div>
        )}

        {/* Source component with side-push viewer layout */}
        <AssetViewerLayout>
          <div className={`h-full overflow-y-auto transition-opacity duration-200 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
            <SourceComponent
              layout={layout}
              cardSize={cardSize}
              overlayPresetId={currentOverlayPresetId}
            />
          </div>
        </AssetViewerLayout>
      </div>

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
    </div>
  );
}
