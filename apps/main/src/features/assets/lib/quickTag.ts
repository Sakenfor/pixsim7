import { assignTags } from './api';
import { assetEvents } from './assetEvents';
import { useQuickTagStore } from './quickTagStore';

/**
 * Apply the given tag to an asset and record it in recent tags.
 */
export async function applyQuickTag(assetId: number, tagSlug: string): Promise<void> {
  const updated = await assignTags(assetId, { add: [tagSlug] });
  assetEvents.emitAssetUpdated(updated);
  useQuickTagStore.getState().addRecentTag(tagSlug);
}
