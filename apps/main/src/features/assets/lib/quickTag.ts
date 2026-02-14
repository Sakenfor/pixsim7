import { assignTags } from './api';
import { assetEvents } from './assetEvents';
import { useQuickTagStore } from './quickTagStore';

/**
 * Apply the given tag(s) to an asset and record them in recent tags.
 */
export async function applyQuickTag(assetId: number, tagSlugs: string[]): Promise<void> {
  if (tagSlugs.length === 0) return;
  const updated = await assignTags(assetId, { add: tagSlugs });
  assetEvents.emitAssetUpdated(updated);
  const store = useQuickTagStore.getState();
  for (const slug of tagSlugs) {
    store.addRecentTag(slug);
  }
}
