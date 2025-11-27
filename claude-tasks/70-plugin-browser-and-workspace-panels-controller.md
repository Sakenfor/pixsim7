**Task 70: Plugin Browser & Workspace Panels Controller**

> **For Agents**
> - Refactors the Plugin Browser into a controller + presentational component pattern.
> - Centralizes plugin catalog filtering and workspace panel activation logic in hooks.
> - Use this when:
>   - Touching `PluginBrowser` or workspace-panel plugin listing/activation.
>   - Adding new filters, categories, or origin indicators.
> - Read first:
>   - `apps/main/src/components/plugins/PluginBrowser.tsx`
>   - `apps/main/src/lib/plugins/catalog.ts`
>   - `apps/main/src/lib/plugins/pluginSystem.ts`

---

## Context

Current behavior:

- `PluginBrowser` (`apps/main/src/components/plugins/PluginBrowser.tsx`) mixes:
  - UI for:
    - Legacy plugins (tab + filters + list).
    - Workspace panels (tab + filters + cards with enable/disable).
  - Logic for:
    - Loading plugins via `listAllPlugins()` and the `pluginCatalog`.
    - Filtering by:
      - Search query.
      - Plugin kind.
      - Category.
      - Feature.
    - Workspace panels:
      - Loading via `pluginCatalog.getByFamily('workspace-panel')`.
      - Filtering by search, category, origin.
      - Activation toggling via `pluginActivationManager`.
- As with AssetsRoute before Task 68, this makes `PluginBrowser` hard to evolve:
  - Adding a new filter or origin category requires patching JSX + logic together.
  - The same plugin information may be needed elsewhere (e.g., a dev tool or settings pane) without a shared controller.

Goal: mirror the pattern used for QuickGenerate / Assets / Curator:

- Controller hooks for logic:
  - `usePluginBrowserController`
- UI components focused on layout and wiring:
  - `PluginBrowser` and `WorkspacePanelsBrowser` become thin views.

---

## Goals

1. **Separate Plugin Browser logic from presentation**
   - Extract all plugin loading/filtering/activation logic into a controller hook.

2. **Provide reusable, testable plugin state**
   - Let other dev tools (e.g., future plugin settings panels) reuse the same controller.

3. **Keep behavior and UI unchanged**
   - No functional changes yet: same filters, same lists, same activation toggles.

---

## Phase Checklist

- [ ] **Phase 70.1 – Legacy Plugin Browser Controller**
- [ ] **Phase 70.2 – Workspace Panels Browser Controller**
- [ ] **Phase 70.3 – Wire PluginBrowser to Controllers**

---

## Phase 70.1 – Legacy Plugin Browser Controller

**Goal**  
Extract all logic for the “Legacy Plugins” tab into `usePluginBrowserController`, leaving `PluginBrowser` to render only.

**Scope**

- New hook: `apps/main/src/hooks/usePluginBrowserController.ts`
- Existing logic in `PluginBrowser`:
  - `plugins`, `searchQuery`, `kindFilter`, `categoryFilter`, `featureFilter`.
  - `categories`, `features`.
  - `filteredPlugins`.
  - `hasControlCenterPlugins`.

**Key Responsibilities**

- In the hook:
  - Load `plugins` via `listAllPlugins()`.
  - Maintain state:
    - `searchQuery`, `kindFilter`, `categoryFilter`, `featureFilter`.
  - Compute:
    - `categories` via `getUniqueCategories`.
    - `features` via `getUniqueFeatures`.
    - `filteredPlugins` via `searchPlugins` + filters.
    - `hasControlCenterPlugins`.

**API shape (suggested)**

```ts
export type BrowserTab = 'legacy' | 'workspace-panels';

export function usePluginBrowserController() {
  return {
    activeTab, setActiveTab,
    plugins, filteredPlugins,
    searchQuery, setSearchQuery,
    kindFilter, setKindFilter,
    categoryFilter, setCategoryFilter,
    featureFilter, setFeatureFilter,
    categories, features,
    hasControlCenterPlugins,
    // workspace panel fields in Phase 70.2
  };
}
```

**Acceptance Criteria**

- `PluginBrowser` no longer calls `listAllPlugins` or maintains its own filter state.
- All legacy plugin logic flows through the controller.
- Visible behavior is unchanged (same counts and filtered results).

---

## Phase 70.2 – Workspace Panels Browser Controller

**Goal**  
Extract workspace panel plugin logic into the same controller hook, so `WorkspacePanelsBrowser` only renders.

**Scope**

- `apps/main/src/hooks/usePluginBrowserController.ts`
- `WorkspacePanelsBrowser` inside `PluginBrowser.tsx`
- `pluginCatalog` / `pluginActivationManager` usage

**Key Responsibilities**

- In the controller:
  - Load workspace panel plugins via `pluginCatalog.getByFamily('workspace-panel')`.
  - Subscribe to catalog changes (via `pluginCatalog.subscribe` or similar).
  - Maintain state:
    - `panelPlugins`.
    - `panelSearchQuery`.
    - `panelCategoryFilter` (`'all' | 'core' | 'development' | 'game' | 'tools' | 'custom'`).
    - `panelOriginFilter` (`'all' | 'builtin' | 'plugin-dir' | 'ui-bundle'`).
  - Compute:
    - `filteredPanelPlugins` using search + category + origin.
  - Expose activation toggles:

    ```ts
    handleTogglePanelActivation: (id: string) => void;
    ```

**Acceptance Criteria**

- `WorkspacePanelsBrowser` gets all data + callbacks from props, not from local state:
  - `panelPlugins`, `filteredPanelPlugins`, `searchQuery`, `setSearchQuery`, `categoryFilter`, `setCategoryFilter`, `originFilter`, `setOriginFilter`, `onToggleActivation`.
- The behavior of:
  - Filtering.
  - Enable/disable toggles.
  remains identical.

---

## Phase 70.3 – Wire PluginBrowser to Controllers

**Goal**  
Refactor `PluginBrowser` to use the controller hook and pass down data/actions to `WorkspacePanelsBrowser`.

**Scope**

- `apps/main/src/components/plugins/PluginBrowser.tsx`

**Key Steps**

1. Replace local state and effects with `usePluginBrowserController`:
   - Remove the direct `useState`/`useEffect`/`useMemo` logic for plugin loading and filters.
   - Use controller fields instead in the JSX.
2. Adapt `WorkspacePanelsBrowser` signature:
   - From a local-state component to a presentational component receiving props from the controller.
3. Verify:
   - Switching tabs still works.
   - All filters apply as before.
   - Activation toggles still call `pluginActivationManager.togglePlugin` (via the controller).

**Acceptance Criteria**

- `PluginBrowser`:
  - Does not directly import `listAllPlugins`, `getUniqueCategories`, `pluginCatalog`, or `pluginActivationManager`.
  - Only deals with rendering and calling controller setters/callbacks.
- `WorkspacePanelsBrowser`:
  - Has no internal state for search/category/origin; everything is driven by props.

---

## Notes & Future Work

- With the controller in place:
  - Other surfaces (e.g. a future “Plugin Settings” view in Settings) can reuse the controller to render subsets or diagnostics.
  - Adding new filters (e.g., “control-center plugins only”, “experimental only”) becomes a small change to the controller + a small UI tweak.
- Non-goal here:
  - We do not change how plugins are registered or the plugin system itself—only how the browser component is structured.

