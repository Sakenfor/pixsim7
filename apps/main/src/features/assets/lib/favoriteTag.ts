import type { AssetModel } from '../models/asset';

import { assignTags, getAsset } from './api';
import { assetEvents } from './assetEvents';

export const FAVORITE_TAG_SLUG = 'user:favorite';

export function isFavoriteAsset(asset: AssetModel): boolean {
  return asset.tags?.some((t) => t.slug === FAVORITE_TAG_SLUG) ?? false;
}

/**
 * Set the user:favorite tag on an asset to an explicit state.
 *
 * Prefer this over {@link toggleFavoriteTag} when the caller already knows the
 * live favorite state (e.g. a heart widget tracking its own filled/empty
 * truth). Deciding add-vs-remove from a stale `AssetModel` snapshot is exactly
 * what made the viewer/input-slot heart unable to un-favorite: the captured
 * asset still read `favorite=false`, so every click sent `add` again.
 */
export async function setFavoriteTag(assetId: number, favorite: boolean): Promise<void> {
  const request = favorite
    ? { add: [FAVORITE_TAG_SLUG] }
    : { remove: [FAVORITE_TAG_SLUG] };

  const updated = await assignTags(assetId, request);
  assetEvents.emitAssetUpdated(updated);
}

/**
 * Toggle favorite for a backend asset id, reading the *current* state from the
 * server first so the add/remove decision can never be wrong. Returns the new
 * favorite state.
 *
 * This is the right primitive for fire-and-forget callers that don't hold live
 * favorite state — gesture/swipe handlers, the viewer/recent-strip toggles, and
 * the local-folder flow. (The heart badge tracks its own live state, so it uses
 * {@link setFavoriteTag} directly with the target it already knows.)
 */
export async function toggleFavoriteById(assetId: number): Promise<boolean> {
  const current = await getAsset(assetId);
  const next = !(current.tags?.some((t) => t.slug === FAVORITE_TAG_SLUG) ?? false);
  await setFavoriteTag(assetId, next);
  return next;
}

/**
 * Toggle the user:favorite tag on an asset.
 * Standalone function — safe to call from .map() callbacks and event handlers.
 *
 * Note: the add/remove decision is read from the passed `asset`'s tags, so the
 * caller must hold a fresh asset. Surfaces that don't refresh their asset ref
 * should drive off live state via {@link setFavoriteTag} (known target) or
 * {@link toggleFavoriteById} (server-fresh read) instead.
 */
export async function toggleFavoriteTag(asset: AssetModel): Promise<void> {
  await setFavoriteTag(asset.id, !isFavoriteAsset(asset));
}
