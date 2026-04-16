/**
 * Asset Viewer Store
 *
 * Global state for the side-push asset viewer.
 * Works with both gallery (remote) and local folder assets.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { isAnyVideoPlaying } from '../lib/activeVideoRegistry';

export type ViewerMode = 'side' | 'fullscreen' | 'closed';

/**
 * Gallery quality mode for thumbnail/preview loading
 * - 'thumbnail': Always load 320px thumbnails (fastest, lowest quality)
 * - 'preview': Always load 800px previews (best quality, slower)
 * - 'auto': Load preview when available, fallback to thumbnail
 */
export type GalleryQualityMode = 'thumbnail' | 'preview' | 'auto';

export interface NavigationScope {
  label: string;
  assets: ViewerAsset[];
}

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
  /** True when asset has generation context (from record or metadata) */
  hasGenerationContext?: boolean;
  /** Full AssetModel for overlay widgets (gallery source only, not persisted) */
  _assetModel?: import('../models/asset').AssetModel;
  /** Additional metadata */
  metadata?: {
    description?: string;
    tags?: string[];
    size?: number;
    createdAt?: string;
    path?: string;
    /** Backend asset id when this local viewer asset is linked to a saved library/provider asset */
    assetId?: number;
    providerId?: string;
    duration?: number;
    folderId?: string;
    folderName?: string;
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
  /** Use original source instead of generated thumbnails/previews (for large display sizes) */
  preferOriginal: boolean;
  /** Auto-navigate to newest asset when scope head changes */
  followLatest: boolean;
  /**
   * When true, opening an asset from a different context (e.g. clicking a
   * gallery thumbnail while viewing from Recent) preserves the current
   * activeScopeId so the strip doesn't flip out from under the user.
   */
  scopeLocked: boolean;
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
  /** Registered navigation scopes */
  scopes: Record<string, NavigationScope>;
  /** Currently active scope id */
  activeScopeId: string | null;
  /** Head asset id that arrived while follow-latest was suppressed (e.g. video playing) */
  pendingHeadId: string | number | null;

  // Actions
  /** Open viewer with an asset, optionally setting the initial scope */
  openViewer: (asset: ViewerAsset, assetList?: ViewerAsset[], scopeId?: string) => void;
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
  /** Register a navigation scope (upserts). If active scope, syncs assetList. */
  registerScope: (id: string, label: string, assets: ViewerAsset[]) => void;
  /** Unregister a navigation scope. Falls back to first remaining if active. */
  unregisterScope: (id: string) => void;
  /** Switch to a different scope, swapping assetList and preserving position. */
  switchScope: (id: string) => void;
  /** Jump to the pending head asset if any and clear the pending marker. */
  consumePendingHead: () => void;
  /** Clear the pending head marker without navigating. */
  clearPendingHead: () => void;
}

const defaultSettings: ViewerSettings = {
  defaultMode: 'side',
  panelWidth: 40,
  autoPlayVideos: true,
  showMetadata: false,
  loopVideos: true,
  qualityMode: 'auto',
  preferOriginal: false,
  followLatest: true,
  scopeLocked: false,
};

function areScopeAssetsEquivalent(prev: ViewerAsset[], next: ViewerAsset[]): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;

  for (let i = 0; i < prev.length; i += 1) {
    const a = prev[i];
    const b = next[i];
    if (
      a.id !== b.id ||
      a.url !== b.url ||
      a.fullUrl !== b.fullUrl ||
      a.name !== b.name ||
      a.type !== b.type ||
      a.source !== b.source ||
      a.sourceGenerationId !== b.sourceGenerationId
    ) {
      return false;
    }
  }

  return true;
}

export const useAssetViewerStore = create<AssetViewerState>()(
  persist(
    (set, get) => ({
      currentAsset: null,
      mode: 'closed',
      assetList: [],
      currentIndex: -1,
      settings: defaultSettings,
      showMetadata: false,
      scopes: {},
      activeScopeId: null,
      pendingHeadId: null,

      openViewer: (asset, assetList, scopeId) => {
        const { settings, scopes: prevScopes, activeScopeId: prevActiveId } = get();
        const list = assetList || [asset];

        // Lock-respecting branch: when scope is locked and we already have an
        // active scope, don't swap scope out from under the user. Register the
        // incoming scope so it's available in the picker, but keep navigation
        // anchored to whatever the user locked to.
        if (settings.scopeLocked && prevActiveId && prevScopes[prevActiveId]) {
          const activeAssets = prevScopes[prevActiveId].assets;
          const idxInActive = activeAssets.findIndex((a) => a.id === asset.id);
          const nextScopes =
            scopeId && !prevScopes[scopeId]
              ? { ...prevScopes, [scopeId]: { label: scopeId, assets: list } }
              : prevScopes;

          set({
            currentAsset: asset,
            mode: settings.defaultMode,
            assetList: activeAssets,
            currentIndex: idxInActive,
            showMetadata: settings.showMetadata,
            scopes: nextScopes,
          });
          return;
        }

        const initialScopes: Record<string, NavigationScope> = {};
        let initialScopeId: string | null = null;
        if (scopeId) {
          initialScopes[scopeId] = { label: scopeId, assets: list };
          initialScopeId = scopeId;
        }

        const index = list.findIndex((a) => a.id === asset.id);
        set({
          currentAsset: asset,
          mode: settings.defaultMode,
          assetList: list,
          currentIndex: index >= 0 ? index : 0,
          showMetadata: settings.showMetadata,
          scopes: initialScopes,
          activeScopeId: initialScopeId,
        });
      },

      closeViewer: () => {
        set({
          currentAsset: null,
          mode: 'closed',
          assetList: [],
          currentIndex: -1,
          scopes: {},
          activeScopeId: null,
          pendingHeadId: null,
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
        const { scopes, activeScopeId, assetList, currentAsset } = get();
        // Use the active scope's list (may be fresher than the top-level assetList)
        const list = (activeScopeId && scopes[activeScopeId]?.assets) || assetList;
        const idx = currentAsset ? list.findIndex((a) => a.id === currentAsset.id) : 0;
        const currentIdx = idx >= 0 ? idx : 0;
        if (currentIdx > 0) {
          const newIndex = currentIdx - 1;
          set({
            assetList: list,
            currentIndex: newIndex,
            currentAsset: list[newIndex],
          });
        }
      },

      navigateNext: () => {
        const { scopes, activeScopeId, assetList, currentAsset } = get();
        // Use the active scope's list (may be fresher than the top-level assetList)
        const list = (activeScopeId && scopes[activeScopeId]?.assets) || assetList;
        const idx = currentAsset ? list.findIndex((a) => a.id === currentAsset.id) : 0;
        const currentIdx = idx >= 0 ? idx : 0;
        if (currentIdx < list.length - 1) {
          const newIndex = currentIdx + 1;
          set({
            assetList: list,
            currentIndex: newIndex,
            currentAsset: list[newIndex],
          });
        }
      },

      navigateTo: (index) => {
        const { scopes, activeScopeId, assetList, pendingHeadId } = get();
        const list = (activeScopeId && scopes[activeScopeId]?.assets) || assetList;
        if (index >= 0 && index < list.length) {
          const next = list[index];
          const clearsPending = pendingHeadId != null && next.id === pendingHeadId;
          set({
            assetList: list,
            currentIndex: index,
            currentAsset: next,
            ...(clearsPending ? { pendingHeadId: null } : null),
          });
        }
      },

      consumePendingHead: () => {
        const { scopes, activeScopeId, pendingHeadId } = get();
        if (pendingHeadId == null) return;
        const list = (activeScopeId && scopes[activeScopeId]?.assets) || [];
        const idx = list.findIndex((a) => a.id === pendingHeadId);
        if (idx < 0) {
          set({ pendingHeadId: null });
          return;
        }
        set({
          assetList: list,
          currentIndex: idx,
          currentAsset: list[idx],
          pendingHeadId: null,
        });
      },

      clearPendingHead: () => {
        if (get().pendingHeadId == null) return;
        set({ pendingHeadId: null });
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

      registerScope: (id, label, assets) => {
        const { scopes, activeScopeId, currentAsset, settings } = get();
        const isActiveScope = id === activeScopeId;
        const previousScope = scopes[id];
        const scopeChanged =
          !previousScope ||
          previousScope.label !== label ||
          !areScopeAssetsEquivalent(previousScope.assets, assets);

        // Fast-path: when the active scope's list changes but the currently
        // viewed asset is still present, only update the scope registry.
        // This prevents viewer/quickgen re-renders when the gallery prepends
        // a new asset that doesn't affect the currently displayed item.
        // Navigation (prev/next) lazily reads the fresh list from the scope.
        if (isActiveScope && currentAsset) {
          const stillPresent = assets.some((a) => a.id === currentAsset.id);
          if (stillPresent) {
            // Auto-follow: when the head asset changes (new item prepended)
            // and followLatest is on, navigate to the new head.
            const oldHead = previousScope?.assets[0]?.id;
            const newHead = assets[0]?.id;
            if (settings.followLatest && oldHead !== newHead && newHead !== undefined) {
              // Suppress auto-follow if the user is mid-playback — stash the new
              // head as "pending" so the recent strip can flag it instead of
              // ripping the viewer off the current asset.
              if (isAnyVideoPlaying()) {
                set({
                  scopes: { ...scopes, [id]: { label, assets } },
                  pendingHeadId: newHead,
                });
                return;
              }
              set({
                scopes: { ...scopes, [id]: { label, assets } },
                assetList: assets,
                currentIndex: 0,
                currentAsset: assets[0],
                pendingHeadId: null,
              });
              return;
            }

            // Refresh currentAsset from the updated scope list so in-place
            // mutations (favorite toggle, tag changes) propagate to the viewer.
            // `areScopeAssetsEquivalent` ignores tags/`_assetModel` identity,
            // so scopeChanged can be false even when the backing AssetModel
            // changed — check the current asset's underlying model separately.
            const refreshed = assets.find((a) => a.id === currentAsset.id);
            const currentAssetChanged =
              refreshed !== undefined &&
              (refreshed === currentAsset
                ? false
                : refreshed._assetModel !== currentAsset._assetModel);

            if (!scopeChanged && !currentAssetChanged) return;

            set({
              ...(scopeChanged ? { scopes: { ...scopes, [id]: { label, assets } } } : {}),
              ...(currentAssetChanged ? { currentAsset: refreshed } : {}),
            });
            return;
          }
        }

        const updates: Partial<AssetViewerState> = {};
        if (scopeChanged) {
          updates.scopes = { ...scopes, [id]: { label, assets } };
        }

        // If this is the active scope, sync the asset list
        if (isActiveScope) {
          updates.assetList = assets;
          if (currentAsset) {
            const idx = assets.findIndex((a) => a.id === currentAsset.id);
            updates.currentIndex = idx >= 0 ? idx : 0;
          }
        }

        // If no active scope yet, activate this one
        if (!activeScopeId) {
          updates.activeScopeId = id;
          updates.assetList = assets;
          if (currentAsset) {
            const idx = assets.findIndex((a) => a.id === currentAsset.id);
            updates.currentIndex = idx >= 0 ? idx : 0;
          }
        }

        if (Object.keys(updates).length === 0) return;

        set(updates);
      },

      unregisterScope: (id) => {
        const { scopes, activeScopeId } = get();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [id]: _removed, ...remaining } = scopes;
        const updates: Partial<AssetViewerState> = { scopes: remaining };

        if (id === activeScopeId) {
          const remainingIds = Object.keys(remaining);
          if (remainingIds.length > 0) {
            const fallbackId = remainingIds[0];
            const fallbackScope = remaining[fallbackId];
            updates.activeScopeId = fallbackId;
            updates.assetList = fallbackScope.assets;
            const { currentAsset } = get();
            if (currentAsset) {
              const idx = fallbackScope.assets.findIndex((a) => a.id === currentAsset.id);
              updates.currentIndex = idx >= 0 ? idx : 0;
            }
          } else {
            updates.activeScopeId = null;
            // Keep current assetList as-is when no scopes remain
          }
        }

        set(updates);
      },

      switchScope: (id) => {
        const { scopes, currentAsset } = get();
        const scope = scopes[id];
        if (!scope) return;

        const updates: Partial<AssetViewerState> = {
          activeScopeId: id,
          assetList: scope.assets,
        };

        if (currentAsset) {
          const idx = scope.assets.findIndex((a) => a.id === currentAsset.id);
          if (idx >= 0) {
            updates.currentIndex = idx;
          } else {
            // Current asset not in new scope — jump to first asset
            updates.currentIndex = 0;
            if (scope.assets.length > 0) {
              updates.currentAsset = scope.assets[0];
            }
          }
        }

        set(updates);
      },
    }),
    {
      name: 'asset_viewer_v2',
      partialize: (state) => ({
        settings: state.settings,
        // Strip _assetModel from currentAsset before persisting (large, non-serializable)
        currentAsset: state.currentAsset
          ? { ...state.currentAsset, _assetModel: undefined }
          : state.currentAsset,
        mode: state.mode,
        showMetadata: state.showMetadata,
        // Note: assetList, currentIndex, scopes, and activeScopeId are not
        // persisted as the list can be large. Navigation context is
        // reconstructed when the user interacts with the gallery again.
      }),
    }
  )
);

// Selector helpers
export const selectIsViewerOpen = (state: AssetViewerState) => state.mode !== 'closed';
export const selectCanNavigatePrev = (state: AssetViewerState) => state.currentIndex > 0;
export const selectCanNavigateNext = (state: AssetViewerState) =>
  state.currentIndex < state.assetList.length - 1;
