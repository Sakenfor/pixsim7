import { archiveAsset } from './api';
import { assetEvents } from './assetEvents';

/**
 * Archive an asset and broadcast its removal so every live surface drops it.
 *
 * Archive is a soft-hide PATCH on the backend, not a delete, so it emits no
 * event of its own. This pairs the mutation with `emitAssetRemoved(id,
 * 'archived')` — the one coupling that, when forgotten, leaves the asset
 * archived in the DB but lingering in the recents strip / gallery / probes.
 *
 * Every *single-asset* archive entry point should go through here (gesture
 * swipe, gallery action, etc.). The bulk context-menu action archives in
 * parallel via `Promise.allSettled` and emits per succeeded id — the same
 * coupling, just batch-shaped — so it stays hand-rolled.
 *
 * Mirrors `setFavoriteTag` in `favoriteTag.ts`: API mutation + matching event
 * emit kept together so callers can't do one without the other.
 */
export async function archiveAssetAndBroadcast(assetId: number): Promise<void> {
  await archiveAsset(assetId, true);
  assetEvents.emitAssetRemoved(assetId, 'archived');
}
