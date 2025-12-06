# Task: Core Editors & Workspace Modes (Game View + Flow View)

**Status:** draft / not started  
**Area:** Frontend – Workspace presets, editor identity, UX structure  
**Related docs:**  
- `claude-tasks/game-creator-journey/GAME_CREATOR_JOURNEY.md`  
- `claude-tasks/game-creator-journey/EDITOR_CONTEXT_AND_PANEL_HEADER_TASK.md`  
- `apps/main/src/components/layout/DockviewWorkspace.tsx`  
- `apps/main/src/stores/workspaceStore.ts`  
- `apps/main/src/routes/Game2D.tsx`  
- `apps/main/src/components/legacy/GraphPanel.tsx` (+ GraphEditorHost)

---

## Background & Intent

PixSim7’s workspace is intentionally panel‑based and flexible (Dockview + panel registry), similar to Blender’s editor system. However, we don’t yet have clearly named **core editors** or **modes** the way Blender has “3D View”, “UV Editor”, and “modes” like Object/Edit/Weight Paint.

Today, multiple surfaces (Graph, GameWorld, Game2D, HUD editor, dev tools) appear as peers. This makes the system powerful but can feel directionless: there is no obvious “canonical space” where the game primarily lives.

The goal of this task is to:

- Explicitly define **Core Editors**:
  - **Game View** – the primary runtime/play viewport (Game2D for now).
  - **Flow View** – the primary logic/sequence editor (scene Graph editor).
- Align workspace presets and header/context to make these editors **visibly central**, with other panels acting as satellites.
- Introduce the notion of high‑level **modes** (play, flow edit, layout, debug) that are reflected in the editor context and UI, without hard‑coding genres or rigid layouts.

This builds on (and uses) the existing `editorContext` and `PanelHeader` infrastructure, and the panel/workspace registry, rather than replacing them.

---

## Core Concepts

### Core Editors

1. **Game View (canonical runtime viewport)**
   - Current implementation: `Game2D` route (`apps/main/src/routes/Game2D.tsx`).
   - Purpose: show the game as the player sees it (world, HUD, overlays, interactions).
   - Future: could include 3D views or other runtime views, but conceptually “the viewport where the game runs.”

2. **Flow View (canonical logic/flow editor)**
   - Current implementation: scene graph editor (`GraphPanelWithProvider` / `GraphEditorHost`).
   - Purpose: design flows (scenes, nodes, choices, transitions, edge effects).
   - Future: extended via graph editor registry (e.g. scene graph vs arc graph) but still the primary logic surface.

### Satellite Editors & Tools

- **World editor**: GameWorld (locations, hotspots, world meta).
- **HUD / overlay editors**: HUD Designer, HUD Layout Editor, overlay config.
- **Tool panels**: World tools, gizmo panels, dev tools, health/validation, plugin tools.

These are important but conceptually revolve around **Game View** and **Flow View**, rather than all being equal top‑level “views.”

### Modes (high-level)

We don’t want hard‑coded modes everywhere, but we do want a small shared vocabulary in editor context:

- **Primary view**: `'game' | 'flow' | 'world' | 'none'`
- **Editor mode** (optional, broad):
  - `'play'` – Game running (Game2D focus).
  - `'edit-flow'` – Graph editing (Flow View focus).
  - `'layout'` – HUD/layout/world tools focus.
  - `'debug'` – Dev tools, inspectors, overlays, validation.

These will be represented in `EditorContext` and used to shape workspaces and headers, not to hard‑lock layouts.

---

## Goals

1. **Declare Game View and Flow View as core editors** in code and docs, and hook them into `EditorContext` and panel metadata.
2. **Update workspace presets** so at least three curated presets clearly center one of the core editors and group satellites around it:
   - World & Locations (world editor‑centric).
   - Narrative & Flow (Flow View‑centric).
   - Playtest & Tuning (Game View‑centric).
3. **Expose “primary view” and a simple “mode” in EditorContext**, so panels, headers, and the Game Tools panel can adapt their presentation.
4. Keep the system **genre‑agnostic** and panel‑based: no hardcoded “romance mode”, “stealth mode”, etc. Modes are about *what the editor is doing* (play, edit flow, layout, debug), not content themes.

---

## Implementation Steps

### 1. Extend EditorContext with view + mode

Update `apps/main/src/lib/context/editorContext.ts` to add an `editor` section:

```ts
export interface EditorContext {
  // existing world/scene/runtime/workspace
  editor: {
    primaryView: 'game' | 'flow' | 'world' | 'none';
    mode: 'play' | 'edit-flow' | 'layout' | 'debug' | null;
  };
}
```

Populate this derivatively, not as a new source of truth:

- `primaryView`:
  - `'game'` if Game2D is active / in focus (e.g. route or active docked panel with id `'game-2d'` or similar).
  - `'flow'` if graph editor is active/foreground in the workspace.
  - `'world'` if GameWorld is foreground in a world‑centric workspace.
  - `'none'` if nothing obvious (fallback).
- `mode`:
  - `'play'` when `useGameStateStore.context` indicates active runtime mode (map/room/scene/conversation/menu).
  - `'edit-flow'` when a graph editor is active and no runtime session is active.
  - `'layout'` when HUD/overlay editor or world tools are foreground (e.g. active preset is “World & Locations” and Game View is in layout context).
  - `'debug'` when dev tools/health panels are foreground and no strong primary view is active.

These rules can be simple approximations at first and refined later.

### 2. Annotate core editors in panel/route metadata

- Add clear comments + types marking:
  - Game View:
    - `apps/main/src/routes/Game2D.tsx` – mark as core Game View.
  - Flow View:
    - Graph editor entry point in `apps/main/src/lib/graph/registerEditors.ts` / `GraphEditorHost` as core Flow View.

Optionally, extend `PanelDefinition` or capabilities metadata with a “coreEditorRole”:

```ts
// In panelRegistry types or a small extension:
coreEditorRole?: 'game-view' | 'flow-view' | 'world-editor' | 'none';
```

This can help workspace presets and the Game Tools panel highlight these panels.

### 3. Update workspace presets to reflect modes

In `apps/main/src/stores/workspaceStore.ts`, adjust or add presets so that:

- **World & Locations preset**
  - Centers GameWorld editor and related tools:
    - Panels: `game-world` (or equivalent), `gallery`, world tools, maybe Game2D/HUD preview.
  - Primary view: `'world'`, mode: `'layout'` or `'debug'` depending on tools.

- **Narrative & Flow preset**
  - Centers Flow View (Graph editor) and scene tooling:
    - Panels: `graph`, `scene`/SceneBuilder, `inspector`, `validation`, `edge-effects`, world context selector in Graph toolbar.
  - Primary view: `'flow'`, mode: `'edit-flow'`.

- **Playtest & Tuning preset**
  - Centers Game View (Game2D) and runtime tools:
    - Panels: `game-2d`/Game2D, session state viewer/dev tools, HUD designer, world tools, notifications.
  - Primary view: `'game'`, mode: `'play'` or `'debug'` depending on context.

Keep existing presets (like `default`, `minimal`) if useful, but ensure these three are clearly named and surfaced in the UI.

### 4. Reflect view + mode in PanelHeader and GameToolsPanel

Using `useEditorContext()`:

- Update `PanelWrapper`’s `contextLabel` logic to optionally incorporate `editor.primaryView` / `editor.mode`, e.g.:
  - For Game View panel: `"Play • Session #X • World #Y"`.
  - For Flow View: `"Edit Flow • Scene: intro • World #3"`.
- Update `GameToolsPanel` to:
  - Optionally highlight tools relevant to the current `primaryView` and `mode` (e.g., when `primaryView === 'flow'`, emphasize graph‑related tools).
  - This can be a soft ordering/pinning, not a strict filter.

No major visual redesign is required; the focus is on making the context visible and using it to order/prioritize tools.

### 5. Documentation and naming

- Update `GAME_CREATOR_JOURNEY.md` to explicitly name:
  - **Game View** as the canonical runtime viewport.
  - **Flow View** as the canonical flow/scene editor.
- Add a short note in `EDITOR_CONTEXT_AND_PANEL_HEADER_TASK.md` explaining how `editor.primaryView` and `editor.mode` are intended to be used by headers and panels.

---

## Acceptance Criteria

- `EditorContext` includes an `editor` section with `primaryView` and `mode`, populated from existing state (even if via simple heuristics initially).
- Game2D and the scene graph editor are **explicitly identified** (in comments/types/metadata) as the core Game View and Flow View, respectively.
- Workspace presets include at least three named layouts that clearly center one of the core editors:
  - World & Locations
  - Narrative & Flow
  - Playtest & Tuning
- `PanelHeader` / `PanelWrapper` use `EditorContext` to produce context labels that reflect which core editor is active and what mode the editor is in (play vs edit‑flow vs layout vs debug).
- `GameToolsPanel` is aware of `EditorContext.editor.primaryView` / `mode` in some form (even if only for future use / ordering), establishing the pattern for tools to adapt to the current editing context.
- No change prevents users from customizing Dockview layouts; these are curated presets and metadata, not hard‑coded layouts or mode locks.

---

## Notes & Follow-Ups

- Once this task is complete, follow‑up tasks can:
  - Implement an explicit “mode switcher” UI (e.g. a small selector in the workspace toolbar that toggles between Play / Flow Edit / Layout / Debug).
  - Add a “switch editor type” menu on panel headers for the Flow View (scene graph vs arc graph) using the graph editor registry.
  - Introduce HUD/layout presets per world/view mode that can be surfaced in the Game View and World & Locations workspace.

