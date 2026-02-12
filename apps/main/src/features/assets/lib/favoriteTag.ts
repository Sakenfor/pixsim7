import type { AssetModel } from '../models/asset';

import { assignTags } from './api';
import { assetEvents } from './assetEvents';

export const FAVORITE_TAG_SLUG = 'user:favorite';

export function isFavoriteAsset(asset: AssetModel): boolean {
  return asset.tags?.some((t) => t.slug === FAVORITE_TAG_SLUG) ?? false;
}

/**
 * Toggle the user:favorite tag on an asset.
 * Standalone function — safe to call from .map() callbacks and event handlers.
 */
export async function toggleFavoriteTag(asset: AssetModel): Promise<void> {
  const isFav = isFavoriteAsset(asset);
  const request = isFav
    ? { remove: [FAVORITE_TAG_SLUG] }
    : { add: [FAVORITE_TAG_SLUG] };

  const updated = await assignTags(asset.id, request);
  assetEvents.emitAssetUpdated(updated);
}
