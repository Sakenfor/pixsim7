import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { registerStore } from '@lib/stores';

/**
 * Persisted UI preferences for the Signal Triage surface: which view (full grid
 * vs focused row strip), how many clips the row plays at once, and the active
 * score bucket. These are workflow ergonomics, not data — remembering them so a
 * reload drops you back where you were. Mirrors the lightweight persisted-store
 * pattern (see setBadgeExpansionStore); the key is owned in the store registry.
 */
const STORAGE_KEY = 'pixsim7-signal-triage-prefs';

export type TriageView = 'grid' | 'row';
export type TriageQueueId = 'broken' | 'borderline' | 'overridden';
/** Within the Reviewed (overridden) queue: show all decisions, only Keep, or only Flag. */
export type ReviewedFilter = 'all' | 'keep' | 'flag';

/** Row batch bounds — kept here so a persisted value can be clamped on read. */
export const ROW_BATCH_DEFAULT = 3;
export const ROW_BATCH_MIN = 1;
export const ROW_BATCH_MAX = 6;

interface TriagePrefsState {
  view: TriageView;
  rowSize: number;
  queue: TriageQueueId;
  reviewedFilter: ReviewedFilter;
  setView: (view: TriageView) => void;
  setRowSize: (rowSize: number) => void;
  setQueue: (queue: TriageQueueId) => void;
  setReviewedFilter: (reviewedFilter: ReviewedFilter) => void;
}

export const useTriagePrefsStore = create<TriagePrefsState>()(
  persist(
    (set) => ({
      view: 'grid',
      rowSize: ROW_BATCH_DEFAULT,
      queue: 'broken',
      reviewedFilter: 'all',
      setView: (view) => set({ view }),
      setRowSize: (rowSize) =>
        set({ rowSize: Math.min(ROW_BATCH_MAX, Math.max(ROW_BATCH_MIN, rowSize)) }),
      setQueue: (queue) => set({ queue }),
      setReviewedFilter: (reviewedFilter) => set({ reviewedFilter }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      // Defend against an out-of-range persisted rowSize (bounds could tighten).
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<TriagePrefsState>;
        return {
          ...current,
          ...p,
          rowSize: Math.min(ROW_BATCH_MAX, Math.max(ROW_BATCH_MIN, p.rowSize ?? ROW_BATCH_DEFAULT)),
        };
      },
    },
  ),
);

registerStore({ id: 'assets:signal-triage-prefs', key: STORAGE_KEY });
