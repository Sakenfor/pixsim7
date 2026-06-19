import { getAsset, setSignalOverride } from '@lib/api/assets';

import { assetEvents } from './assetEvents';

/**
 * Set the manual video-health (signal) override on an asset and refresh its
 * card. `'broken'` / `'clean'` confirm-or-override the heuristic; `null` clears.
 * Persists to `media_metadata.signal_metrics.user_override`.
 *
 * Standalone — safe for fire-and-forget gesture/swipe handlers in any surface
 * (gallery cards, the asset viewer). Emits a fresh asset so subscribed cards
 * reflect the new flag (see the media-card fresh-asset-ref rule).
 */
export async function setSignalOverrideById(
  assetId: number,
  override: 'clean' | 'broken' | null,
): Promise<void> {
  await setSignalOverride(assetId, override);
  const refreshed = await getAsset(assetId);
  assetEvents.emitAssetUpdated(refreshed);
}
