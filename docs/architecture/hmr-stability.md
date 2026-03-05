# HMR Stability - Architecture Plan

## Goal

Eliminate visible Hot Module Replacement instability in the main app:

1. Gallery image flash after save
2. Popup/popover breakage after HMR
3. "Live" status briefly resetting to Offline

## Scope

In scope:

- HMR runtime identity stability (contexts, singletons, panel wrappers)
- Module invalidation reduction from wildcard barrel re-exports
- Validation and regression guardrails

Out of scope:

- Full panel auto-discovery redesign (`import.meta.glob` eager/lazy strategy)
- Production bundle optimization unrelated to HMR behavior

## Current State (Already Done)

The following foundations are already in place and should remain:

- `createHmrSafeContext()` usage for React context identity preservation
- `hmrSingleton()` usage for key runtime singletons/stores
- Dockview stable proxy chain (`implRef -> proxy -> wrapped`) and component-map stabilization
- Global plugin catalog epoch synchronization
- Recovery polling path for catalog rebuild edge cases
- Blob URL LRU caching in media hooks

These are the primary defense layers. Barrel cleanup is a secondary reducer of unnecessary re-evaluation.

## Risks To Address Before Broad Refactor

1. Wildcard audit is too narrow if limited to `features/*`.
   - `export *` also exists in `lib/*`, `domain/*`, and `components/*` barrels.
   - Refactor order must use whole-app impact, not only feature folders.
2. Blob cache lifecycle across HMR replacement is not fully hardened.
   - Module-local Maps can be replaced during HMR while old blob URLs remain unreleased.
3. Recovery poll can run longer than needed.
   - Needs DEV-only guard plus bounded runtime.
4. Validation is compile-only today.
   - `tsc` catches missing exports, but not interaction regressions.
5. No preventive policy against reintroducing `export *`.
   - Without lint/CI guardrails, churn will reintroduce instability sources.

## Phased Implementation Plan

## Phase 0 - Baseline and Guardrails

Deliverables:

- Generate a baseline wildcard-export report for `apps/main/src/**/index.ts` and other barrels.
- Add an HMR smoke checklist to this doc (or companion test doc).
- Define a temporary allowlist for wildcard exports that are intentionally kept.

Implementation artifacts:

- Audit command: `pnpm --dir apps/main run hmr:wildcards`
- Baseline generation command: `pnpm --dir apps/main run hmr:wildcards:baseline`
- Audit script: `apps/main/scripts/hmr-wildcard-audit.mjs`
- Allowlist: `docs/architecture/hmr-wildcard-allowlist.json`
- Baseline snapshot: `docs/architecture/hmr-wildcard-baseline.json`

Initial baseline snapshot (2026-03-04):

- Total wildcard exports: 223
- Allowlisted: 4
- Remaining: 219
- Remaining by area: `lib=114`, `features=84`, `components=10`, `domain=9`, `types=2`

Exit criteria:

- We have a committed baseline list and owner-approved priority order.
- We can run one command to show remaining wildcard exports.

## Phase 1 - Runtime Hardening

### 1. Blob cache hardening

Actions:

- Move blob cache Maps to `hmrSingleton(...)` (or equivalent global symbol cache).
- Add HMR dispose cleanup to revoke cache URLs when a module instance is actually replaced.
- Keep LRU behavior unchanged for normal runtime.

Exit criteria:

- Repeated saves do not grow orphaned blob URLs.
- Gallery/image components keep fast remount behavior.

### 2. Recovery poll hardening

Actions:

- Restrict poll behavior to DEV mode.
- Add timeout/backoff so polling does not run indefinitely in persistent empty states.
- Keep current edge-case recovery behavior during catalog rebuild.

Exit criteria:

- No permanent 50ms interval in idle scenarios.
- HMR remount with temporarily empty catalog still self-recovers.

## Phase 2 - Wildcard Export Reduction

Rule:

- Replace local `export * from './x'` with explicit exports.
- Prefer `export type { ... }` for types and `export { ... }` for values.

Priority order (current recommendation):

1. `@features/panels` and `@features/generation` (high importer counts and runtime sensitivity)
2. `@features/graph` (high wildcard density)
3. `@features/providers`, `@features/gallery`, `@features/prompts`, `@features/hud`
4. `lib` barrels with high fan-out (`lib/ui`, `lib/api`, `lib/dockview`, `lib/plugins`)
5. Remaining low-fanout barrels

Notes:

- Internal/dead features with zero external importers can be deferred.
- Shared-package re-exports can be reviewed separately; local wildcard barrels are highest priority.

Exit criteria:

- Priority modules have no local wildcard exports.
- App compiles cleanly and smoke scenarios remain stable.

## Phase 3 - Regression Prevention

Actions:

- Add ESLint rule or custom check to block new wildcard exports in app runtime barrels.
- Allow explicit exceptions via allowlist comment/path list.
- Add CI step that fails on unapproved wildcard exports.

Exit criteria:

- New wildcard exports require explicit opt-in.
- CI fails on accidental reintroduction.

## Validation Matrix

Run after each feature/module conversion batch:

```bash
npx tsc --noEmit --project apps/main/tsconfig.json
```

Recommended additional checks:

```bash
npx eslint apps/main/src --max-warnings=0
```

Manual HMR smoke test (minimum):

1. Edit a gallery-related leaf module; verify no visible image blank flash.
2. Edit a popup/popover dependency; verify menus/dropdowns still open and respond.
3. Edit generation/websocket-related leaf module; verify "Live" indicator does not transiently reset.
4. Edit a panel definition while dockview is open; verify existing panels stay mounted and interactive.

Acceptance criteria:

- All four smoke checks pass for 10 consecutive save cycles.
- No console errors indicating lost context/provider identity.
- No repeated interval/poll activity after stabilization.

## Rollout Strategy

Batch size:

- Small, reversible PRs (one feature area or one high-fanout barrel group per PR).

Sequence:

1. Ship Phase 1 runtime hardening first.
2. Ship Phase 2 in prioritized batches.
3. Ship Phase 3 once wildcard count is near target to avoid noisy CI.

Rollback:

- If a batch causes runtime regression, revert only that batch and keep prior hardening.

## Open Questions

1. Should we allow wildcard re-exports for type-only external package surfaces?
2. Do we want a codemod for explicit export generation in high-symbol barrels (especially graph)?
3. Should HMR smoke checks become an automated Playwright dev-only suite?
