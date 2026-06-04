/**
 * Sidebar navigation — store registry ownership declarations.
 *
 * `useSidebarNav` (packages/shared/ui) persists each panel's active
 * section/child id to localStorage under a per-panel `storageKey`, so the
 * opened tab is restored on reopen. The hook lives in the shared UI package
 * and can't reach the app-level store registry, so ownership is declared here
 * instead.
 *
 * Ownership-only for now: these keys are flat (not under a managed/pruned
 * prefix), so registration documents ownership and future-proofs them against
 * orphan pruning — it does NOT delete anything today. See plan
 * `stores-registry-canon`.
 *
 * Keep this list in sync when adding/removing a `useSidebarNav({ storageKey })`
 * call site. (Call sites that omit `storageKey` don't persist and need no entry.)
 */

import { registerStore } from '@lib/stores';

const SIDEBAR_NAV_KEYS = [
  'agent-observability:nav',
  'ai-provider-settings:nav',
  'app-map:nav',
  'automation:nav',
  'codegen-dev:nav',
  'content-map:nav',
  'dev-tools:nav',
  'doc-browser:nav',
  'game-panel:nav',
  'game-world-editor:nav',
  'performance-panel:nav',
  'plans-panel:nav',
  'prompt-library-inspector:tab',
  'providers-panel-sidebar',
  'settings:nav',
  'template-analytics:nav',
  'template-library:nav',
  'types-explorer:nav',
  'ui-studio:nav',
] as const;

for (const key of SIDEBAR_NAV_KEYS) {
  registerStore({ id: `sidebar-nav:${key}`, key });
}

// Sidebar/disclosure COLLAPSE state is separate from nav selection. Every
// `SidebarPaneShell`/`SidebarContentLayout` `persistKey` and every
// `DisclosureSection` `persistKey` funnels through `useUiCollapsed`, which
// stores all of them as sub-keys inside ONE Zustand-persisted bag. So the
// dozens of `persistKey` strings are NOT localStorage keys — there is a single
// real key to own here. (The legacy `useSidebarCollapse` / `sidebar-collapse-v1`
// store has no live call sites.)
registerStore({ id: 'ui-collapsed', key: 'pixsim7:uiCollapsed-v1' });
