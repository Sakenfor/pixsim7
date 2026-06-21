import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { registerStore } from '@lib/stores';

/**
 * "Recently added-to" recency for asset sets.
 *
 * Stamps the wall-clock time each set last had an asset added to it (any add
 * path — the media-card toggle glyph and the bulk "apply to set" action all
 * funnel through {@link useAssetSetStore.addAssetsToSet}, which is the single
 * place that calls {@link markAdded}). The active-target set badges on a media
 * card read this to float the sets you've been adding to to the front of the
 * row (and to pick which glyphs to preview while collapsed) — see
 * {@link buildActiveTargetWidgets}.
 *
 * This is a pure *display* signal: it does not touch the active-target list,
 * its cap, or eviction order in {@link useGalleryApplyTargetStore}.
 */
const STORAGE_KEY = 'pixsim7-set-add-recency';

interface SetAddRecencyState {
  /** Wall-clock ms of the last add into each set, keyed by set id. */
  lastAddedAt: Record<number, number>;
  /** Stamp `now` against each set id (called after a successful add). */
  markAdded: (setIds: number[]) => void;
}

export const useSetAddRecencyStore = create<SetAddRecencyState>()(
  persist(
    (set) => ({
      lastAddedAt: {},
      markAdded: (setIds) =>
        set((s) => {
          if (setIds.length === 0) return s;
          const now = Date.now();
          const next = { ...s.lastAddedAt };
          for (const id of setIds) next[id] = now;
          return { lastAddedAt: next };
        }),
    }),
    { name: STORAGE_KEY, version: 1 },
  ),
);

/**
 * Order `sets` most-recently-added-to first. Sets never added to (no timestamp)
 * sort to the back and keep their input order among themselves, so an empty
 * recency map is a no-op that preserves the caller's ordering.
 */
export function sortByAddRecency<T extends { id: number }>(
  sets: T[],
  lastAddedAt: Record<number, number>,
): T[] {
  return [...sets].sort((a, b) => (lastAddedAt[b.id] ?? 0) - (lastAddedAt[a.id] ?? 0));
}

registerStore({ id: 'assets:set-add-recency', key: STORAGE_KEY });
