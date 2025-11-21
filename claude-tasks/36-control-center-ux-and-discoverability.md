**Task: Control Center UX & Discoverability**

> **For Agents (How to use this file)**
> - This task refines the Control Center experience so that:
>   - All three modes (Dock, Cube Formation V1, Cube System V2) are discoverable and easy to switch between.
>   - Keyboard shortcuts and status are clear.
>   - Plugin/Settings surfaces reflect control center choices.
> - Use it when you:
>   - Touch control center components, plugin registry, or settings UI.
> - Read these first:
>   - `docs/APP_MAP.md` – overview of Control Center and where it sits in the UI
>   - `apps/main/src/components/control/ControlCenterManager.tsx`
>   - `apps/main/src/lib/plugins/controlCenterPlugin.ts`
>   - Control center plugins under `apps/main/src/plugins/ui/` (dock, cube-formation-v1, cube-system-v2)

---

## Context

Current state:

- Control centers are implemented as plugins:
  - `dock-control-center`
  - `cube-formation-v1`
  - `cube-system-v2`
- `ControlCenterManager` renders the active control center and provides:
  - A selector overlay (Ctrl+Shift+X).
  - A quick switcher button in the bottom-left corner.
- However:
  - Users may not know the selector exists or what modes are available.
  - There’s no single Settings entry that explains the three modes and their pros/cons.
  - Plugin Manager UI doesn’t highlight which plugins provide control centers.

This task is about making the Control Center system **self-explanatory** and easy to use without reading the source.

---

## Phase Checklist

- [ ] **Phase 36.1 – Settings Panel for Control Center Modes**
- [ ] **Phase 36.2 – Selector & Quick Switcher UX Polish**
- [ ] **Phase 36.3 – Plugin Manager Integration for Control Centers**

---

## Phase 36.1 – Settings Panel for Control Center Modes

**Goal**  
Expose Control Center mode selection in a dedicated Settings section so users can discover and change modes without remembering shortcuts.

**Scope**

- Settings UI:
  - The main app settings route/panel (wherever global settings live).
  - If none exists yet, a minimal “Settings → Control Center” section.
- Control Center registry:
  - `controlCenterRegistry.getAll()` / `getActiveId()`

**Key Steps**

1. Add a small “Control Center” section to Settings:
   - List the available modes from `controlCenterRegistry.getAll()`:
     - Dock Mode
     - Cube Formation (Original)
     - Cube System V2 (3D)
   - Show:
     - Display name.
     - Short description.
     - Small tag list for features.
2. Allow mode selection from settings:
   - Clicking a mode calls `controlCenterRegistry.setActive(id)` and updates the UI.
   - Show a brief confirmation (toast or inline message) like “Switched to Cube System V2 (3D)”.
3. Display keyboard shortcut hint:
   - E.g., “Tip: Press Ctrl+Shift+X to open the Control Center selector.”

**Status:** `[ ]` Not started

---

## Phase 36.2 – Selector & Quick Switcher UX Polish

**Goal**  
Make the selector overlay and quick switcher feel polished and consistent, and ensure they always remain accessible (even in 3D modes).

**Scope**

- `apps/main/src/components/control/ControlCenterManager.tsx`
- Control center implementations that might overlap UI:
  - `CubeSystemV2` root container / z-index

**Key Steps**

1. Ensure z-index ordering:
   - Quick switcher and selector overlay should always be above any control center content (including CubeSystemV2).
   - Adjust z-index in CubeSystemV2 if necessary to avoid covering the bottom-left button.
2. UX tweaks:
   - In the selector overlay, show the current active mode more clearly (e.g., bigger “ACTIVE” badge, subtle glow).
   - Add a one-line hint in the overlay about:
     - The shortcut (Ctrl+Shift+X).
     - The fact that switching is instant and reversible.
3. Ensure no mode disables the selector:
   - Verify that pressing Ctrl+Shift+X always opens or toggles the selector, regardless of the active control center.

**Status:** `[ ]` Not started

---

## Phase 36.3 – Plugin Manager Integration for Control Centers

**Goal**  
Make it clear in the Plugin Manager which plugins provide control centers and how they relate to the selector.

**Scope**

- Plugin Manager route:
  - `apps/main/src/routes/PluginWorkspace.tsx` or `PluginManagerUI`
- Control center plugin manifest:
  - `ControlCenterPluginManifest` in `controlCenterPlugin.ts`

**Key Steps**

1. Highlight control center plugins in the Plugin Manager:
   - Add a badge or tag (e.g., “Control Center”) to plugins with `controlCenter` metadata.
   - Show their `controlCenter.displayName` and description.
2. Add a quick link from Plugin Manager to Control Center Settings:
   - E.g., a “Configure Control Center” button that navigates to the settings section or opens the selector overlay.
3. Optionally, allow enabling/disabling non-default control centers:
   - If the plugin system supports disabling plugins, reflect that in both the registry and the selector (e.g., hide disabled modes or show them as “Disabled” with a re-enable button).

**Status:** `[ ]` Not started

