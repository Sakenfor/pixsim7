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

The App Map table is a merge of two registries:

1) **Generated registry (optional)**  
   `docs/app_map.generated.json` is produced from code metadata when available.
   If it does not exist, only manual entries are used.

2) **Manual registry (authoritative for docs/backend links)**  
   `docs/app_map.sources.json` contains doc paths and backend module references.

`scripts/generate-app-map.ts` merges these into the table in this file.

### Code-Derived Metadata

When generating `app_map.generated.json`, use:

- **Module pages**: `apps/main/src/app/modules/types.ts`  
  `Module.page` fields such as `route`, `description`, `category`, `featureId`, and
  `featurePrimary` provide feature/route metadata.

- **Actions**: `packages/shared/types/src/actions.ts`  
  `ActionDefinition` (and module `page.actions`) provide action metadata.  
  Use `contexts` and `visibility` to opt actions into specific UI surfaces.

### Add a Feature to the App Map

1) **Front-end metadata**  
   Add or update the module `page` definition (route, description, `featureId`).

2) **Actions (optional)**  
   Declare actions in `page.actions` using `ActionDefinition`.

3) **Docs and backend**  
   Add or update the entry in `docs/app_map.sources.json`.

4) **Regenerate**
   Run `pnpm codegen --only app-map` to update the table.

### Comment Conventions (Planned)

If we later parse comments into the generated registry, use short JSDoc lines
on module and action definitions. Keep them concise and descriptive.

## Live App Map Registry

The table below is auto-generated from `docs/app_map.sources.json`. Run `pnpm codegen --only app-map` to refresh.

<!-- APP_MAP:START -->
| Feature | Routes | Docs | Frontend | Backend |
|---------|--------|------|----------|---------|
| Browser Automation | `/automation` | `automation.md` | `features/automation/` | `api.v1.automation`, `api.v1.device_agents`, `services.automation` |
| Asset Management | `/assets`, `/gallery` | - | `features/assets/` | `api.v1.assets`, `api.v1.assets_bulk`, `api.v1.assets_tags`, `api.v1.assets_versions`, `api.v1.assets_maintenance`, `services.asset` |
| Image/Video Generation | `/generate` | `overview.md`, `GENERATION_GUIDE.md` | `features/generation/` | `api.v1.generations`, `services.generation` |
| Game Worlds | `/worlds`, `/simulation` | `game.md` | `features/worldTools/` | `api.v1.game_worlds`, `api.v1.game_sessions`, `domain.game` |
| NPC Interactions | `/interaction-studio` | `INTERACTION_AUTHORING_GUIDE.md`, `INTERACTION_PLUGIN_MANIFEST.md` | `features/interactions/` | `api.v1.npc_interactions`, `api.v1.npc_state`, `domain.game.interactions` |
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

- **Registry**: Edit `docs/app_map.sources.json` to add/update features
- **Regenerate**: Run `python update_app_map.py` to update the table
- **Validate**: Run `python scripts/docs_check.py` to verify all paths exist

---

## Related Documentation

- [Repository Map](./repo-map.md) - Detailed codebase structure
- [Architecture Overview](./architecture/) - System design documents
- [Development Guide](../DEVELOPMENT_GUIDE.md) - Setup and workflow
- [API Endpoints](./api/ENDPOINTS.md) - Generated API reference (run `pnpm docs:openapi`)
