**Task 52: Workspace Panel & Builder UX Polish**

> **For Agents (How to use this file)**
> - This task focuses on **UI/UX fit-and-finish** for the workspace panel system, plugin-based panel registry, and Panel Builder.
> - Assumes Task 50 (Workspace Panel System Enhancement) and Task 51 (Builder Data Sources) are implemented and merged.
> - Do not introduce new major architecture; instead, refine and integrate what already exists.
> - Read these first:
>   - `claude-tasks/50-workspace-panel-system-enhancement.md` – Core panel + builder architecture
>   - `claude-tasks/51-builder-data-sources.md` – Data binding system used by widgets
>   - `apps/main/src/stores/workspaceStore.ts` – Workspace layouts, presets, profiles
>   - `apps/main/src/lib/panels/panelRegistry.ts` – Panel registry (definitions, lookup)
>   - `apps/main/src/lib/dataBinding/*` – Data source + binding resolution
>   - `apps/main/src/components/settings/*` – Panel configuration, layout editor, plugin browser
>   - `apps/main/src/components/builder/*` – Panel Builder UI

---

## Context

After Tasks 50 and 51, the workspace system now has:

- **Panel registry**: Panel definitions registered dynamically and used by Dockview + floating panels.
- **Panel configuration UI**: PanelConfigurationPanel, LayoutEditorPanel, WorkspaceProfileManager.
- **Plugin-based panels**: PluginBrowserPanel surfacing panel plugins from the unified plugin system.
- **Panel Builder / Composer**: Widget-based panel composition with layouts and data bindings.
- **Data binding infrastructure**: Data sources, transforms, and hooks in `lib/dataBinding`.

What is still missing is a **coherent, polished UX** that:

- Makes panel customization **discoverable** (panel config, layout editor, builder, plugin browser).
- Provides clear **visual affordances** and **empty states**.
- Handles **errors and missing pieces** gracefully (missing plugins, invalid bindings).
- Gives users **confidence** to experiment without breaking their workspace.

This task (52) is about finishing the experience so content creators and developers can actually live in this workspace.

---

## Goals

1. **Unify entry points** for panel configuration, plugins, and builder into a coherent workspace UX.
2. **Polish panel configuration and layout editor UIs** for clarity, discoverability, and safety.
3. **Improve Panel Builder UX** (selection, editing, data binding feedback, empty states).
4. **Surface panel/plugin origin and state** (builtin vs plugin, active vs inactive, missing).
5. **Tighten accessibility and keyboard navigation** across workspace-related UIs.

Non-goals:
- No new plugin families or major architectural changes.
- No new data-binding capabilities beyond those in Task 51 (just better UX around them).
- No changes to backend schemas or GameWorld/GameScene models.

---

## Phase Checklist

- [ ] **Phase 52.1 – Workspace Entry Points & Navigation**
- [ ] **Phase 52.2 – Panel Configuration & Layout Editor Polish**
- [ ] **Phase 52.3 – Plugin & Panel Registry UX**
- [ ] **Phase 52.4 – Panel Builder UX & Data Binding Feedback**
- [ ] **Phase 52.5 – Accessibility, Shortcuts & Docs**

**Overall Status:** Waiting – start after Tasks 50 & 51 are merged and basic flows work.

---

## Phase 52.1 – Workspace Entry Points & Navigation

**Goal:** Make all workspace customization tools discoverable and reachable from a consistent place.

### Features

- [ ] **Workspace Menu / Toolbar**
  - Add a dedicated “Workspace” entry (menu item or toolbar) that exposes:
    - “Panel Library & Visibility…” (PanelConfigurationPanel).
    - “Layout Editor…” (LayoutEditorPanel).
    - “Profiles…” (WorkspaceProfileManager).
    - “Panel Builder…” (Panel Builder route/panel).
    - “Plugins & Panels…” (PluginBrowserPanel).
  - Reflect the **current profile** name and lock state in the workspace chrome (e.g., label + icon).

- [ ] **Panel-Level Shortcuts**
  - From any panel header (Dockview + floating):
    - Provide a “Customize Panel…” action that deep-links into PanelConfigurationPanel focused on that panel.
    - Provide a “Duplicate in Builder…” action when applicable (e.g., opens builder with a template that includes a widget mirroring this panel’s data).

- [ ] **First-Run Helper**
  - On first run (or when no presets exist), show a subtle helper that points users to:
    - The workspace menu / toolbar.
    - A recommended starting preset or panel configuration.

### Files to Touch (likely)

- `apps/main/src/components/layout/DockviewWorkspace.tsx` – Add workspace UI affordances (toolbar, profile name, links to config routes).
- `apps/main/src/components/layout/FloatingPanelsManager.tsx` – Panel header actions that jump into configuration/builder.
- `apps/main/src/routes/*` – Ensure routes for configuration, plugins, builder are wired and navigable.

### Verification

- [ ] All customization tools are reachable within 1–2 clicks from the main workspace.
- [ ] Workspace menu/toolbar reflects current profile and lock state.
- [ ] Panel-level “Customize” actions navigate to the correct panel in the config UI.

---

## Phase 52.2 – Panel Configuration & Layout Editor Polish

**Goal:** Make panel configuration and layout editing less “raw” and more guided.

### A. PanelConfigurationPanel UX

- [ ] **Panel List Improvements**
  - Group panels by category (core, game, tools, custom, plugin).
  - Show icon + short description + origin (builtin/plugin).
  - Support search/filter by name, category, and tags.
  - Clarify enabled/disabled state with consistent toggles and hint text.

- [ ] **Per-Panel Settings**
  - For each panel, show:
    - Basic settings (from `PanelDefinition.defaultSettings` and user overrides).
    - Active instances (if multiple instances are allowed).
  - Provide a “Reset to defaults” action per panel.

### B. LayoutEditorPanel UX

- [ ] **Visual Feedback & Safety**
  - Highlight drop targets when dragging panels.
  - Indicate locked regions clearly when workspace is locked.
  - Provide a “Reset Layout to Profile Default” action.
  - Confirm destructive operations (e.g., “Clear layout”, “Delete preset/profile”).

- [ ] **Profile Awareness**
  - Make it clear which profile’s layout is being edited.
  - When switching profiles, prompt to save unsaved changes (if applicable).

### Files to Touch (likely)

- `apps/main/src/components/settings/PanelConfigurationPanel.tsx`
- `apps/main/src/components/settings/LayoutEditorPanel.tsx`
- `apps/main/src/components/settings/WorkspaceProfileManager.tsx`
- `apps/main/src/stores/workspaceStore.ts` – Only for minor UX flags (e.g., “unsaved changes” indicators), not architectural changes.

### Verification

- [ ] Users can easily find and understand panel visibility and settings.
- [ ] Layout editor clearly communicates actions and consequences.
- [ ] Profiles feel first-class and hard to accidentally corrupt.

---

## Phase 52.3 – Plugin & Panel Registry UX

**Goal:** Make it obvious which panels come from plugins, and handle missing or disabled plugins gracefully.

### Features

- [ ] **PluginBrowserPanel Enhancements**
  - For each plugin, list its contributed panels (from panel registry metadata).
  - Show activation state badges and origin.
  - Allow enabling/disabling plugins and, when supported, individual panels.

- [ ] **Missing Panel Handling**
  - When a layout refers to a panel that no longer exists (plugin removed/disabled):
    - Render a placeholder panel that explains the situation.
    - Offer actions: “Remove from layout”, “Open Plugins Browser”, “Open Panel Config”.

- [ ] **Panel Registry Diagnostics**
  - Add a small “registry debug” section (hidden behind a dev toggle) that shows:
    - Count of registered panels, by category and origin.
    - Quick link to plugin logs/diagnostics.

### Files to Touch (likely)

- `apps/main/src/components/settings/PluginBrowserPanel.tsx`
- `apps/main/src/lib/panels/panelRegistry.ts`
- `apps/main/src/components/layout/DockviewWorkspace.tsx` – Placeholder rendering for missing panels.

### Verification

- [ ] Users can tell which panels come from which plugin.
- [ ] Layouts degrade gracefully when plugins/panels are missing.
- [ ] Panel registry state is inspectable during development.

---

## Phase 52.4 – Panel Builder UX & Data Binding Feedback

**Goal:** Make the Panel Builder feel approachable and trustworthy, with clear feedback for data bindings.

### A. Builder Canvas & Widgets

- [ ] **Selection & Editing**
  - Clear selection state for widgets (outline, handles).
  - Keyboard navigation between widgets (arrow keys, tab) where practical.
  - Obvious controls for resize, move, and delete.

- [ ] **Modes & Actions**
  - Distinguish between “Edit” mode and “Preview” mode for a panel composition.
  - Provide explicit “Save” and “Discard changes” actions with confirmation when discarding.

### B. Data Binding UX

- [ ] **Binding Editor Feedback**
  - Clearly show when a widget has:
    - No bindings configured.
    - Partially configured bindings (e.g., source selected but invalid path).
    - Invalid bindings (missing source, missing transform, errors).
  - For each binding, surface:
    - Current resolved value (or sample data, if in preview mode).
    - Any error messages from the resolver in a user-friendly way.

- [ ] **Source & Transform Browsing**
  - Use `dataSourceRegistry.getAllSources()` and `getAllTransforms()` to:
    - Provide categorized lists of available sources (by store/type).
    - Provide transform descriptions and examples.

### C. Defaults & Examples

- [ ] **Example Dashboards**
  - Ship at least 2–3 example composed panels (e.g., “Scene Dashboard”, “NPC Health Overview”) as presets.
  - Expose them in the builder as “Start from template” options.

### Files to Touch (likely)

- `apps/main/src/components/builder/PanelBuilderCanvas.tsx`
- `apps/main/src/components/builder/WidgetLibrary.tsx`
- `apps/main/src/components/builder/WidgetInspector.tsx`
- `apps/main/src/components/builder/DataBindingEditor.tsx`
- `apps/main/src/lib/dataBinding/useDataBindings.ts`

### Verification

- [ ] Users can build and edit simple dashboards without getting lost.
- [ ] Binding errors are visible but non-breaking.
- [ ] Example dashboards load correctly and show live data where available.

---

## Phase 52.5 – Accessibility, Shortcuts & Docs

**Goal:** Ensure the workspace, panel configuration, plugins, and builder UIs are usable with keyboard and screen readers, and are documented.

### Accessibility & Shortcuts

- [ ] **Keyboard Navigation**
  - Ensure all major controls in:
    - Panel headers (Dockview + floating).
    - PanelConfigurationPanel, LayoutEditorPanel, WorkspaceProfileManager.
    - PluginBrowserPanel.
    - Panel Builder (canvas + sidebars).
  - Are reachable and operable via keyboard.

- [ ] **ARIA & Semantics**
  - Add appropriate ARIA labels and roles for:
    - Tabs, panels, dialogs, and menus.
    - Builder widgets and selection states.
  - Verify that error messages from data binding appear in screen-reader-friendly ways.

### Documentation

- [ ] **Workspace UX Guide**
  - Add or update docs (e.g., `docs/SYSTEM_OVERVIEW.md` or a new `docs/WORKSPACE_PANEL_UX.md`) to cover:
    - How to show/hide panels and manage profiles.
    - How to use Panel Builder and data bindings at a high level.
    - How plugins relate to panels and panels to composed dashboards.

- [ ] **In-Product Help**
  - Add short “?” help links or tooltips in:
    - PanelConfigurationPanel.
    - LayoutEditorPanel.
    - PluginBrowserPanel.
    - Panel Builder.

### Verification

- [ ] Tab order is sane in all workspace-related UIs.
- [ ] Basic screen-reader checks pass (labels, roles, focus states).
- [ ] Docs reflect the final UX and link to relevant panels/routes.

---

## Success Criteria

- Workspace customization tools (config, layout, profiles, builder, plugins) feel like a **coherent UX**, not a set of disconnected screens.
- Users can:
  - Discover and change panel visibility and layouts.
  - Understand where panels come from (builtin vs plugin).
  - Build simple dashboards with live data and see clear feedback when something is misconfigured.
- Error states (missing panels/plugins, invalid bindings) are handled gracefully.
- Accessibility and documentation meet a reasonable baseline so others can extend and maintain the system comfortably.

