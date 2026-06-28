/**
 * siblingCountsStore
 *
 * Transient, session-only cache of cohort/sibling counts keyed by asset id —
 * the data behind the top-left similarity badge ({@link createSimilarityBadge}).
 *
 * These counts used to ride on every asset response, but computing them ran ~7
 * GROUP BY queries per asset on the hot path (every asset:created/updated event
 * and thumbnail poll). The badge is hover-gated, so the counts are now fetched
 * lazily — on hover ({@link useSiblingCountRefresh}), on viewer focus, or on
 * touch-badge mount — from GET /assets/{id}/cohort-counts and parked here. The
 * badge subscribes by asset id and repaints when its entry lands.
 *
 * Intentionally NOT persisted (no localStorage, so it stays out of the
 * stores-registry-canon): it's derived, cheap to refetch, and would only go
 * stale. See plan `media-card-sibling-badges` and `siblingFacetStore` (the
 * persisted *lens* config, a separate concern).
 */
import { create } from 'zustand';

export type CohortCounts = Record<string, number>;

interface SiblingCountsState {
  /** asset id -> { combo: count }. A present (even empty) entry means "fetched". */
  counts: Map<number, CohortCounts>;
  /** Park the counts for one asset (replaces the Map so selectors re-fire). */
  set: (id: number, counts: CohortCounts) => void;
  /** True once this asset has been fetched (entry present, possibly empty). */
  has: (id: number) => boolean;
}

export const useSiblingCountsStore = create<SiblingCountsState>((set, get) => ({
  counts: new Map(),
  set: (id, counts) =>
    set((state) => {
      const next = new Map(state.counts);
      next.set(id, counts);
      return { counts: next };
    }),
  has: (id) => get().counts.has(id),
}));
