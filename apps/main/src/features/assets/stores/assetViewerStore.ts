/**
 * Asset Viewer Store
 *
 * Global state for the side-push asset viewer.
 * Works with both gallery (remote) and local folder assets.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { hmrSingleton } from '@lib/utils';

import { useAssetRegionStore, useAssetViewerOverlayStore, useCaptureRegionStore } from '@features/mediaViewer';

import { useMaskOverlayStore } from '@/components/media/viewer/overlays/builtins/maskOverlayStore';
import { isViewerZoomedIn } from '@/components/media/viewer/panels/viewerViewportStore';

import { isAnyVideoPlaying, isVideoPlayingAsset } from '../lib/activeVideoRegistry';
import { assetEvents } from '../lib/assetEvents';
import { viewerOpenEvents } from '../lib/viewerOpenEvents';
import { fromAssetResponse, isLikelyBroken } from '../models/asset';

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
  /**
   * Skip thumbnails/previews and load original source bytes for gallery cards.
   * Off by default — turning it on loads full-resolution images for every
   * visible card, which can lag the grid on large libraries.
   */
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
  /**
   * The user's INTENDED scope — set only by explicit selection (switchScope /
   * open-with-scope), persisted across reloads. Distinct from `activeScopeId`,
   * which must always point at a *registered* scope and may fall back during
   * startup churn. When the preferred scope (re)registers, it reclaims active —
   * so a refresh restores the user's choice instead of sticking on whichever
   * scope happened to register first. NOT cleared by fallbacks.
   */
  preferredScopeId: string | null;
  /** Head asset id that arrived while follow-latest was suppressed by active media interaction */
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
  /** Navigate to the asset by id in the latest active list */
  navigateToAssetId: (assetId: string | number) => void;
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

export function areScopeAssetsEquivalent(prev: ViewerAsset[], next: ViewerAsset[]): boolean {
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
      a.sourceGenerationId !== b.sourceGenerationId ||
      // Signal-quality fields drive the recent strip's red "likely broken"
      // outline AND gate auto-follow (below). They land in a LATER update event
      // than the asset itself (analysis runs after derivatives), so they must
      // count as a change here — otherwise the scope keeps the stale model and
      // neither the outline nor the follow-latest broken-gate ever sees them.
      a._assetModel?.signalScore !== b._assetModel?.signalScore ||
      a._assetModel?.signalSuspicious !== b._assetModel?.signalSuspicious ||
      a._assetModel?.signalOverride !== b._assetModel?.signalOverride
    ) {
      return false;
    }
  }

  return true;
}

function shouldSuppressFollowLatest(): boolean {
  const videoPlaying = isAnyVideoPlaying();
  const zoomedIn = isViewerZoomedIn();
  const overlayMode = useAssetViewerOverlayStore.getState().overlayMode;
  const overlayActive = overlayMode !== 'none';
  const annotating = overlayMode === 'annotate' && useAssetRegionStore.getState().drawingMode !== 'select';
  const capturing = overlayMode === 'capture' && useCaptureRegionStore.getState().drawingMode !== 'select';
  const maskState = useMaskOverlayStore.getState();
  const masking = overlayMode === 'mask' && maskState.mode !== 'view';
  const maskSaving = maskState.isSaving;

  return videoPlaying || zoomedIn || overlayActive || annotating || capturing || masking || maskSaving;
}

/**
 * Auto-follow debounce.
 *
 * Under follow-latest, each newly-prepended head normally swaps `currentAsset`
 * immediately — which remounts the `key={asset.id}` autoPlay <video> and spins
 * up a fresh GPU/native decoder. During a rapid generation burst that mounts
 * (and orphans) one decoder per arrival, and Chrome reclaims them lazily, so
 * native memory balloons far beyond anything the JS heap reports.
 *
 * Instead we coalesce: anchor on the asset the user is parked on, reset a short
 * settle timer on every fresh head, and perform a SINGLE swap to the newest
 * head once arrivals quiet. A 30-clip burst becomes one decoder mount.
 *
 * Module-level + `hmrSingleton` so the in-flight timer survives HMR re-evals
 * (mirrors the store's own subscription guard below).
 */
const FOLLOW_SETTLE_MS = 300;
// Broken-gate (option A): a freshly-landed video's "likely broken" verdict
// arrives in a later update event than the clip (signal analysis runs after
// derivatives). Rather than autoplay-then-flag, hold the auto-follow swap until
// the verdict resolves — polling the head's model — so a flagged clip never
// steals the viewer. Capped so an analysis that never lands still follows.
const FOLLOW_SIGNAL_MAX_WAIT_MS = 2000;
const FOLLOW_SIGNAL_POLL_MS = 200;
const followDebounce = hmrSingleton<{
  timer: ReturnType<typeof setTimeout> | null;
  anchorId: string | number | null;
  // Absolute deadline (ms epoch) for the broken-verdict wait on the current
  // head; null when not waiting. Reset whenever a new head arrives.
  signalWaitUntil: number | null;
}>('assetViewerStore:followDebounce', () => ({
  timer: null,
  anchorId: null,
  signalWaitUntil: null,
}));

function cancelFollowDebounce(): void {
  if (followDebounce.timer != null) {
    clearTimeout(followDebounce.timer);
    followDebounce.timer = null;
  }
  followDebounce.anchorId = null;
  followDebounce.signalWaitUntil = null;
}

/**
 * Auto-follow broken-gate verdict for a candidate head:
 *  - 'broken'  → manually flagged or heuristic-suspicious; never auto-follow it.
 *  - 'pending' → a video whose signal analysis hasn't resolved yet; wait.
 *  - 'clean'   → analyzed-clean, a non-video, or no model to judge; follow.
 */
function classifyHead(asset: ViewerAsset): 'clean' | 'broken' | 'pending' {
  const model = asset._assetModel;
  if (!model) return 'clean';
  if (isLikelyBroken(model)) return 'broken';
  if (asset.type === 'video' && model.signalScore == null && model.signalOverride == null) {
    return 'pending';
  }
  return 'clean';
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
      preferredScopeId: null,
      pendingHeadId: null,

      openViewer: (asset, assetList, scopeId) => {
        const { settings, scopes: prevScopes, activeScopeId: prevActiveId } = get();
        const list = assetList || [asset];

        viewerOpenEvents.emit(asset);
        // Deliberate open → engagement "seen". (Auto-follow / rehydration set
        // currentAsset elsewhere and intentionally do NOT count.)
        assetEvents.emitAssetViewed(asset.id);

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

        // Merge so app-level scopes (Recent, History) survive open-while-open.
        const nextScopes: Record<string, NavigationScope> = { ...prevScopes };
        let nextActiveId: string | null = prevActiveId;
        if (scopeId) {
          nextScopes[scopeId] = { label: nextScopes[scopeId]?.label ?? scopeId, assets: list };
          nextActiveId = scopeId;
        }

        const index = list.findIndex((a) => a.id === asset.id);
        set({
          currentAsset: asset,
          mode: settings.defaultMode,
          assetList: list,
          currentIndex: index >= 0 ? index : 0,
          showMetadata: settings.showMetadata,
          scopes: nextScopes,
          activeScopeId: nextActiveId,
          // Opening explicitly into a scope is a user choice — make it the
          // sticky preference so a later refresh restores it.
          ...(scopeId ? { preferredScopeId: scopeId } : {}),
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
          assetEvents.emitAssetViewed(list[newIndex].id);
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
          assetEvents.emitAssetViewed(list[newIndex].id);
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
          assetEvents.emitAssetViewed(next.id);
        }
      },

      navigateToAssetId: (assetId) => {
        const { scopes, activeScopeId, assetList, pendingHeadId } = get();
        const list = (activeScopeId && scopes[activeScopeId]?.assets) || assetList;
        const index = list.findIndex((asset) => asset.id === assetId);
        if (index < 0) return;
        const next = list[index];
        const clearsPending = pendingHeadId != null && next.id === pendingHeadId;
        set({
          assetList: list,
          currentIndex: index,
          currentAsset: next,
          ...(clearsPending ? { pendingHeadId: null } : null),
        });
        assetEvents.emitAssetViewed(next.id);
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
        const { scopes, activeScopeId, currentAsset, settings, preferredScopeId } = get();
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
            // `oldHead !== undefined` restricts this to genuine incremental
            // arrivals (a prior head existed). First-time scope hydration has
            // no prior head — it isn't a "new arrival" and must fall through to
            // the refresh path rather than steal/pulse on mere rehydration.
            if (
              settings.followLatest &&
              oldHead !== undefined &&
              oldHead !== newHead &&
              newHead !== undefined
            ) {
              // Commit the fresh list right away and flag the new head as
              // pending so the recent strip pulses immediately. The actual
              // viewer swap (which remounts the <video> + spins up a decoder)
              // is deferred below so a burst doesn't churn one decoder per clip.
              set({
                scopes: { ...scopes, [id]: { label, assets } },
                pendingHeadId: newHead,
              });

              // Auto-follow only applies when the user is parked on the head.
              // If they've deliberately navigated away to inspect an earlier
              // asset (strip click, wheel, prev/next), a freshly-landed video
              // may not have reached readyState>=2 yet — so `shouldSuppress…`
              // can't see it as "playing" and would happily rip the viewer
              // onto the new head. Treat being off-head as an explicit "don't
              // follow" and just leave it pending. `anchorId` keeps this true
              // through a coalesced burst, where `currentAsset` stays parked on
              // the pre-burst head while later arrivals advance `oldHead`.
              const userParkedOnHead =
                currentAsset.id === oldHead || currentAsset.id === followDebounce.anchorId;
              // Also suppress while the user is actively engaged with media
              // (playback/zoom/overlay editing) — the strip pulse already
              // signals the arrival without stealing the viewer.
              if (!userParkedOnHead || shouldSuppressFollowLatest()) {
                cancelFollowDebounce();
                return;
              }

              // Coalesce: anchor on what the user is parked on, reset the settle
              // timer on every fresh head, and swap once arrivals quiet. A new
              // head means a new broken-verdict to wait on, so reset the wait
              // deadline too.
              if (followDebounce.anchorId == null) {
                followDebounce.anchorId = currentAsset.id;
              }
              if (followDebounce.timer != null) clearTimeout(followDebounce.timer);
              followDebounce.signalWaitUntil = null;

              // Re-entrant: the broken-gate may re-schedule this to poll for the
              // head's signal verdict (see classifyHead) up to the max-wait.
              const attemptFollowSwap = (): void => {
                followDebounce.timer = null;
                const anchorId = followDebounce.anchorId;

                const st = get();
                const scope = st.activeScopeId ? st.scopes[st.activeScopeId] : undefined;
                const head = scope?.assets[0];
                // Bail if the world moved under us during the settle window:
                // follow-latest turned off, the user navigated away (currentAsset
                // no longer the anchor), or they started playing/zooming/editing.
                if (
                  !head ||
                  !st.settings.followLatest ||
                  st.currentAsset?.id !== anchorId ||
                  shouldSuppressFollowLatest()
                ) {
                  cancelFollowDebounce();
                  return;
                }

                const verdict = classifyHead(head);
                if (verdict === 'pending') {
                  // Broken-check hasn't resolved — hold the swap and poll the
                  // head's model until it lands or we exhaust the max-wait.
                  if (followDebounce.signalWaitUntil == null) {
                    followDebounce.signalWaitUntil = Date.now() + FOLLOW_SIGNAL_MAX_WAIT_MS;
                  }
                  if (Date.now() < followDebounce.signalWaitUntil) {
                    followDebounce.timer = setTimeout(attemptFollowSwap, FOLLOW_SIGNAL_POLL_MS);
                    return;
                  }
                  // Timed out waiting — follow on whatever we have (treat clean).
                }

                cancelFollowDebounce();
                if (verdict === 'broken') {
                  // Option A: a flagged clip never steals the viewer. Leave it as
                  // the pending head so the strip keeps its red outline + pulse;
                  // the user opts in by clicking the thumb.
                  return;
                }
                set({
                  assetList: scope.assets,
                  currentIndex: 0,
                  currentAsset: head,
                  pendingHeadId: null,
                });
              };
              followDebounce.timer = setTimeout(attemptFollowSwap, FOLLOW_SETTLE_MS);
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

            const preservePlayingVideoSource =
              refreshed !== undefined &&
              currentAsset.type === 'video' &&
              refreshed.type === 'video' &&
              isVideoPlayingAsset(currentAsset.id);

            const nextCurrentAsset =
              refreshed && preservePlayingVideoSource
                ? {
                  ...refreshed,
                  // New assets can flip from provider URL -> local stored URL
                  // shortly after landing. Keep the currently-playing source
                  // stable so the <video> element doesn't restart mid-playback.
                  url: currentAsset.url,
                  fullUrl: currentAsset.fullUrl,
                }
                : refreshed;

            set({
              ...(scopeChanged ? { scopes: { ...scopes, [id]: { label, assets } } } : {}),
              ...(currentAssetChanged ? { currentAsset: nextCurrentAsset } : {}),
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

        // Claim active when (a) nothing is active yet, or (b) this scope is the
        // user's preferred one re-registering after startup churn handed active
        // to a fallback. (b) is what makes a refresh snap back to the chosen
        // scope (e.g. Recent) instead of sticking on whatever registered first.
        if (activeScopeId !== id && (!activeScopeId || id === preferredScopeId)) {
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
        const { scopes, activeScopeId, preferredScopeId } = get();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [id]: _removed, ...remaining } = scopes;
        const updates: Partial<AssetViewerState> = { scopes: remaining };

        if (id === activeScopeId) {
          const remainingIds = Object.keys(remaining);
          if (remainingIds.length > 0) {
            // Prefer the user's intended scope if it's still around; else fall
            // back to the first remaining. (Avoids clobbering the choice when a
            // transient scope unregisters mid-session.)
            const fallbackId =
              preferredScopeId && remaining[preferredScopeId] ? preferredScopeId : remainingIds[0];
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
          // Explicit user pick → sticky preference (survives refresh + reclaims
          // on re-register).
          preferredScopeId: id,
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
        // Persist the user's PREFERRED scope (not the live activeScopeId, which
        // can fall back during startup churn). On reload, activeScopeId starts
        // null and the preferred scope reclaims active as soon as it
        // re-registers — so the user's choice survives a refresh.
        preferredScopeId: state.preferredScopeId,
        // Note: assetList, currentIndex, and scopes are not
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

// Self-subscribe to asset events so the viewer's `currentAsset._assetModel`
// refreshes regardless of which scope is active. Without this, surfaces fed
// from sources that don't subscribe to `assetEvents` (search pickers,
// ad-hoc selections) would keep stale tags — toggling favorite from the
// viewer wouldn't visually flip the heart because `useOverlayWidgetsForAsset`
// only rebuilds when the asset reference changes.
//
// `hmrSingleton` guard prevents duplicate subscriptions across HMR
// re-evaluations. Mirrors the pattern used by `generationInputStore`.
hmrSingleton('assetViewerStore:subscription', () => {
  assetEvents.subscribeToUpdates((response) => {
    const { currentAsset } = useAssetViewerStore.getState();
    if (!currentAsset || currentAsset.id !== response.id) return;
    useAssetViewerStore.setState({
      currentAsset: { ...currentAsset, _assetModel: fromAssetResponse(response) },
    });
  });
  return true; // sentinel
});
