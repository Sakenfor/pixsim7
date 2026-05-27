/**
 * useRecentScope
 *
 * Always-available "Recent" navigation scope for the media viewer.
 * Subscribes to asset creation/update/deletion events and maintains a
 * session-scoped list of recently created assets (generations, uploads,
 * captures). Bootstraps from the server on first mount so the scope
 * isn't empty after a fresh page load.
 *
 * Must be mounted exactly once at app level — see `createCachedScopeHook`.
 */

import { assetEvents } from '../lib/assetEvents';
import { fromAssetResponse, toViewerAsset } from '../models/asset';

import { bootstrapFromFilters, createCachedScopeHook } from './createCachedScopeHook';

export const useRecentScope = createCachedScopeHook({
  scopeId: 'recent',
  cacheKey: 'viewer:recentAssetsCache',
  cap: 100,
  label: (n) => `Recent (${n})`,
  bootstrap: () => bootstrapFromFilters({ sort: 'new' }, 15),
  subscribe: ({ prepend, update, remove }) => {
    const unsubCreate = assetEvents.subscribe((response) => {
      prepend(toViewerAsset(fromAssetResponse(response)));
    });
    const unsubUpdate = assetEvents.subscribeToUpdates((response) => {
      update(toViewerAsset(fromAssetResponse(response)));
    });
    const unsubDelete = assetEvents.subscribeToDeletes((assetId) => {
      remove(assetId);
    });
    return () => {
      unsubCreate();
      unsubUpdate();
      unsubDelete();
    };
  },
});
