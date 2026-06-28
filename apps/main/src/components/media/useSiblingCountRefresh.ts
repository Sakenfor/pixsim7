/**
 * useSiblingCountRefresh
 *
 * The top-left similarity badge's cohort counts (same-prompt / same-inputs /
 * same-seed) are NOT carried on the asset response anymore — computing them ran
 * ~7 GROUP BY queries per asset on the hot path. The badge is hover-gated, so
 * we fetch the counts lazily on hover from the dedicated
 * `GET /assets/{id}/cohort-counts` endpoint and park them in the transient
 * {@link useSiblingCountsStore}, which the badge subscribes to by asset id.
 *
 * This doubles as the recount path: a fresh burst from one prompt would
 * otherwise read 1, 2, 3 on the already-mounted cards (each fetched before its
 * later siblings landed); re-fetching on hover recounts them. A per-card
 * cooldown keeps rapid enter/leave from spamming the endpoint, and a signature
 * dedup skips the store write when the counts are unchanged.
 *
 * See plan `media-card-sibling-badges`.
 */
import { useCallback, useRef } from 'react';

import { getAssetCohortCounts } from '@lib/api/assets';

import { isBackendAssetId } from '@features/assets/lib/backendAssetId';

import { useSiblingCountsStore } from './siblingCountsStore';

/** Don't re-fetch the same card more than once per this window. */
const REFRESH_COOLDOWN_MS = 4000;

/** Order-independent signature of an asset's cohort counts. */
function cohortSignature(counts?: Record<string, number> | null): string {
  if (!counts) return '';
  return Object.keys(counts)
    .sort()
    .map((k) => `${k}:${counts[k]}`)
    .join(',');
}

/**
 * Returns a hover handler that refreshes an asset's live sibling counts.
 * No-ops when disabled, for non-backend (local) assets, while a fetch is in
 * flight, or within the cooldown window.
 */
export function useSiblingCountRefresh(
  assetId: number | string,
  enabled: boolean,
): () => void {
  const lastRefreshRef = useRef(0);
  const inFlightRef = useRef(false);
  // Last cohort-count signature we wrote for this card. Hovering the same card
  // again (or hovering many cards during a burst) re-fetches, but if the counts
  // are unchanged there's nothing to repaint — skip the store write so we don't
  // churn the Map (and every subscribed badge) for a no-op. `null` (initial)
  // always writes the first observed counts.
  const lastSigRef = useRef<string | null>(null);

  return useCallback(() => {
    const numericId = typeof assetId === 'number' ? assetId : Number(assetId);
    if (!enabled || inFlightRef.current || !isBackendAssetId(numericId)) return;
    const now = Date.now();
    if (now - lastRefreshRef.current < REFRESH_COOLDOWN_MS) return;
    lastRefreshRef.current = now;
    inFlightRef.current = true;
    getAssetCohortCounts(numericId)
      .then((counts) => {
        const sig = cohortSignature(counts);
        if (sig === lastSigRef.current) return;
        lastSigRef.current = sig;
        useSiblingCountsStore.getState().set(numericId, counts);
      })
      .catch(() => {
        // Best-effort — a failed hover refresh just leaves the stale count.
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [assetId, enabled]);
}
