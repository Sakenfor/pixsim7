**Task 55: Panel Plugins & Registry Bridge**

> **For Agents**
> - Promotes workspace panels to a first-class plugin family.
> - Connects `panelRegistry` with the unified plugin system so panels can be discovered, enabled/disabled, and extended via plugins.
> - Read:
>   - `claude-tasks/50-workspace-panel-system-enhancement.md`
>   - `apps/main/src/lib/panels/panelRegistry.ts`
>   - `apps/main/src/lib/panels/corePanelsPlugin.tsx`
>   - `apps/main/src/lib/plugins/pluginSystem.ts`
>   - `apps/main/src/lib/plugins/registryBridge.ts`

---

## Goals

1. Define a `workspace-panel` plugin family in the unified plugin system.
2. Add a bridge that keeps `panelRegistry` and `pluginCatalog` in sync.
3. Register built-in panels as built-in plugins with origin and activation metadata.
4. Allow external bundles to contribute new panels without editing core code.

Non-goals:
- No changes to workspace layout state (`workspaceStore`).
- No new panel behaviors beyond plugin-awareness and metadata.

---

## Phase Checklist

- [ ] **Phase 55.1 – Panel Plugin Family & Metadata**
- [ ] **Phase 55.2 – Registry Bridge**
- [ ] **Phase 55.3 – Built-in Panels as Plugins**
- [ ] **Phase 55.4 – Plugin Browser UI**
- [ ] **Phase 55.5 – UX & Docs**

**Status:** Not started.

---

## Phase 55.1 – Panel Plugin Family & Metadata

**Goal:** Add a `workspace-panel` family and metadata extension.

### Plan

- In `pluginSystem.ts`:
  - Extend `PluginFamily`:
    ```ts
    export type PluginFamily =
      | 'world-tool'
      | 'helper'
      | 'interaction'
      | 'gallery-tool'
      | 'node-type'
      | 'renderer'
      | 'ui-plugin'
      | 'graph-editor'
      | 'workspace-panel';
    ```
  - Add metadata extension:
    ```ts
    'workspace-panel': {
      panelId: string;
      category?: 'core' | 'development' | 'game' | 'tools' | 'custom';
      supportsCompactMode?: boolean;
      supportsMultipleInstances?: boolean;
    };
    ```

### Verification

- Type-level support for `'workspace-panel'` exists and compiles.

---

## Phase 55.2 – Registry Bridge

**Goal:** Provide a helper that registers a panel into both `panelRegistry` and `pluginCatalog`.

### Plan

- In `registryBridge.ts`:
  - Import `panelRegistry` and `PanelDefinition`.
  - Add:
    ```ts
    export function registerPanelWithPlugin(
      panel: PanelDefinition,
      options: RegisterWithMetadataOptions = {}
    ): void {
      panelRegistry.register(panel);

      pluginCatalog.register({
        id: panel.id,
        name: panel.title,
        family: 'workspace-panel',
        origin: options.origin ?? 'builtin',
        activationState: options.activationState ?? 'active',
        canDisable: options.canDisable ?? true,
        category: panel.category,
        tags: panel.tags,
        panelId: panel.id,
        supportsCompactMode: panel.supportsCompactMode,
        supportsMultipleInstances: panel.supportsMultipleInstances,
        ...options.metadata,
      } as ExtendedPluginMetadata<'workspace-panel'>);
    }
    ```

### Verification

- Calling `registerPanelWithPlugin` registers a panel and a plugin catalog entry.

---

## Phase 55.3 – Built-in Panels as Plugins

**Goal:** Register all current core panels via the bridge, with proper origin/activation metadata.

### Plan

- In `corePanelsPlugin.tsx`:
  - During `initialize`, iterate over `corePanelsPlugin.panels` and call a helper like `registerBuiltinPanel(panelDef)`, which wraps `registerPanelWithPlugin(panelDef, { origin: 'builtin', canDisable: false })`.
- Ensure that:
  - All built-in panel IDs appear in `panelRegistry`.
  - `pluginCatalog.getByFamily('workspace-panel')` returns entries for each.

### Verification

- After initialization, built-in panels show up in plugin catalog as `origin: 'builtin'` and `canDisable: false`.

---

## Phase 55.4 – Plugin Browser UI

**Goal:** Surface panel plugins in the Plugin Browser, with basic management controls.

### Plan

- In `PluginBrowserPanel.tsx`:
  - Add a section/tab for **Panels**:
    - List `family = 'workspace-panel'` plugins.
    - Show id, name, category, origin, activationState.
    - Provide enable/disable toggles for `canDisable === true` (for non-core panels).
- Decide behavior for disabled panels:
  - Easiest: mark them as disabled in `panelConfigStore` and hide from visibility lists / creation.

### Verification

- Panel plugins appear in Plugin Browser.
- Disabling a non-core panel hides it from panel configuration and prevents new instances.

---

## Phase 55.5 – UX & Docs

**Goal:** Make panel plugin behavior visible and documented.

### Plan

- In `PanelConfigurationPanel`:
  - For each panel, show a small “from plugin: X” badge when appropriate (based on plugin metadata).
- Docs:
  - Add a short section to `SYSTEM_OVERVIEW.md` explaining that workspace panels are registry + plugin-driven.
  - Optional: `PANEL_PLUGINS_AND_REGISTRY.md` with:
    - How to define a panel plugin.
    - How to register via `registerPanelWithPlugin`.
    - How activation/disable interacts with `panelConfigStore`.

### Verification

- Developers can follow docs + UI to:
  - See which panels are built-in vs plugin.
  - Add new panel plugins without changing core panel code.

