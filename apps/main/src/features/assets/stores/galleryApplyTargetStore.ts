import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Max simultaneously-active add-target sets. The media-card badge stack collapses
 * to a count badge by default and scrolls when expanded past a small card, so
 * this can be generous without crowding.
 */
export const MAX_ACTIVE_TARGETS = 20;

interface GalleryApplyTargetState {
  /**
   * Manual asset sets used as quick-add targets while browsing. Each active
   * target renders its own toggle glyph on a media card's hover overlay.
   * Capped at {@link MAX_ACTIVE_TARGETS}; order is oldest-first (a 4th toggle
   * drops the oldest).
   */
  activeManualSetIds: number[];
  /** Set IDs whose assets are shown in the gallery (union). Empty = no filter. */
  filterSetIds: number[];
  /** Toggle a set's membership in the active-target list (cap-aware, drop-oldest). */
  toggleActiveTarget: (setId: number) => void;
  /** Replace the active-target list wholesale (clamped to the cap, deduped). */
  setActiveTargets: (setIds: number[]) => void;
  /** Drop every active target. */
  clearActiveTargets: () => void;
  toggleFilterSet: (setId: number) => void;
  clearFilterSets: () => void;
}

const clampTargets = (ids: number[]): number[] => {
  // Dedupe preserving order, then keep the most-recent MAX (oldest dropped).
  const seen = new Set<number>();
  const deduped = ids.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
  return deduped.slice(-MAX_ACTIVE_TARGETS);
};

export const useGalleryApplyTargetStore = create<GalleryApplyTargetState>()(
  persist(
    (set, get) => ({
      activeManualSetIds: [],
      filterSetIds: [],
      toggleActiveTarget: (setId) => {
        const cur = get().activeManualSetIds;
        const next = cur.includes(setId)
          ? cur.filter((id) => id !== setId)
          : clampTargets([...cur, setId]);
        set({ activeManualSetIds: next });
      },
      setActiveTargets: (setIds) => set({ activeManualSetIds: clampTargets(setIds) }),
      clearActiveTargets: () => set({ activeManualSetIds: [] }),
      toggleFilterSet: (setId) => {
        const cur = get().filterSetIds;
        const next = cur.includes(setId) ? cur.filter((id) => id !== setId) : [...cur, setId];
        set({ filterSetIds: next });
      },
      clearFilterSets: () => set({ filterSetIds: [] }),
    }),
    {
      name: 'pixsim7-gallery-apply-target',
      version: 1,
      // v0 stored a single `activeManualSetId?: number`; fold it into the array.
      migrate: (persisted: unknown, version: number): GalleryApplyTargetState => {
        const state = (persisted ?? {}) as Partial<GalleryApplyTargetState> & {
          activeManualSetId?: number;
        };
        if (version < 1) {
          const legacy = state.activeManualSetId;
          return {
            ...(state as GalleryApplyTargetState),
            activeManualSetIds: typeof legacy === 'number' ? [legacy] : [],
          };
        }
        return state as GalleryApplyTargetState;
      },
    },
  ),
);
