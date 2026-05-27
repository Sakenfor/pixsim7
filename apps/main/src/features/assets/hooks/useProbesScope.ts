/**
 * useProbesScope
 *
 * Always-available "Probes" navigation scope for the media viewer. Mirrors
 * `useRecentScope` but filters the asset-event stream to `assetKind === 'probe'`,
 * so the scope stays live even when the floating Probes panel is closed —
 * the user can keep iterating in probe mode and watch the strip update
 * underneath the viewer. Bootstraps from the server so existing probes
 * are visible immediately on viewer open.
 *
 * Must be mounted exactly once at app level — see `createCachedScopeHook`.
 */

import { assetEvents } from '../lib/assetEvents';
import { fromAssetResponse, toViewerAsset } from '../models/asset';

import { bootstrapFromFilters, createCachedScopeHook } from './createCachedScopeHook';

export const useProbesScope = createCachedScopeHook({
  scopeId: 'probes',
  cacheKey: 'viewer:probesAssetsCache',
  cap: 100,
  label: (n) => `Probes (${n})`,
  bootstrap: () => bootstrapFromFilters({ asset_kind: 'probe', sort: 'new' }, 15),
  subscribe: ({ prepend, update, remove }) => {
    const unsubCreate = assetEvents.subscribe((response) => {
      const model = fromAssetResponse(response);
      if (model.assetKind !== 'probe') return;
      prepend(toViewerAsset(model));
    });
    const unsubUpdate = assetEvents.subscribeToUpdates((response) => {
      const model = fromAssetResponse(response);
      if (model.assetKind !== 'probe') return;
      update(toViewerAsset(model));
    });
    const unsubDelete = assetEvents.subscribeToDeletes((assetId) => {
      // Delete events don't carry assetKind. Remove unconditionally — if the
      // id isn't in the probes cache, the mutator is a no-op anyway.
      remove(assetId);
    });
    return () => {
      unsubCreate();
      unsubUpdate();
      unsubDelete();
    };
  },
});
