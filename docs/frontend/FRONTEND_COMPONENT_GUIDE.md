# Frontend Component Guide

This guide lists canonical, reusable UI primitives and conventions so contributors and AIs reuse the same building blocks instead of reinventing them.

## Shared UI (`@pixsim7/shared.ui`)

Package location: `packages/shared/ui/src/`

Barrel export: `packages/shared/ui/src/index.ts`

Key components: `Button`, `Modal`, `Toast`, `FormField`, `Input`, `Select`, `Switch`, `Tabs`, `Tooltip`, `Popover`, `PromptInput`, `HierarchicalSidebarNav`, `SidebarPaneShell`, `SidebarContentLayout`, `SegmentedControl`, `ResizeDivider`, `ThumbnailGrid`, `Badge`, `StatusBadge`, `ProgressBar`, `Table`, `GroupByPillBar`.

### SidebarContentLayout

Composes `SidebarPaneShell` + `HierarchicalSidebarNav` + content area into a single two-pane layout. Derives `getItemState`/`getChildState` callbacks internally from `activeSectionId`/`activeChildId`.

Supports flat section lists and hierarchical sections with expand/collapse.

Consumers: `SettingsPanel`, `ProjectPanel`.

### PromptInput

Shared prompt text input with character limit display.

- Default limit: `apps/main/src/config/prompt.ts` (`DEFAULT_PROMPT_MAX_CHARS = 800`)
- Limit resolver: `apps/main/src/utils/prompt/limits.ts` — `resolvePromptLimit(providerId)` and `resolvePromptLimitForModel(providerId, model, paramSpecs)`
- Limits are resolved dynamically from the provider capability registry (backed by backend `operation_specs`).

## Workspace and Layout

- Workspace store: `apps/main/src/features/workspace/stores/workspaceStore.ts`
- Workspace route: `apps/main/src/features/workspace/routes/Workspace.tsx`
- Dockview integration: `apps/main/src/lib/dockview/SmartDockview.tsx`

## Control Center Dock

- Store: `apps/main/src/features/controlCenter/stores/controlCenterStore.ts`
- Component: `apps/main/src/features/controlCenter/components/ControlCenterDock.tsx`
- Module entry: `apps/main/src/features/controlCenter/index.ts`

## General Conventions

- Prefer importing shared primitives from `@pixsim7/shared.ui` over creating local duplicates.
- Keep shared config in `src/config/*`.
- Add brief JSDoc headers on canonical components stating they are the primary implementation to reuse.
- If introducing a new shared primitive, add it to `packages/shared/ui/src/` with a barrel export and mention it here.
