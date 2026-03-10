# ContextHub Authoring Context Plan

Last updated: 2026-03-10
Owner: contexthub lane
Status: active
Stage: packet_a_complete

## Goal
Create one canonical authoring context pipeline so panels that are project/world-aware automatically inherit the currently active project/world, with explicit opt-out overrides when needed.

This plan is intentionally detailed so work can be split across agents (Claude/Codex) with low risk of context drift.

## Problem Summary
Current behavior is mixed:

1. Active project/session data exists in `ProjectSessionStore`.
2. World context exists in scene/world stores and `ContextHub`.
3. Some panels consume context; many still use local stores or ad-hoc selection.
4. Routine Graph is currently not wired to backend behavior config (`/game/worlds/{worldId}/behavior`) and does not auto-follow active project context.

Result: loading a project (for example Bananza) does not guarantee relevant panels resolve to that same project/world automatically.

## Decision Summary
Use a hybrid model:

1. Canonical default: all relevant panels follow global active project/world context.
2. Optional override: panel instance can lock to a specific project/world via panel context.
3. Advanced multi-project authoring remains optional and explicit, not default behavior.

## Existing Building Blocks (already in repo)

1. `CAP_PROJECT_CONTEXT`, `CAP_WORLD_CONTEXT`, `CAP_PANEL_CONTEXT` capability keys.
2. Root providers for project/world/editor context:
   - `apps/main/src/features/contextHub/components/ContextHubRootProviders.tsx`
3. `useProjectContext()` hook:
   - `apps/main/src/features/contextHub/hooks/useProjectContext.ts`
4. Panel context capability injection via SmartDockview/floating panel hosts.
5. Project activation and load flow in:
   - `apps/main/src/features/panels/components/tools/ProjectPanel.tsx`

## Canonical Contracts

## A. Resolved authoring context
Create a new normalized hook output:

```ts
type AuthoringContextSource =
  | "panel-override"
  | "project-context"
  | "world-context"
  | "editor-fallback"
  | "none";

interface AuthoringContext {
  projectId: number | null;
  worldId: number | null;
  projectSourceWorldId: number | null;
  source: AuthoringContextSource;
  followActive: boolean;
  isReady: boolean;
}
```

## B. Panel-level override contract
Panel context may include:

```ts
interface PanelAuthoringContextOverride {
  followActive?: boolean; // default true
  projectId?: number | null;
  worldId?: number | null;
}
```

Behavior:

1. If `followActive !== false`, panel follows global context.
2. If `followActive === false`, panel uses explicit override values.
3. Override values win over global values.

## Implementation Phases

## Phase 1: ContextHub normalization hook
Implement a single hook that all project/world-aware panels can consume.

### Files
1. Add `apps/main/src/features/contextHub/hooks/useAuthoringContext.ts`
2. Update `apps/main/src/features/contextHub/hooks/index.ts` exports
3. Update `apps/main/src/features/contextHub/index.ts` exports
4. Add lightweight types in `apps/main/src/features/contextHub/domain/capabilities.ts` or local hook file

### Hook resolution order
1. panel override (`usePanelContext`)
2. project context (`useProjectContext` / `CAP_PROJECT_CONTEXT`)
3. world context (`CAP_WORLD_CONTEXT`)
4. editor fallback (`CAP_EDITOR_CONTEXT`)
5. none

### Done when
1. Hook returns stable values and source attribution.
2. If active project/world changes, hook output updates automatically.
3. If panel override is provided, source changes to `panel-override`.

## Phase 2: Shared guard helper for panels
Avoid repeating null checks and blank-state logic in each panel.

### Files
1. Add `apps/main/src/features/contextHub/hooks/useRequiredAuthoringWorld.ts`

### API
```ts
interface RequiredAuthoringWorldResult {
  worldId: number | null;
  isReady: boolean;
  missingReason: "missing-world" | null;
  source: AuthoringContextSource;
}
```

### Done when
1. Consumers can consistently render “missing world/project” state.
2. No panel-specific custom fallback logic is required for world id resolution.

## Phase 3: Routine Graph pilot (critical)
Routine Graph becomes the first full consumer.

### Goal
When Bananza (or any project) is loaded and sets world context, Routine Graph resolves and edits behavior routines for that world through backend APIs.

### Files
1. `apps/main/src/features/routine-graph/components/RoutineGraphSurface.tsx`
2. `apps/main/src/features/routine-graph/stores/routineGraphStore.ts`
3. Add service layer:
   - `apps/main/src/features/routine-graph/lib/routineGraphService.ts`
4. Add API helpers in `apps/main/src/lib/api/game.ts`:
   - `getWorldBehavior(worldId)`
   - `updateWorldBehavior(worldId, config)`
   - Optional typed wrappers for routine CRUD

### Required behavior
1. On resolved `worldId`, load `behavior.routines` into Routine Graph state.
2. Save graph changes back into world behavior config.
3. Keep store and backend shape conversion explicit (`fromNodeId/toNodeId` <-> `from/to`).
4. Do not silently keep stale graph from previous world after world switch.

### Done when
1. Load Bananza project, open Routine Graph, see Bananza routines.
2. Edit and save routine, reload panel, changes persist from backend.
3. Switching world switches displayed routines accordingly.

## Phase 4: Spread to other relevant panels
After pilot is stable, migrate other panels that should follow active project/world.

### First candidates
1. Scene Plan panel
2. NPC Brain Lab
3. World Context-dependent game tools

### Rule
Only migrate panels that semantically operate on project/world authoring state.

## Phase 5: Observability
Add lightweight debug visibility for resolved authoring context.

### Option A
Add context card in existing dev panel.

### Option B
Add row in AppMap/Registries-style diagnostics.

### Minimum fields
1. resolved world id
2. resolved project id
3. source (`panel-override`, `project-context`, etc.)
4. followActive state

## Phase 6: Project-scoped layout presets (optional but recommended)
After context propagation is reliable, link workspace layouts to project id.

### Principle
Project selection can restore preferred panel layout without forcing global layout for all projects.

### Scope
1. map `projectId -> presetId` or serialized layout snapshot
2. restore on project activation
3. fallback to default preset if missing

## Guardrails
1. Do not introduce new ad-hoc global stores for project/world context.
2. Context resolution must happen through ContextHub hooks.
3. Keep panel override optional; default is follow-active.
4. No implicit backend writes on panel mount. Persist only through explicit save or controlled autosave policy.
5. Preserve existing panel behavior where context is irrelevant.

## Testing Checklist

## Unit
1. Hook resolution precedence tests for `useAuthoringContext`.
2. Routine graph serialization conversion tests.
3. `useRequiredAuthoringWorld` output tests.

## Integration
1. Load saved project -> Routine Graph reflects world behavior routines.
2. Switch project/world -> Routine Graph reloads from target world.
3. Panel override context forces alternate world regardless of active global context.

## Manual
1. Open workspace with no project/world: panel shows consistent empty state.
2. Load Bananza project from Project Panel: Routine Graph shows Bananza routines.
3. Save routine edit and verify via backend behavior endpoint snapshot.

## Suggested Task Split For Claude

## Packet A: ContextHub foundation — DONE
Scope:
1. `useAuthoringContext`
2. `useRequiredAuthoringWorld`
3. exports and minimal tests

Constraints:
1. no Routine Graph edits
2. no backend API changes

Acceptance:
1. unit tests pass (28/28)
2. no regressions in existing capability hooks (tsc clean)

Delivered files:
- `apps/main/src/features/contextHub/hooks/useAuthoringContext.ts`
- `apps/main/src/features/contextHub/hooks/useRequiredAuthoringWorld.ts`
- `apps/main/src/features/contextHub/hooks/__tests__/useAuthoringContext.test.ts`
- `apps/main/src/features/contextHub/hooks/__tests__/useRequiredAuthoringWorld.test.ts`
- Updated barrel exports in `hooks/index.ts` and `contextHub/index.ts`

## Packet B: Routine Graph + API integration
Scope:
1. routine graph service + load/save wiring
2. `game.ts` behavior helpers
3. shape conversion and error handling

Constraints:
1. use `useAuthoringContext` from Packet A
2. do not create duplicate context stores

Acceptance:
1. project load reflects in Routine Graph
2. edits persist to world behavior config

## Packet C: Observability and docs
Scope:
1. context diagnostics widget/card
2. docs updates (`ongoing-work-status`, this plan status, system overview references)

Constraints:
1. no behavior schema changes

Acceptance:
1. source of resolved context visible in UI
2. docs updated with current architecture

## Known Risks
1. Race conditions when world changes quickly while panel loads.
Mitigation: request token/cancel guard in routine graph loader.

2. Store contamination across worlds.
Mitigation: clear current graph set on world switch before loading new payload.

3. Inconsistent behavior schema assumptions.
Mitigation: strict parse + fallback defaults for missing `behavior`/`routines`.

## Out of Scope (for now)
1. Full simultaneous multi-project authoring in one workspace.
2. Automatic migration of all legacy panels in one pass.
3. New backend schema model for behavior outside `world.meta.behavior`.

## Rollout Recommendation
1. Merge Packet A first.
2. Merge Packet B behind a feature flag or guarded panel setting if needed.
3. Validate Bananza workflow.
4. Merge Packet C and then fan out to additional panels.

## Update Log

- 2026-03-10: Normalized plan metadata to template contract and added update-log governance section.
