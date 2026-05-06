/**
 * useHistoryScope
 *
 * Always-available "History" navigation scope for the media viewer.
 * Captures every fresh `openViewer` call (gallery click, double-click, etc.)
 * via the `viewerOpenEvents` bus. Navigation prev/next does NOT push, so the
 * scope only reflects deliberate user opens.
 *
 * Must be mounted exactly once at app level — see `createCachedScopeHook`.
 */

import { viewerOpenEvents } from '../lib/viewerOpenEvents';

import { createCachedScopeHook } from './createCachedScopeHook';

export const useHistoryScope = createCachedScopeHook({
  scopeId: 'history',
  cacheKey: 'viewer:historyAssetsCache',
  cap: 50,
  label: (n) => `History (${n})`,
  subscribe: ({ prepend }) => viewerOpenEvents.subscribe(prepend),
});
