# Frontend Lib Overview (Registries & Plugins)

This directory contains shared frontend infrastructure for PixSim7: registries, plugin bridges, layout helpers, and feature‑scoped libs (graph, gizmos, gallery, game, etc.).

This section is specifically for **registries and plugin integration**.

## Registry Conventions

- Most UI systems expose a small, in‑memory registry:
  - Panels: `apps/main/src/lib/panels/panelRegistry.ts`
  - Dev tools: `apps/main/src/lib/devtools/devToolRegistry.ts`
  - Graph editors: `apps/main/src/lib/graph/editorRegistry.ts`
  - Gizmo surfaces: `apps/main/src/lib/gizmos/surfaceRegistry.ts`
  - Widgets: `apps/main/src/lib/widgets/widgetRegistry.ts`
  - Control center modules: `apps/main/src/lib/control/controlCenterModuleRegistry.ts`
  - Data binding: `apps/main/src/lib/dataBinding/dataSourceRegistry.ts`

Core rules:

- **Prefer a shared base**: new registries should extend the generic base once Task 91 is implemented:
  - `apps/main/src/lib/core/BaseRegistry.ts` (see `claude-tasks/91-ui-registry-base-and-normalization.md`)
- **Expose a singleton**:
  - e.g. `export const panelRegistry = new PanelRegistry();`
- **Keep domain logic in the concrete registry**:
  - Category helpers (`getByCategory`), visibility helpers (`getVisible`), stats (`getStats`), etc.

If you add a new registry:

- Put it under the closest feature directory (e.g. `lib/hud`, `lib/game`, `lib/gallery`).
- Use the same pattern: `class XxxRegistry extends BaseRegistry<Definition> { … }` + `export const xxxRegistry = new XxxRegistry();`.

## Plugin Catalog Bridge

The unified plugin catalog lives in:

- `apps/main/src/lib/plugins/pluginSystem.ts`
- `apps/main/src/lib/plugins/registryBridge.ts`

Patterns:

- “Legacy” registries (helpers, interactions, node types, panels, dev tools, graph editors, gizmo surfaces, world tools) are kept as the source of truth.
- `registryBridge.ts` provides helpers like:
  - `registerPanelWithPlugin(panel, options?)`
  - `registerBuiltinPanel(panel)`
  - `registerWorldTool(tool, options?)`
  - `registerBuiltinWorldTool(tool)`
  - …and similar for other families.
- These helpers:
  1. Register your item in the appropriate registry.
  2. Register metadata in the plugin catalog (family, origin, activation state, tags).

When adding new plugin‑style extensions:

- **Do not** call `pluginCatalog.register` directly from feature code.
- **Do** add a small helper in `registryBridge.ts` that:
  - Registers in the registry (`xxxRegistry.register(...)`).
  - Builds `ExtendedPluginMetadata<'your-family'>` and calls `pluginCatalog.register(...)`.

See `claude-tasks/92-registry-bridge-simplification.md` for the planned shared helper pattern and catalog family inventory.

## Quick Pointers

- Centralized exports for core registries:
  - `apps/main/src/lib/registries.ts`
- Panel plugin docs:
  - `apps/main/src/lib/panels/PANEL_PLUGINS_AND_REGISTRY.md`
- Gizmo/gizmo‑surface docs:
  - `apps/main/src/lib/gizmos/*`
- Gallery tools and surfaces:
  - `apps/main/src/lib/gallery/README.md`

