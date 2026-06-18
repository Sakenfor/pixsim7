/**
 * useSiblingCountRefresh
 *
 * The top-left sibling-count badges (same-prompt / same-inputs / same-seed) are
 * computed live server-side per query (`AssetSiblingCountService`) and then
 * frozen onto each card's `AssetModel` at fetch time. When a new sibling is
 * generated, only the newcomer is live-prepended into the gallery — the cards
 * already on screen keep the stale count they were fetched with. So a fresh
 * burst from one prompt reads 1, 2, 3 instead of 3, 3, 3 (it looks "stamped at
 * generation", but it's just never recounted).
 *
 * The badges are hover-gated, so the cheapest reconciliation is to re-fetch the
 * single asset on hover (`GET /assets/{id}` recomputes the counts) and emit it
 * as an update. `useAssets.updateAsset` swaps the fresh `AssetModel` ref into
 * the list — which recounts the badge — and ignores assets it isn't holding, so
 * this is safe to fire from any surface. A per-card cooldown keeps rapid
 * enter/leave from spamming the endpoint.
 *
 * See plan `media-card-sibling-badges` and the `media-card-fresh-asset-ref` rule.
 */
import { useCallback, useRef } from 'react';

import { getAsset } from '@lib/api/assets';

import { assetEvents } from '@features/assets/lib/assetEvents';
import { isBackendAssetId } from '@features/assets/lib/backendAssetId';

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
  // Last cohort-count signature we emitted for this card. Hovering the same
  // card again (or hovering many cards during a burst) re-fetches, but if the
  // counts are unchanged there's nothing to repaint — skip the emit so we don't
  // trigger a list-wide `updateAsset` reconcile across every mounted gallery
  // for a no-op. `null` (initial) always emits the first observed counts.
  const lastSigRef = useRef<string | null>(null);

  return useCallback(() => {
    const numericId = typeof assetId === 'number' ? assetId : Number(assetId);
    if (!enabled || inFlightRef.current || !isBackendAssetId(numericId)) return;
    const now = Date.now();
    if (now - lastRefreshRef.current < REFRESH_COOLDOWN_MS) return;
    lastRefreshRef.current = now;
    inFlightRef.current = true;
    getAsset(numericId)
      .then((response) => {
        const sig = cohortSignature(
          (response as { cohort_counts?: Record<string, number> | null }).cohort_counts,
        );
        if (sig === lastSigRef.current) return;
        lastSigRef.current = sig;
        assetEvents.emitAssetUpdated(response);
      })
      .catch(() => {
        // Best-effort — a failed hover refresh just leaves the stale count.
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [assetId, enabled]);
}
