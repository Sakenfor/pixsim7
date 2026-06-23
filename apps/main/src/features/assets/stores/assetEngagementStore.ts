/**
 * assetEngagementStore
 *
 * Frontend-only, per-device record of which assets the user has actually
 * *seen* and *played*. Feeds glanceable "already watched" cues in the Recent
 * strip (and anywhere else that wants them), which is especially useful for
 * the QuickGen probing workflow where the library fills with throwaway i2v
 * videos and the user needs to tell apart what they've already reviewed.
 *
 * Two signals, both fed off the shared `assetEvents` bus so this store stays
 * decoupled from the viewer store and the video registry (no import cycles):
 *   - "seen"   — the asset became the current viewed asset. Emitted on every
 *                navigation but **debounced** here, so flicking through the
 *                strip with the wheel only counts the asset you land on.
 *   - "played" — a video actually played past a short threshold (see
 *                `activeVideoRegistry`). Counts genuine watches, not hovers.
 *
 * Persisted to localStorage only — no backend sync. The map is soft-capped at
 * {@link MAX_ENTRIES}, evicting least-recently-touched entries so a large
 * probe library can't grow localStorage unbounded. See `stores-registry-canon`
 * and the sister read-side cue in `RecentStripPanel`.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { registerStore } from '@lib/stores';
import { hmrSingleton } from '@lib/utils';
import { exposeStoreForDebugging } from '@lib/utils/zustandPersist';

import { assetEvents } from '../lib/assetEvents';

/** localStorage key written by the persist middleware. */
export const ASSET_ENGAGEMENT_KEY = 'asset_engagement_v1';

/** Soft cap on tracked assets; least-recently-touched entries are evicted. */
const MAX_ENTRIES = 2000;

/** How long an asset must stay current before a "seen" is recorded (ms). */
const VIEW_DEBOUNCE_MS = 600;

export interface AssetEngagement {
  /** Times this asset settled as the current viewed asset (debounced). */
  views: number;
  /** Times a video for this asset started playing (past the watch threshold). */
  plays: number;
  /** Times a video for this asset played through to (near) the end. */
  completions: number;
  /** Epoch ms of the most recent view. */
  lastViewedAt?: number;
  /** Epoch ms of the most recent play. */
  lastPlayedAt?: number;
  /** Epoch ms of the most recent completion. */
  lastCompletedAt?: number;
}

interface AssetEngagementState {
  byId: Record<string, AssetEngagement>;
  recordView: (id: string | number) => void;
  recordPlay: (id: string | number) => void;
  recordCompletion: (id: string | number) => void;
  /** Wipe all engagement data. */
  clear: () => void;
}

/**
 * Drop least-recently-touched entries once the map exceeds the cap. Mutates a
 * shallow copy; recency is the max of last view/play so a recently-played but
 * long-ago-viewed asset still survives.
 */
const EMPTY: AssetEngagement = { views: 0, plays: 0, completions: 0 };

/**
 * Apply `update` to one asset's engagement (starting from zero if new) and
 * return the pruned `{ byId }` patch.
 */
function bump(
  byId: Record<string, AssetEngagement>,
  id: string | number,
  update: (prev: AssetEngagement) => AssetEngagement,
): { byId: Record<string, AssetEngagement> } {
  const key = String(id);
  const next = pruneToCapacity({ ...byId, [key]: update(byId[key] ?? EMPTY) });
  return { byId: next };
}

function pruneToCapacity(byId: Record<string, AssetEngagement>): Record<string, AssetEngagement> {
  const keys = Object.keys(byId);
  if (keys.length <= MAX_ENTRIES) return byId;
  const touched = (e: AssetEngagement) => Math.max(e.lastViewedAt ?? 0, e.lastPlayedAt ?? 0);
  const survivors = keys
    .sort((a, b) => touched(byId[b]) - touched(byId[a]))
    .slice(0, MAX_ENTRIES);
  const next: Record<string, AssetEngagement> = {};
  for (const k of survivors) next[k] = byId[k];
  return next;
}

export const useAssetEngagementStore = create<AssetEngagementState>()(
  persist(
    (set) => ({
      byId: {},
      recordView: (id) =>
        set((state) => bump(state.byId, id, (prev) => ({
          ...prev,
          views: prev.views + 1,
          lastViewedAt: Date.now(),
        }))),
      recordPlay: (id) =>
        set((state) => bump(state.byId, id, (prev) => ({
          ...prev,
          plays: prev.plays + 1,
          lastPlayedAt: Date.now(),
        }))),
      recordCompletion: (id) =>
        set((state) => bump(state.byId, id, (prev) => ({
          ...prev,
          completions: prev.completions + 1,
          lastCompletedAt: Date.now(),
        }))),
      clear: () => set({ byId: {} }),
    }),
    {
      name: ASSET_ENGAGEMENT_KEY,
      partialize: (state) => ({ byId: state.byId }),
    },
  ),
);

registerStore({ id: 'assets:engagement', key: ASSET_ENGAGEMENT_KEY });

/** Read one asset's engagement (undefined when never seen/played). */
export function useAssetEngagement(id: string | number | undefined): AssetEngagement | undefined {
  return useAssetEngagementStore((s) => (id == null ? undefined : s.byId[String(id)]));
}

// Feed the store off the shared event bus. Guarded by hmrSingleton so HMR
// re-evaluations don't stack duplicate subscriptions. "seen" is debounced to a
// single trailing record so wheel/arrow scroll-through doesn't inflate counts —
// only the asset the user actually lands on is counted.
hmrSingleton('assetEngagementStore:subscription', () => {
  let viewTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingId: string | number | null = null;

  assetEvents.subscribeToViews((id) => {
    pendingId = id;
    if (viewTimer) clearTimeout(viewTimer);
    viewTimer = setTimeout(() => {
      if (pendingId != null) useAssetEngagementStore.getState().recordView(pendingId);
      viewTimer = null;
      pendingId = null;
    }, VIEW_DEBOUNCE_MS);
  });

  assetEvents.subscribeToPlays((id) => {
    useAssetEngagementStore.getState().recordPlay(id);
  });

  assetEvents.subscribeToCompletions((id) => {
    useAssetEngagementStore.getState().recordCompletion(id);
  });

  return true; // sentinel
});

if (typeof window !== 'undefined') {
  exposeStoreForDebugging(useAssetEngagementStore, 'assetEngagement');
}
