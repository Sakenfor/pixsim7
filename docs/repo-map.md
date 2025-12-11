# Repository Map

High-level guide to the pixsim7 codebase. Use this as a starting point when you need to find code, docs, or assets.

## Top-Level Layout

| Path | Description |
| --- | --- |
| `apps/main/` | React front-end (panels, console, gizmos, stores, routing). |
| `packages/game/` | TypeScript game engine modules (narrative executor, scene integration, runtime plugins). |
| `packages/shared/` | Shared TypeScript definitions, configs, graph schemas. |
| `packages/scene/` | Scene/gizmo utilities shared between engine and UI. |
| `pixsim7/backend/` | Backend services (FastAPI), world scheduler, automation workers. |
| `docs/` | Living documentation, specs, system guides. |
| `docs/archive/` | Historical/legacy docs kept for reference. |
| `claude-tasks/` | Active task briefs and AI planning docs. |
| `scripts/` / `tools/` | Developer tooling, automation scripts. |

## Front-End (`apps/main/src`)

- `components/` – Shared UI components and feature-specific UIs (simulation dashboards, gizmos, etc.).
- `components/panels/` – Dockview panels (Model inspector, console, world tools). Upcoming 3D panel work lives here.
- `lib/` – Front-end libraries (console namespace, gizmo registries, interaction stats logic).
- `stores/` – Zustand stores for editor/runtime state (tool configs, interaction stats, workspace layout).
- `routes/` – Top-level React routes (Simulation Playground, NPC labs, etc.).
- `plugins/` – Feature bundles that plug into the editor (world tools, ops panels).

## Game Engine (`packages/game/engine/src`)

- `narrative/` – Narrative runtime (ConditionEvaluator, EffectApplicator, executor, integration hooks, scene bridge).
- `world/` – Runtime plugins, game profile definitions, runtime types.
- `scenarios/` – Scenario scripts/tests for engine behaviors.
- `runtime/` – Game runtime typings/hooks used by front-end runtime integration.

## Shared Packages

- `packages/shared/types/` – Canonical DTOs (GameSession, NPC zones, graph schemas) referenced by both front-end and backend.
- `packages/scene/` – Gizmo + scene utilities (zoneUtils, tool registries) used by both UI and engine layers.

## Backend (`pixsim7/backend`)

- `main/api/` – FastAPI routes for game worlds, assets, automation.
- `main/services/simulation/` – World scheduler, context, automation loop (tick-based backend simulation).
- `main/services/automation/`, `main/domain/` – Automation loops, scenario runners, shared domain models.
- `main/services/scenarios/` – Scenario runner used for deterministic tests.

## Documentation

- `docs/` – Current specs (architecture, engine layering, subsystem plans). Use `docs/README.md` or this map to locate topics.
- `docs/archive/` – Completed plans and historical references. Subfolders grouped by theme (meta, launcher, completed, etc.).
- `claude-tasks/` – Task briefs and AI planning notes. Active work (e.g., Model Inspector plan, path alias refactor) lives here until completed.

## How to Explore

1. **Features** – Start in `apps/main/src/components/panels/...` or `apps/main/src/features/...` for UI; jump to matching engine modules under `packages/game/engine/src/...`.
2. **Narrative/Scene** – `packages/game/engine/src/narrative/` for logic, `apps/main/src/lib/console/modules/tools.ts` + `apps/main/src/lib/gizmos/` for UI integration.
3. **Scheduler/Simulation** – Look under `pixsim7/backend/main/services/simulation/` and `docs/behavior_system/`.
4. **Docs** – Use `/docs` for current specs, `/docs/archive` for historical context. Active tasks live in `claude-tasks/`.

## Keeping This Up to Date

- Add new domains/paths here when creating major features.
- When moving files, update both the alias map (tsconfig) and this repo map.
- If a section grows large, link out to a dedicated doc (e.g., `docs/narrative-runtime.md`).
