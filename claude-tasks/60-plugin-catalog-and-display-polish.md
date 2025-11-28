**Task 60: Plugin Catalog & Display Topology Polish**

> **For Agents**
> - Finishes wiring newer plugin families (`workspace-panel`, `gizmo-surface`) into the unified plugin catalog and UI.
> - Makes plugin docs match the current code, and ensures catalog data is populated at runtime.
> - Tightens the new display-space / display-target helpers so they are easy to use and debug.
> - Read:
>   - `apps/main/src/lib/plugins/pluginSystem.ts`
>   - `apps/main/src/lib/plugins/registryBridge.ts`
>   - `apps/main/src/components/legacy/PluginCatalogPanel.tsx`
>   - `apps/main/src/lib/gizmos/*`
>   - `apps/main/src/types/display.ts`
>   - `apps/main/src/lib/display/displaySpaces.ts`
>   - `docs/UNIFIED_PLUGIN_SYSTEM.md`
>   - `docs/GAME_WORLD_DISPLAY_MODES.md`
>   - `claude-tasks/91-ui-registry-base-and-normalization.md` (frontend registry base & feature normalization)
>   - `claude-tasks/92-registry-bridge-simplification.md` (shared bridge helper patterns)

---

## Goals

1. Make the unified plugin docs accurately describe all current plugin families, including `workspace-panel` and `gizmo-surface`.
2. Ensure the plugin catalog is **actually populated** at runtime, so DevTools and plugin browsers see all built-ins (helpers, interactions, panels, gizmo surfaces, etc.).
3. Surface the new plugin families in the Plugin Catalog UI, so they can be inspected and filtered like other plugins.
4. Align gizmo surface metadata (`defaultEnabled`, `supportsContexts`, `tags`) with the plugin catalog activation model.
5. Polish the display-space / display-target helpers so world authors get clear feedback when `spaceId`/`surfaceId` are misconfigured.

Non-goals:
- No changes to how workspace layout or gizmo surfaces behave functionally (no new UX flows).
- No backend/schema changes; all work is on frontend types, registries, and docs.

---

## Phase Checklist

- [ ] **Phase 60.1 – Plugin Families & Docs Alignment**
- [ ] **Phase 60.2 – Catalog Bootstrap at Runtime**
- [ ] **Phase 60.3 – Plugin Catalog UI Integration**
- [ ] **Phase 60.4 – Gizmo Surface Activation & Metadata**
- [ ] **Phase 60.5 – Display Space Helper Polish**

**Status:** Not started.

---

## Phase 60.1 – Plugin Families & Docs Alignment

**Goal:** Update documentation so it reflects the current plugin families and metadata defined in `pluginSystem.ts`, especially `workspace-panel` and `gizmo-surface`.

### Plan

- In `docs/UNIFIED_PLUGIN_SYSTEM.md`:
  - Ensure the list of `PluginFamily` values matches `apps/main/src/lib/plugins/pluginSystem.ts`:
    - Include `workspace-panel` and `gizmo-surface` alongside existing families.
  - Add short subsections for each new family:
    - **Workspace Panel Plugins**:
      - Show the `PluginMetadataExtensions['workspace-panel']` structure: `panelId`, `category`, `supportsCompactMode`, `supportsMultipleInstances`.
      - Include a minimal example using `registerPanelWithPlugin`.
    - **Gizmo Surface Plugins**:
      - Show the `PluginMetadataExtensions['gizmo-surface']` structure: `gizmoSurfaceId`, `category`, `supportsContexts`, `icon`.
      - Include a minimal example using `registerGizmoSurface` / `registerBuiltinGizmoSurface`.
  - Cross-link to:
    - `docs/GIZMO_SURFACES_AND_DEBUG_DASHBOARDS.md` for gizmo surfaces,
    - `apps/main/src/lib/panels/PANEL_PLUGINS_AND_REGISTRY.md` for panel plugins.

### Verification

- Docs compile/markdown renders cleanly.
- A new contributor can:
  - See `workspace-panel` and `gizmo-surface` in the family list.
  - Follow the snippets to register a panel plugin or gizmo surface plugin without reading the source.

---

## Phase 60.2 – Catalog Bootstrap at Runtime

**Goal:** Call `syncCatalogFromRegistries()` once during app startup so the unified plugin catalog always reflects current built-in plugins (including panels and gizmo surfaces).

### Plan

- In `apps/main/src/lib/plugins/registryBridge.ts`:
  - Confirm `syncCatalogFromRegistries()` already synchronizes:
    - helpers, interactions, node types, renderers, world tools, graph editors,
    - workspace panels via `panelRegistry`,
    - gizmo surfaces via `gizmoSurfaceRegistry`.

- In `apps/main/src/main.tsx`:
  - Add an import:
    ```ts
    import { syncCatalogFromRegistries } from './lib/plugins/registryBridge';
    ```
  - After core registries are initialized (mini-games, dev tools, gallery surfaces/tools, gizmo surfaces), call:
    ```ts
    syncCatalogFromRegistries();
    ```
  - Ensure this call is **safe to run multiple times** (it should be idempotent due to the `if (!pluginCatalog.get(...))` checks).

### Verification

- At runtime, the plugin catalog contains entries for:
  - built-in helpers, interactions, node types, renderers, world tools, graph editors,
  - workspace panels (`family: 'workspace-panel'`),
  - gizmo surfaces (`family: 'gizmo-surface'`).
- DevTools plugin views (e.g. plugin catalog, gizmo surfaces panel) see all built-ins without needing manual bootstrap.

---

## Phase 60.3 – Plugin Catalog UI Integration

**Goal:** Update the Plugin Catalog UI so it recognizes and displays the new plugin families (`workspace-panel`, `gizmo-surface`) in a useful way.

### Plan

- In `apps/main/src/components/legacy/PluginCatalogPanel.tsx`:
  - Extend the kind-to-icon and kind-to-label maps (or equivalent) so plugin entries representing panels and gizmo surfaces:
    - get a reasonable icon (even a placeholder emoji is ok),
    - have human-readable labels, e.g. “Workspace Panel” and “Gizmo Surface”.
  - Ensure filters and grouping logic treat these families sanely:
    - They should appear in the main list and in grouped views.
    - If the panel distinguishes “kinds” differently from `PluginFamily`, adapt the mapping or add a “Other / System” kind grouping to include them.

- Optionally, for each plugin detail view:
  - Show relevant metadata if present:
    - For workspace panels: `panelId`, `category`, `supportsCompactMode`, `supportsMultipleInstances`.
    - For gizmo surfaces: `gizmoSurfaceId`, `category`, `supportsContexts`, `icon`.

### Verification

- Opening Plugin Catalog shows entries for both:
  - `workspace-panel` family plugins,
  - `gizmo-surface` family plugins.
- Filtering/grouping still works and does not crash on unknown kinds.
- Basic metadata is visible so devs can understand what each panel or gizmo surface does.

---

## Phase 60.4 – Gizmo Surface Activation & Metadata

**Goal:** Make gizmo surface metadata (`defaultEnabled`, `supportsContexts`, `tags`) line up with plugin catalog activation semantics so DevTools can present meaningful toggles and filters.

### Plan

- In `apps/main/src/lib/gizmos/surfaceRegistry.ts` and `apps/main/src/lib/gizmos/registerGizmoSurfaces.ts`:
  - Confirm all built-in gizmo surfaces set sensible values for:
    - `category`,
    - `supportsContexts`,
    - `tags`,
    - `defaultEnabled` (where appropriate).

- In `apps/main/src/lib/plugins/registryBridge.ts` within `registerGizmoSurface`:
  - Use `surface.defaultEnabled` to drive the initial `activationState` when not explicitly overridden:
    ```ts
    const activationState: ActivationState =
      options.activationState
      ?? (surface.defaultEnabled === false ? 'inactive' : 'active');
    ```
  - Pass through `supportsContexts` and `tags` as already implemented, ensuring they are present in catalog metadata.

- In any DevTools surface that lists gizmo surfaces (e.g. `GizmoSurfacesPanel`):
  - Use `supportsContexts` to filter surfaces by current context (scene editor, game 2D/3D, workspace, hud).
  - Use catalog activation state (via `pluginActivationManager` or the store) to reflect enabled/disabled state.

### Verification

- Newly registered gizmo surfaces appear in the catalog with activation state derived from `defaultEnabled` when not overridden.
- Gizmo DevTools UIs can:
  - filter surfaces by context,
  - show correct active/inactive state,
  - toggle surfaces (where allowed) in a way that stays consistent with the plugin catalog.

---

## Phase 60.5 – Display Space Helper Polish

**Goal:** Make the new display-space / display-target helpers easy to adopt and debug by aligning them with the docs and providing clear diagnostics for misconfigurations.

### Plan

- In `apps/main/src/types/display.ts`:
  - Add concise JSDoc for:
    - `DisplaySpaceKind`, `DisplaySpaceDefinition`, `DisplaySurfaceConfig`,
    - `DisplayTarget`, `GameWorldDisplayMeta`, `ResolvedDisplayTarget`.
  - Include a “See also” link to `docs/GAME_WORLD_DISPLAY_MODES.md` at the top of the file.

- In `apps/main/src/lib/display/displaySpaces.ts`:
  - Consider adding optional logging in `resolveDisplayTargetFromWorldMeta` when resolution fails, guarded by a flag or dev-only mode (to avoid noisy logs in production):
    - Example: `console.warn` when:
      - `target.spaceId` is set but not found in `meta.display.spaces`,
      - `target.surfaceId` is set but no matching surface exists in the space.
  - Ensure that the function remains **pure** (no throw) and still returns `null` on failure; logging is just for observability.

- Optional: add a tiny dev helper (or snippet in docs) demonstrating how to call `resolveDisplayTargetFromWorldMeta(world.meta, hotspot.meta.displayTarget)` in editor/dev panels to debug world display setups.

### Verification

- TypeScript users get helpful inline docs when hovering over display-space types.
- Misconfigured `spaceId` / `surfaceId` result in clear warnings in the console (in dev), rather than silent `null`s.
- The behavior documented in `GAME_WORLD_DISPLAY_MODES.md` matches the types and helper functions in code.

---

## Success Criteria

- The unified plugin docs and runtime catalog both recognize `workspace-panel` and `gizmo-surface` families, with accurate metadata and examples.
- At app startup, the plugin catalog is automatically populated from all legacy registries, including panels and gizmo surfaces.
- Plugin catalog UI can display and filter the new families without errors.
- Gizmo surfaces use `defaultEnabled`, `supportsContexts`, and `tags` in a way that aligns with plugin activation semantics.
- Display-space and display-target helpers are documented, and misconfigurations are easy to spot via logs and dev tools.
