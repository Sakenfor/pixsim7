import { useCallback, useMemo } from 'react';

import { FAVORITE_TAG_SLUG, toggleFavoriteTag } from '../lib/favoriteTag';
import type { AssetModel } from '../models/asset';

export { FAVORITE_TAG_SLUG, toggleFavoriteTag } from '../lib/favoriteTag';

/**
 * React hook for single-asset favorite toggle with memoized state.
 */
export function useFavoriteToggle(asset: AssetModel) {
  const isFavorite = useMemo(
    () => asset.tags?.some((t) => t.slug === FAVORITE_TAG_SLUG) ?? false,
    [asset],
  );

  const toggle = useCallback(async () => {
    await toggleFavoriteTag(asset);
  }, [asset]);

  return { isFavorite, toggleFavorite: toggle };
}
