# Frontend Structure Canonization Plan

## Goal
Reduce structural variance across features by standardizing layout, naming, and ownership rules while preserving app-shell and platform exceptions.

## Canonical Feature Layout
```
features/{name}/
  components/
  routes/
  hooks/
  stores/
  domain/
  api/
  lib/
  types/
  index.ts
  module.ts
```
Notes:
- Folders are optional; avoid empty directories.
- `routes/` replaces `pages.ts`.
- `module.ts` is the only feature registration entry.
- `stores/` only for feature-scoped Zustand state.
- `domain/` for business logic and domain types (feature-only).

## Approved Exceptions
- `apps/main/src/app/modules` and `apps/main/src/routes`: app shell only.
- `apps/main/src/plugins` and `apps/main/src/lib/*` frameworks: platform runtime.
- `apps/main/src/domain`: cross-feature game domain.
- `apps/main/src/components/legacy`: legacy quarantine.
- `apps/main/src/stores` and `apps/main/src/types`: truly global state/types only.

## Completed
### ContextHub
- Split into `components/`, `hooks/`, `stores/`, `domain/`, `types/`.
- Moved capability registry/descriptor/contracts into `domain/`.
- Replaced `hooks.ts` and `capabilityFacade.ts` with `hooks/useCapability.ts` and `hooks/useUnifiedCapabilities.ts`.
- Swapped `store/` to `stores/`.
- Updated barrel exports and external import sites to use `@features/contextHub`.

### Graph
- Renamed `systemModule.ts` -> `module.ts`.
- Renamed `pages.ts` -> `routes/index.ts`.
- Moved template stores into `stores/` and updated exports/imports.
- Adjusted app module registration to use auto-discovery for the graph module.

### Panels
- Moved panel definitions under `domain/definitions/` and updated auto-discovery.
- Moved `PanelHostLite` and scope utilities to `components/` (host/scope).
- Updated docs and helper references for the new definitions path.

### Workspace
- Moved the module implementation to `features/workspace/module.ts` (removed `lib/module.ts` indirection).

### Pages to Routes
- Converted all feature-level `pages.ts` files into `routes/index.ts`.
- Updated app module aggregators and feature exports to reference `routes/`.
- Moved the remaining app-level interaction pages from `src/pages` into `src/routes`.

### Hooks
- Moved global hooks from `src/lib/hooks` into `src/hooks`.
- Updated imports to use `@/hooks` and removed the `@lib/hooks` alias.
- Relocated feature/domain stores out of `src/stores` (assets, prompts, gizmos, panels, campaigns, scene collections).

## Next Up
1. Cubes (root-level store/component cleanup).
2. Hooks/store consolidation audit (global vs feature).
3. Decide whether remaining React hooks inside `lib/` should be moved or considered library code (e.g., `lib/editing-core/hooks`).

## Other Suggestions
- Decide whether the panels system should stay as a feature or be elevated to a platform lib (if it is purely registry/orchestration).
- Consolidate global hooks usage: pick `apps/main/src/hooks` for app-wide hooks and phase out `apps/main/src/lib/hooks` for React hooks.
- Audit global stores and types to ensure only cross-feature state/types stay in `apps/main/src/stores` and `apps/main/src/types`.
- Confirm store ownership: keep `worldConfigStore` global; mark `conceptStore` as global-intent but currently single-consumer (watch for future relocation if it stays feature-only).
