/**
 * createCohortScope
 *
 * Factory for *pivot-anchored* media-viewer navigation scopes.
 *
 * Unlike `createCachedScopeHook` (Recent / History / Probes — event-fed
 * accumulating caches), a cohort scope materializes an ordered set of assets
 * *around the asset the viewer currently shows*, so the existing bottom-bar
 * chevrons / swipe / scope-switcher walk that cohort — no separate affordance.
 *
 * What varies per cohort is only the membership + ordering, expressed as one
 * `fetchCohort(pivot)` that returns the ordered (ascending) `AssetModel[]`
 * *including the pivot*. The factory owns everything generic:
 *   - an hmrSingleton cache `{ assets, idSet, version }`
 *   - the re-anchor rule: refetch only when the pivot is NOT already in the
 *     materialized cohort. Navigating *within* the scope keeps it stable —
 *     the pivot stays in `idSet`, the effect early-returns, the snapshot ref
 *     is unchanged, and `registerScope`'s fast-path no-ops on equivalent
 *     assets, so the cohort doesn't reset under the user mid-walk.
 *   - registration via `useViewerScopeSync`, gated on viewer-open && >1 item
 *
 * Option A of plan `viewer-around-time-scope`: a materialized snapshot.
 * Option B (a lazy/dynamic provider that pages in members at the edges) is a
 * possible follow-up and would live behind this same factory seam.
 *
 * The returned hook MUST be mounted exactly once at app level — same
 * singleton constraint as `useRecentScope` / `useHistoryScope`.
 */

import { useEffect, useMemo, useState } from 'react';

import { hmrSingleton } from '@lib/utils';

import { toViewerAsset, type AssetModel } from '../models/asset';
import {
  useAssetViewerStore,
  selectIsViewerOpen,
  type ViewerAsset,
} from '../stores/assetViewerStore';

import { useViewerScopeSync } from './useAssetViewer';

export interface CohortScopeOptions {
  /** Scope id / dropdown key passed to `useViewerScopeSync`. */
  scopeId: string;
  /** hmrSingleton cache key. Pick a unique string per cohort. */
  cacheKey: string;
  /** Label builder; receives the materialized cohort size. */
  label: (count: number) => string;
  /**
   * Resolve the ordered cohort (ascending — oldest → pivot → newest, matching
   * how chevrons/swipe walk a scope list) for a pivot, INCLUDING the pivot.
   * Return `[]` (or a list without the pivot) to yield no usable scope.
   */
  fetchCohort: (pivot: AssetModel) => Promise<AssetModel[]>;
  /**
   * Optional cheap pre-check run before any fetch. Return false to skip the
   * cohort entirely for this pivot (e.g. no prompt_version_id for a
   * same-prompt cohort) — avoids a pointless round-trip.
   */
  isEligible?: (pivot: AssetModel) => boolean;
}

interface CohortCache {
  assets: ViewerAsset[];
  /** String-normalized ids in the materialized cohort for O(1) membership. */
  idSet: Set<string>;
  version: number;
}

export function createCohortScope(opts: CohortScopeOptions): () => void {
  const cache = hmrSingleton<CohortCache>(opts.cacheKey, () => ({
    assets: [],
    idSet: new Set<string>(),
    version: 0,
  }));

  return function useCohortScope(): void {
    const isViewerOpen = useAssetViewerStore(selectIsViewerOpen);
    const currentAsset = useAssetViewerStore((s) => s.currentAsset);
    const [version, setVersion] = useState(cache.version);

    const pivotModel = currentAsset?._assetModel ?? null;
    const pivotId = currentAsset?.id ?? null;

    useEffect(() => {
      if (!isViewerOpen || !pivotModel || pivotId == null) return;
      if (opts.isEligible && !opts.isEligible(pivotModel)) return;
      // Pivot still inside the materialized cohort → in-scope navigation;
      // keep it stable so it doesn't reset under the user mid-walk.
      if (cache.idSet.has(String(pivotId))) return;

      let cancelled = false;
      opts
        .fetchCohort(pivotModel)
        .then((ordered) => {
          if (cancelled) return;
          const assets = ordered.map(toViewerAsset);
          cache.assets = assets;
          cache.idSet = new Set(assets.map((a) => String(a.id)));
          cache.version++;
          setVersion(cache.version);
        })
        .catch((err) => {
          console.warn(`[${opts.scopeId} scope] cohort fetch failed:`, err);
        });

      return () => {
        cancelled = true;
      };
      // pivotModel derives from the same currentAsset as pivotId, so keying
      // on pivotId + viewer-open is sufficient.
    }, [pivotId, isViewerOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    const snapshot = useMemo(() => [...cache.assets], [version]);
    const label = opts.label(snapshot.length);
    // A 1-item cohort (just the pivot, no peers) is a pointless scope entry.
    useViewerScopeSync(opts.scopeId, label, snapshot, isViewerOpen && snapshot.length > 1);
  };
}
