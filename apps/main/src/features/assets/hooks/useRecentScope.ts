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

import { bootstrapFromFilters, createCachedScopeHook, subscribeAssetEventStream } from './createCachedScopeHook';

export const useRecentScope = createCachedScopeHook({
  scopeId: 'recent',
  cacheKey: 'viewer:recentAssetsCache',
  cap: 100,
  label: (n) => `Recent (${n})`,
  // On full page refresh the in-memory cache is empty, so bootstrap should
  // refill the whole visible recents window (up to cap), not just the latest
  // micro-batch.
  bootstrap: () => bootstrapFromFilters({ sort: 'new' }, 100),
  // Recent shows the default (non-archived, current) view, so it takes every
  // create/update and drops on any removal (deleted / archived / superseded).
  subscribe: (mutators) => subscribeAssetEventStream(mutators),
});
