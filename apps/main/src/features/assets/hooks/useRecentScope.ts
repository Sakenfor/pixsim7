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
  // micro-batch. `exclude_broken` mirrors the default gallery / cohort badge
  // (manual flag OR current-version heuristic score >= 3, version-gated
  // server-side) so a fresh session never cold-starts with broken clips —
  // Triage is the place to review those.
  bootstrap: () => bootstrapFromFilters({ sort: 'new', exclude_broken: true }, 100),
  // Live, only DROP a clip when you manually flag it broken — a deliberate action
  // with expected feedback. We intentionally do NOT auto-remove when the async
  // scanner later scores a freshly-landed clip >= 3: that score arrives on the
  // SAME update as the clip's thumbnail/preview, so removing then would yank a
  // clip out from under you moments after it appeared. Heuristic-broken clips
  // just stay for the session and fall out on the next load (server-side
  // `exclude_broken` on bootstrap) — matching how the main gallery already
  // behaves (live-prepend + exclude-on-query, no live yank).
  subscribe: (mutators) =>
    subscribeAssetEventStream(mutators, (model) => model.signalOverride !== 'broken'),
});
