/**
 * useAroundTimeScope
 *
 * "Around this time" media-viewer navigation scope: a ±N window of assets
 * ordered by `created_at` centered on whatever the viewer currently shows.
 *
 * A thin `createCohortScope` instantiation — all the pivot-anchoring,
 * re-anchor-on-leave, caching and registration mechanics live in the factory.
 * This file only owns the cohort definition: the time-window fetch.
 *
 * Option A of plan `viewer-around-time-scope` (sub-plan of
 * `media-card-surface`): a materialized snapshot. Option B (lazy edge paging)
 * would slot in behind `createCohortScope` without touching this file's shape.
 *
 * Must be mounted exactly once at app level (singleton constraint inherited
 * from `createCohortScope`).
 */

import { listAssets } from '@lib/api/assets';

import { fromAssetResponses, type AssetModel } from '../models/asset';

import { createCohortScope } from './createCohortScope';

/** Neighbors fetched on each side of the pivot. Window caps at 2·WINDOW + 1. */
const WINDOW = 50;

/**
 * Pull a ±WINDOW slice ordered ascending by `created_at` centered on `pivot`.
 * Two directional queries (mirrors `useAssetSequence.fetchDirection`): the
 * server sort default doesn't guarantee "closest to the pivot", so we fetch
 * `desc` below + `asc` above and sort client-side as defence-in-depth.
 */
async function fetchTimeWindow(pivot: AssetModel): Promise<AssetModel[]> {
  const base = {
    filters: { media_type: [pivot.mediaType] },
    sort_by: 'created_at' as const,
    limit: WINDOW + 1,
  };
  const [prevRes, nextRes] = await Promise.all([
    listAssets({ ...base, sort_dir: 'desc' as const, created_to: pivot.createdAt }),
    listAssets({ ...base, sort_dir: 'asc' as const, created_from: pivot.createdAt }),
  ]);

  const prev = fromAssetResponses(prevRes.assets).filter((a) => a.id !== pivot.id);
  const next = fromAssetResponses(nextRes.assets).filter((a) => a.id !== pivot.id);
  // `created_from/to` are inclusive boundaries; sort client-side so ties and
  // boundary surprises can't scramble the window order.
  prev.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // prev came back closest-first (desc); reverse so the window reads oldest →
  // pivot → newest, matching how chevrons/swipe walk a scope list.
  const prevAsc = prev.slice(0, WINDOW).reverse();
  const nextAsc = next.slice(0, WINDOW);

  return [...prevAsc, pivot, ...nextAsc];
}

export const useAroundTimeScope = createCohortScope({
  scopeId: 'around-time',
  cacheKey: 'viewer:aroundTimeScopeCache',
  label: (n) => `Around this time (${n})`,
  fetchCohort: fetchTimeWindow,
});
