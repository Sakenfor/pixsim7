/**
 * Asset Viewer Store
 *
 * Global state for the side-push asset viewer.
 * Works with both gallery (remote) and local folder assets.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ViewerMode = 'side' | 'fullscreen' | 'closed';

/**
 * Gallery quality mode for thumbnail/preview loading
 * - 'thumbnail': Always load 320px thumbnails (fastest, lowest quality)
 * - 'preview': Always load 800px previews (best quality, slower)
 * - 'auto': Load preview when available, fallback to thumbnail
 */
export type GalleryQualityMode = 'thumbnail' | 'preview' | 'auto';

export interface ViewerAsset {
  /** Unique identifier */
  id: string | number;
  /** Display name */
  name: string;
  /** Media type */
  type: 'image' | 'video';
  /** URL for display (thumbnail or full) */
  url: string;
  /** Full resolution URL (if different from url) */
  fullUrl?: string;
  /** Source context */
  source: 'gallery' | 'local';
  /** Link to the generation that created this asset (if any) */
  sourceGenerationId?: number;
  /** Additional metadata */
  metadata?: {
    description?: string;
    tags?: string[];
    size?: number;
    createdAt?: string;
    path?: string;
    providerId?: string;
    duration?: number;
  };
}

export interface ViewerSettings {
  /** Default mode when opening an asset */
  defaultMode: 'side' | 'fullscreen';
  /** Panel width as percentage (20-60) */
  panelWidth: number;
  /** Auto-play videos */
  autoPlayVideos: boolean;
  /** Show metadata by default */
  showMetadata: boolean;
  /** Loop videos */
  loopVideos: boolean;
  /** Gallery quality mode for thumbnail loading */
  qualityMode: GalleryQualityMode;
}

interface AssetViewerState {
  /** Currently viewed asset */
  currentAsset: ViewerAsset | null;
  /** Viewer mode */
  mode: ViewerMode;
  /** List of assets for navigation (from current context) */
  assetList: ViewerAsset[];
  /** Current index in asset list */
  currentIndex: number;
  /** Viewer settings */
  settings: ViewerSettings;
  /** Whether metadata panel is visible */
  showMetadata: boolean;

  // Actions
  /** Open viewer with an asset */
  openViewer: (asset: ViewerAsset, assetList?: ViewerAsset[]) => void;
  /** Close viewer */
  closeViewer: () => void;
  /** Set viewer mode */
  setMode: (mode: ViewerMode) => void;
  /** Toggle between side and fullscreen */
  toggleFullscreen: () => void;
  /** Navigate to previous asset */
  navigatePrev: () => void;
  /** Navigate to next asset */
  navigateNext: () => void;
  /** Navigate to specific index */
  navigateTo: (index: number) => void;
  /** Toggle metadata visibility */
  toggleMetadata: () => void;
  /** Update settings */
  updateSettings: (settings: Partial<ViewerSettings>) => void;
  /** Update asset list (for when list changes while viewing) */
  updateAssetList: (assetList: ViewerAsset[]) => void;
}

const defaultSettings: ViewerSettings = {
  defaultMode: 'side',
  panelWidth: 40,
  autoPlayVideos: true,
  showMetadata: false,
  loopVideos: true,
  qualityMode: 'auto',
};

export const useAssetViewerStore = create<AssetViewerState>()(
  persist(
    (set, get) => ({
      currentAsset: null,
      mode: 'closed',
      assetList: [],
      currentIndex: -1,
      settings: defaultSettings,
      showMetadata: false,

      openViewer: (asset, assetList) => {
        const { settings } = get();
        const list = assetList || [asset];
        const index = list.findIndex((a) => a.id === asset.id);

        set({
          currentAsset: asset,
          mode: settings.defaultMode,
          assetList: list,
          currentIndex: index >= 0 ? index : 0,
          showMetadata: settings.showMetadata,
        });
      },

      closeViewer: () => {
        set({
          currentAsset: null,
          mode: 'closed',
          assetList: [],
          currentIndex: -1,
        });
      },

      setMode: (mode) => {
        set({ mode });
      },

      toggleFullscreen: () => {
        const { mode } = get();
        set({ mode: mode === 'fullscreen' ? 'side' : 'fullscreen' });
      },

      navigatePrev: () => {
        const { assetList, currentIndex } = get();
        if (currentIndex > 0) {
          const newIndex = currentIndex - 1;
          set({
            currentIndex: newIndex,
            currentAsset: assetList[newIndex],
          });
        }
      },

      navigateNext: () => {
        const { assetList, currentIndex } = get();
        if (currentIndex < assetList.length - 1) {
          const newIndex = currentIndex + 1;
          set({
            currentIndex: newIndex,
            currentAsset: assetList[newIndex],
          });
        }
      },

      navigateTo: (index) => {
        const { assetList } = get();
        if (index >= 0 && index < assetList.length) {
          set({
            currentIndex: index,
            currentAsset: assetList[index],
          });
        }
      },

      toggleMetadata: () => {
        set((state) => ({ showMetadata: !state.showMetadata }));
      },

      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }));
      },

      updateAssetList: (assetList) => {
        const { currentAsset } = get();
        if (currentAsset) {
          const newIndex = assetList.findIndex((a) => a.id === currentAsset.id);
          set({
            assetList,
            currentIndex: newIndex >= 0 ? newIndex : 0,
          });
        } else {
          set({ assetList });
        }
      },
    }),
    {
      name: 'asset_viewer_v1',
      partialize: (state) => ({
        settings: state.settings,
      }),
    }
  )
);

// Selector helpers
export const selectIsViewerOpen = (state: AssetViewerState) => state.mode !== 'closed';
export const selectCanNavigatePrev = (state: AssetViewerState) => state.currentIndex > 0;
export const selectCanNavigateNext = (state: AssetViewerState) =>
  state.currentIndex < state.assetList.length - 1;
