---
id: app-map
title: App Map & Architecture Index
featureIds:
  - app-map
  - devtools
visibility: internal
tags:
  - architecture
  - app-map
summary: Canonical map of PixSim7 features, routes, backend, and tooling.
---

# App Map & Architecture Index

**Last Updated:** 2025-01-05

This document provides a high-level map of PixSim7 features, linking frontend modules, backend APIs, documentation, and routes.

## Overview

The App Map serves as a single source of truth for navigating the codebase. Each feature entry below connects:
- **Docs**: Relevant documentation files
- **Frontend**: React feature modules and libraries
- **Backend**: Python API modules and services
- **Routes**: Frontend route paths

For detailed repository structure, see [docs/repo-map.md](./repo-map.md).

---

## Sources of Truth

### Canonical API (Recommended)

The **canonical source** for architecture data is the backend API:

| Endpoint | Description |
|----------|-------------|
| `GET /dev/architecture/map` | Backend architecture (routes, services, plugins) |
| `GET /dev/architecture/frontend` | Frontend features (from module metadata) |
| `GET /dev/architecture/unified` | **Combined backend + frontend** (recommended) |

Both the frontend App Map panel and Python launcher GUI should consume these endpoints.

### Offline Fallback (JSON Files)

When the backend is not running, the launcher falls back to JSON files:

1) **Generated registry**
   `docs/app_map.generated.json` - produced from module JSDoc `@appMap.*` tags
   (with `page.appMap` as deprecated fallback).

2) **Manual registry (deprecated)**
   `docs/app_map.sources.json` - being phased out in favor of JSDoc `@appMap.*` tags.

The generator lives in `packages/shared/app-map` and is invoked via `pnpm docs:app-map`
(which runs `packages/shared/app-map/src/cli.ts`).

### Code-Derived Metadata

When generating `app_map.generated.json`, use:

- **Module pages**: `apps/main/src/app/modules/types.ts`  
  `Module.page` fields such as `route`, `description`, `category`, `featureId`, and
  `featurePrimary` provide feature/route metadata. Use `@appMap.*` JSDoc tags on
  module declarations for docs/backend/frontend mapping.

- **Actions**: `packages/shared/types/src/actions.ts`  
  `ActionDefinition` (and module `page.actions`) provide action metadata.  
  Use `contexts` and `visibility` to opt actions into specific UI surfaces.

### Add a Feature to the App Map

**Preferred approach (JSDoc, canonical):**

1) Add `@appMap.*` tags to the module declaration:
   ```typescript
   // apps/main/src/features/myFeature/module.ts
   /**
    * @appMap.docs docs/my-feature.md
    * @appMap.backend pixsim7.backend.main.api.v1.my_feature
    * @appMap.frontend apps/main/src/features/myFeature/
    * @appMap.notes Optional implementation notes
    */
   export const myModule: Module = {
     id: 'my-feature',
     name: 'My Feature',
     page: {
       route: '/my-feature',
       featureId: 'my-feature',
     },
   };
   ```

2) Run `pnpm docs:app-map` to regenerate `app_map.generated.json`

**Fallback (deprecated):**

- `page.appMap` is still supported as a fallback but will be removed once migrations are complete.
- `docs/app_map.sources.json` is legacy-only and should be avoided for new features.

### Comment Conventions (JSDoc)

Use short JSDoc tags on module declarations. Comma-separate lists for `docs`,
`backend`, and `frontend`. Use `|` to split multiple notes if needed.

See `docs/APP_MAP_JSDOC.md` for the canonical format.

## Live App Map Registry

The table below is auto-generated from module JSDoc `@appMap.*` tags (with legacy registry fallback).
Run `pnpm codegen --only app-map` to refresh.

<!-- APP_MAP:START -->
| Feature | Routes | Docs | Frontend | Backend |
|---------|--------|------|----------|---------|
| Browser Automation | `/automation` | `automation.md` | `features/automation/` | `api.v1.automation`, `api.v1.device_agents`, `services.automation` |
| Asset Management | `/assets`, `/gallery` | - | `features/assets/` | `api.v1.assets`, `api.v1.assets_bulk`, `api.v1.assets_tags`, `api.v1.assets_versions`, `api.v1.assets_maintenance`, `services.asset` |
| Image/Video Generation | `/generate` | `overview.md`, `GENERATION_GUIDE.md` | `features/generation/` | `api.v1.generations`, `services.generation` |
| Game Worlds | `/worlds`, `/simulation` | `game.md` | `features/worldTools/` | `api.v1.game_worlds`, `api.v1.game_sessions`, `domain.game` |
| Interactions | `/interaction-studio` | `INTERACTION_AUTHORING_GUIDE.md`, `INTERACTION_PLUGIN_MANIFEST.md` | `features/interactions/` | `api.v1.interactions`, `api.v1.npc_state`, `domain.game.interactions` |
| Scene/Arc Graphs | `/graph/:id`, `/graph-editor` | `NPC_RESPONSE_GRAPH_DESIGN.md` | `features/graph/` | `api.v1.action_blocks`, `api.v1.game_scenes`, `api.v1.character_graph` |
| Prompt System | `/prompt-lab` | `SEMANTIC_PACKS_IMPLEMENTATION.md`, `PROMPT_SYSTEM_REVIEW.md` | `features/prompts/` | `api.v1.prompts`, `api.v1.semantic_packs`, `api.v1.dev_prompt_categories` |
| Provider Accounts | `/providers`, `/accounts` | `provider-accounts.md`, `provider-capabilities.md` | `features/providers/` | `api.v1.providers`, `api.v1.accounts`, `api.v1.accounts_credits`, `services.provider` |
| Workspace/Dockview | `/workspace` | `README.md` | `features/workspace/`, `lib/dockview/` | - |
| Panel System | - | `COMPONENTS.md` | `features/panels/` | - |
| HUD System | - | `HUD_LAYOUT_DESIGNER.md` | `features/hud/` | - |
| Simulation Playground | `/simulation-playground` | `simulation.md` | `features/simulation/` | `services.simulation` |
| Plugin System | `/plugins` | `PLUGIN_SYSTEM.md`, `PLUGIN_DEVELOPER_GUIDE.md` | `features/plugins/` | `api.v1.plugins`, `infrastructure.plugins` |
| Narrative Engine | - | `ENGINE_SPECIFICATION.md`, `ENGINE_USAGE.md`, `RUNTIME.md` | `features/narrative/`, `packages/game/engine/src/narrative/` | `services.narrative` |
| Control Center | - | `CONTROL_CUBES.md` | `features/controlCenter/` | - |
| Gallery | `/gallery` | - | `features/gallery/` | - |
| Gizmo System | - | `GIZMO_SURFACES_AND_DEBUG_DASHBOARDS.md` | `features/gizmos/`, `lib/game/gizmos/`, `packages/scene/gizmos/` | - |
| Intimacy System | - | - | `features/intimacy/` | - |
| Scene Management | - | - | `features/scene/` | `api.v1.game_scenes` |
| Settings | `/settings` | - | `features/settings/` | - |
| Arc Graph Editor | `/arc-graph` | - | `features/graph/` | - |
| Game World | `/game-world` | - | `features/worldTools/` | - |
| 2D Game | `/game-2d` | - | `features/simulation/` | - |
| Gizmo Lab | `/gizmo-lab` | - | `features/gizmos/` | - |
| Health Monitor | `/health` | - | `features/devtools/` | - |
| Interaction Demo | `/interaction-demo` | - | `features/interactions/` | - |
| Interaction Studio | `/interaction-studio` | - | `features/interactions/` | - |
| NPC Brain Lab | `/npc-brain-lab` | - | `features/brainTools/` | - |
| NPC Portraits | `/npc-portraits` | - | `features/npcs/` | - |
| Overlay Configuration | `/settings/overlays` | - | `features/componentSettings/` | - |
| Plugins | `/plugins` | - | `features/plugins/` | - |
<!-- APP_MAP:END -->

---

## How to Use This Map

1. **Find a feature**: Look up the feature in the table above
2. **Navigate to code**: Use the Frontend/Backend columns to find source files
3. **Read documentation**: Follow doc links for detailed guides
4. **Test in browser**: Visit the route path in the running app

## Maintaining This Document

- **Registry**: Prefer JSDoc `@appMap.*` tags in feature modules; use `docs/app_map.sources.json` only as legacy fallback
- **Regenerate**: Run `pnpm docs:app-map` to update the table
- **Validate**: Run `pnpm docs:app-map:check` to verify outputs are current

---

## Related Documentation

- [Repository Map](./repo-map.md) - Detailed codebase structure
- [Architecture Overview](./architecture/) - System design documents
- [Development Guide](../DEVELOPMENT_GUIDE.md) - Setup and workflow
- [API Endpoints](./api/ENDPOINTS.md) - Generated API reference (run `pnpm docs:openapi`)
