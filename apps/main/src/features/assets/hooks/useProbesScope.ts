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

import { bootstrapFromFilters, createCachedScopeHook, subscribeAssetEventStream } from './createCachedScopeHook';

export const useProbesScope = createCachedScopeHook({
  scopeId: 'probes',
  cacheKey: 'viewer:probesAssetsCache',
  cap: 100,
  label: (n) => `Probes (${n})`,
  bootstrap: () => bootstrapFromFilters({ asset_kind: 'probe', sort: 'new' }, 15),
  // Only probe-kind assets enter the scope (create/update are filtered).
  // Removal events carry no assetKind, so they apply unconditionally — a no-op
  // when the id isn't already in the probes cache.
  subscribe: (mutators) => subscribeAssetEventStream(mutators, (model) => model.assetKind === 'probe'),
});
