import { Ref } from '@pixsim7/shared.ref.core';
import type { AssetRef } from '@pixsim7/shared.types';
import { Dropdown, DropdownItem, DropdownDivider } from '@pixsim7/shared.ui';
import { Button } from '@pixsim7/shared.ui';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { mediaCardPresets } from '@lib/ui/overlay';

import { useAssetsController, useAssetViewer, AssetDetailModal, DeleteAssetModal, useDeleteModalStore } from '@features/assets';
import { RelatedAssetsModal } from '@features/assets/components/RelatedAssetsModal';
import {
  CAP_ASSET_SELECTION,
  useProvideCapability,
  type AssetSelection,
} from '@features/contextHub';
import { useControlCenterLayout } from '@features/controlCenter';
import {
  GallerySurfaceSwitcher,
  GalleryLayoutControls,
  // mergeBadgeConfig,
  deriveOverlayPresetIdFromBadgeConfig,
  getAssetSource,
  getAllAssetSources,
  registerAssetSources,
  type AssetSourceId,
} from '@features/gallery';
import { useGenerationWebSocket } from '@features/generation';
import { usePanelConfigStore, type GalleryPanelSettings } from '@features/panels';
import { useWorkspaceStore } from '@features/workspace';


import { moduleRegistry } from '@app/modules';

import { AssetViewerLayout } from '../components/media/AssetViewerLayout';
import { Icon, IconBadge } from '../lib/icons';



export function AssetsRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const controller = useAssetsController();
  const { galleryAssetToViewer } = useAssetViewer({ source: 'gallery' });
  const { isConnected: generationWsConnected } = useGenerationWebSocket();
  const { style: layoutStyle } = useControlCenterLayout();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [sourcesRegistered, setSourcesRegistered] = useState(false);

  // Delete modal state (shared store for cross-component access)
  const deleteModalAssets = useDeleteModalStore((s) => s.assets);
  const closeDeleteModal = useDeleteModalStore((s) => s.closeDeleteModal);

  // Register all sources once
  useEffect(() => {
    registerAssetSources().then(() => {
      moduleRegistry.invalidate();
      setSourcesRegistered(true);
    });
  }, []);

  // Shared layout state for all sources
  const [layout, setLayout] = useState<'masonry' | 'grid'>('masonry');
  const [cardSize, setCardSize] = useState<number>(260);

  // Dropdown states
  const [panelsDropdownOpen, setPanelsDropdownOpen] = useState(false);

  // Get current surface ID from URL (for remote gallery)
  // const currentSurfaceId = useMemo(() => {
  //   const params = new URLSearchParams(location.search);
  //   return params.get('surface') || 'assets-default';
  // }, [location.search]);

  // Get active source from URL
  const activeSourceId = useMemo<AssetSourceId>(() => {
    const params = new URLSearchParams(location.search);
    return (params.get('source') as AssetSourceId) || 'remote-gallery';
  }, [location.search]);

  const sourceDef = getAssetSource(activeSourceId) ?? getAssetSource('remote-gallery');
  const SourceComponent = sourceDef?.component;
  const allSources = getAllAssetSources();

  // Get badge config from panel settings (must be before any conditional returns)
  const panelConfig = usePanelConfigStore((s) => s.panelConfigs.gallery);
  const updatePanelSettings = usePanelConfigStore((s) => s.updatePanelSettings);

  // Get current control center state for smart quick actions
  // const controlCenterOpen = useControlCenterStore((s) => s.isOpen);
  // const controlCenterOperation = useControlCenterStore((s) => s.operationType);

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

  const selectedGalleryAssets = useMemo(() => {
    return controller.assets.filter((asset) =>
      controller.selectedAssetIds.has(String(asset.id)),
    );
  }, [controller.assets, controller.selectedAssetIds]);

  const assetSelectionValue = useMemo<AssetSelection>(
    () => {
      const refs = selectedGalleryAssets
        .map((asset) => {
          const id = Number(asset.id);
          return Number.isFinite(id) ? Ref.asset(id) : null;
        })
        .filter((ref): ref is AssetRef => !!ref);

      return {
        asset:
          selectedGalleryAssets.length > 0
            ? galleryAssetToViewer(selectedGalleryAssets[0])
          : null,
        assets: selectedGalleryAssets.map(galleryAssetToViewer),
        source: 'gallery',
        ref: refs[0] ?? null,
        refs,
      };
    },
    [selectedGalleryAssets, galleryAssetToViewer],
  );

  const assetSelectionProvider = useMemo(
    () => ({
      id: 'gallery',
      label: 'Gallery Selection',
      priority: 30,
      exposeToContextMenu: true,
      isAvailable: () => selectedGalleryAssets.length > 0,
      getValue: () => assetSelectionValue,
    }),
    [selectedGalleryAssets.length, assetSelectionValue],
  );

  useProvideCapability(
    CAP_ASSET_SELECTION,
    assetSelectionProvider,
    [selectedGalleryAssets],
    { scope: 'root' },
  );

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

  // Show loading state while sources are being registered (after all hooks)
  if (!sourcesRegistered || !sourceDef || !SourceComponent) {
    return (
      <div className="flex items-center justify-center h-screen" style={layoutStyle}>
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Loading asset sources...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={layoutStyle}>
      {/* Selection banners (only rendered when active) */}
      {controller.isSelectionMode && (
        <div className="flex-shrink-0 px-6 pt-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500 dark:border-blue-400 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2">
                  <Icon name="target" size={20} variant="primary" />
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
        </div>
      )}
      {!controller.isSelectionMode && controller.selectedAssetIds.size > 0 && (
        <div className="flex-shrink-0 px-6 pt-4">
          <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-500 dark:border-purple-400 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-purple-900 dark:text-purple-100 flex items-center gap-2">
                  <Icon name="wrench" size={20} variant="primary" />
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
        </div>
      )}

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
              toolbarExtra={
                <>
                  {activeSourceId === 'remote-gallery' && (
                    <GallerySurfaceSwitcher mode="dropdown" />
                  )}
                  {activeSourceId === 'remote-gallery' && (
                    <select
                      value={currentOverlayPresetId}
                      onChange={(e) => handleOverlayPresetChange(e.target.value)}
                      className="h-7 px-1.5 text-xs rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 focus:outline-none focus:border-accent transition-colors"
                      title="Media card preset"
                    >
                      {mediaCardPresets.map(preset => (
                        <option key={preset.id} value={preset.id}>
                          {preset.icon} {preset.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <GalleryLayoutControls
                    layout={layout}
                    setLayout={setLayout}
                    cardSize={cardSize}
                    setCardSize={setCardSize}
                  />
                  <div className="relative">
                    <button
                      onClick={() => setPanelsDropdownOpen(!panelsDropdownOpen)}
                      className="h-7 px-1.5 text-xs inline-flex items-center gap-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                      title="Open panels"
                    >
                      <Icon name="layoutGrid" size={13} />
                      <span>Panels</span>
                      <Icon name="chevronDown" size={10} className={`transition-transform ${panelsDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <Dropdown
                      isOpen={panelsDropdownOpen}
                      onClose={() => setPanelsDropdownOpen(false)}
                      position="bottom-right"
                      minWidth="180px"
                    >
                      <DropdownItem
                        onClick={() => {
                          useWorkspaceStore.getState().openFloatingPanel('settings', { width: 900, height: 700 });
                          setPanelsDropdownOpen(false);
                        }}
                        icon={<IconBadge name="settings" size={12} variant="muted" />}
                      >
                        Settings
                      </DropdownItem>
                      <DropdownItem
                        onClick={() => {
                          useWorkspaceStore.getState().openFloatingPanel('generations', { width: 800, height: 600 });
                          setPanelsDropdownOpen(false);
                        }}
                        icon={<IconBadge name="sparkles" size={12} variant="success" />}
                      >
                        Generations
                      </DropdownItem>
                      <DropdownItem
                        onClick={() => {
                          useWorkspaceStore.getState().openFloatingPanel('providers', { width: 700, height: 500 });
                          setPanelsDropdownOpen(false);
                        }}
                        icon={<IconBadge name="plug" size={12} variant="info" />}
                      >
                        Providers
                      </DropdownItem>
                      <DropdownDivider />
                      <DropdownItem
                        onClick={() => {
                          useWorkspaceStore.getState().openFloatingPanel('dev-tools', { width: 800, height: 600 });
                          setPanelsDropdownOpen(false);
                        }}
                        icon={<IconBadge name="wrench" size={12} variant="warning" />}
                      >
                        Dev Tools
                      </DropdownItem>
                    </Dropdown>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (generationWsConnected) {
                        useWorkspaceStore.getState().openFloatingPanel('generations', { width: 800, height: 600 });
                      }
                    }}
                    className={`h-7 px-1.5 text-xs inline-flex items-center gap-1.5 rounded border transition-colors ${
                      generationWsConnected
                        ? 'border-green-500/30 bg-green-500/5 text-green-600 dark:text-green-400 hover:bg-green-500/10'
                        : 'border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
                    }`}
                    title={generationWsConnected ? 'Generation feed live - click to open' : 'Generation feed offline'}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${generationWsConnected ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
                    <span>{generationWsConnected ? 'Live' : 'Offline'}</span>
                  </button>
                </>
              }
            />
          </div>
        </AssetViewerLayout>
      </div>

      {/* Floating asset detail window - uses shared store */}
      <AssetDetailModal />

      {/* Related assets modal - "More from..." context menu */}
      <RelatedAssetsModal />

      {/* Delete confirmation modal */}
      {deleteModalAssets.length > 0 && (
        <DeleteAssetModal
          assets={deleteModalAssets}
          onConfirm={controller.confirmDeleteAsset}
          onCancel={closeDeleteModal}
        />
      )}
    </div>
  );
}
