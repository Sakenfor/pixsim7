# Task: Editor Context & Shared Panel Header Integration (Workspace Shell)

**Status:** draft / in-progress  
**Area:** Frontend – Workspace shell, panel system, game tools  
**Related docs:**  
- `claude-tasks/game-creator-journey/GAME_CREATOR_JOURNEY.md`  
- `apps/main/src/components/layout/DockviewWorkspace.tsx`  
- `apps/main/src/lib/panels/panelRegistry.ts`  
- `apps/main/src/lib/context/editorContext.ts`  
- `apps/main/src/components/panels/shared/PanelHeader.tsx`  
- `apps/main/src/components/panels/tools/GameToolsPanel.tsx`

---

## Background & Intent

We want the workspace experience to feel coherent and mode‑aware, similar to Blender’s editors, while keeping our flexible, panel‑based layout. Right now:

- Panels are registered via `panelRegistry` and rendered via `PanelWrapper` inside `DockviewWorkspace`.
- Context (world, scene, runtime, workspace) is spread across multiple Zustand stores and accessed ad‑hoc by each panel.
- Some panels have their own ad‑hoc headers; others are bare content.

This task introduces a **shared editor context** (a `bpy.context` analogue) plus a **common panel header shell** that is injected by the workspace, not re‑implemented per panel. The goal is to make panels feel like part of one editor, without losing modularity or over‑hard‑coding layouts.

---

## Goals

1. Provide a **read‑only editor context hook** (`useEditorContext`) that panels/tools can rely on to answer “what am I editing right now?”:
   - World + location
   - Scene + selection + active graph editor surface (later)
   - Runtime/session mode (turn‑based vs real‑time etc.)
   - Workspace preset + visible panels

2. Have **all Dockview panels share a common header** (`PanelHeader`), injected once via `PanelWrapper` based on panel metadata + editor context, rather than each panel drawing its own chrome.

3. Use this shared header as the future hook for Blender‑style behavior:
   - Clicking the panel title opens a small “switch editor/panel type” menu (not fully implemented in this task, but the API should be ready for it).

4. Keep everything **complementary** to the existing registry/plugin systems and workspace presets (no hard‑coding of genres or rigid UI modes).

---

## Current State (as of this task)

Already in place (initial pass):

- `apps/main/src/lib/context/editorContext.ts`
  - `useEditorContext()` derives a small `EditorContext` from existing stores:
    - `worldId`, `locationId` from `useWorldContextStore`
    - `currentSceneId`, `currentScene` from `useGraphStore`
    - `selectedNodeIds` from `useSelectionStore`
    - `context` (session/mode) from `useGameStateStore`
    - `activePresetId`, `dockviewLayout` from `useWorkspaceStore`
    - **`editor.primaryView`** and **`editor.mode`** derived via `deriveEditorState.ts`:
      - `primaryView`: Which core editor is focused (`'game'`, `'flow'`, `'world'`, or `'none'`)
      - `mode`: Current editing mode (`'play'`, `'edit-flow'`, `'layout'`, `'debug'`, or `null`)
      - Automatically derived from active panels, presets, and runtime state

- `apps/main/src/components/panels/shared/PanelHeader.tsx`
  - Shared header component with:
    - `title`, optional `icon`
    - `category` (workspace / scene / world / game / tools / dev / system / utilities / custom)
    - `contextLabel`, optional `statusIcon` + `statusLabel`
    - `onClickTitle` for future “switch editor” behavior
    - `onOpenMenu` for panel options

- `apps/main/src/components/layout/DockviewWorkspace.tsx`
  - `PanelWrapper` now:
    - Looks up panel defs from `panelRegistry`
    - Calls `useEditorContext()`
    - Wraps every panel component with `PanelHeader` + a content container
    - Derives context labels using `resolveContextLabel()` based on panel's `contextLabel` strategy
    - **For core editors** (panels with `coreEditorRole`), enhances labels with mode info:
      - Flow View: `"Edit Flow • Scene: intro"`
      - Game View: `"Play • Session #1"`
    - Uses `getModeLabel()` to convert editor mode to human-readable labels

- `apps/main/src/components/panels/tools/GameToolsPanel.tsx`
  - Uses the shared wrapper header (no custom header inside)
  - **Mode-aware tool catalog** that adapts to editor context:
    - Reads `editor.primaryView` and `editor.mode` via `useEditorContext()`
    - Suggests default filters based on `primaryView` (flow tools for Flow View, world tools for World View, etc.)
    - Reorders sections to prioritize tools relevant to current `mode` (e.g., interactions/HUD in play mode)
    - Shows context indicator displaying current mode and view
  - Renders a catalog of: World tools, flow/graph panels, interaction plugins, HUD widgets, other panels, and dev plugins

This task formalizes and extends this work, and sets clear next steps and acceptance criteria.

---

## Scope

### In scope

- Solidifying the API and usage of `useEditorContext()` as the primary “editor context” hook.
- Ensuring **PanelWrapper + PanelHeader** integration is robust and not panel‑specific.
- Making `GameToolsPanel` a first‑class panel powered by the shared header.
- Documenting how new panels should consume context and present themselves.

### Out of scope (for this task)

- Implementing the full “switch editor/panel type” UI behind `PanelHeader.onClickTitle`.
- Large workspace preset refactors (those are driven by `GAME_CREATOR_JOURNEY.md` but can be separate tasks).
- Deep refactors inside individual panels (GraphPanel, GameWorld, etc.) beyond minor header/context wiring.

---

## Implementation Steps

### 1. Finalize `EditorContext` shape

- [ ] Review and refine `EditorContext` in `apps/main/src/lib/context/editorContext.ts`:
  - World:
    - `id`, `locationId` (current selection)
    - Optional `name`, `locationName` (can be filled from cached world/location lists as a later enhancement)
  - Scene:
    - `id`, `title`
    - `editorId` (e.g., `'scene-graph-v2'`, `'arc-graph'`) – initially `null`, but reserved for future graph editor registry integration
    - `selection` (node IDs)
  - Runtime:
    - `sessionId`, `worldTimeSeconds`, `mode` (from `useGameStateStore.context`)
  - Workspace:
    - `activePresetId`
    - `activePanels` (derived from `dockviewLayout.panels`)

- [ ] Keep `useEditorContext()` **read‑only** – all writes still go through the underlying Zustand stores.

### 2. Make `PanelWrapper + PanelHeader` the standard shell

- [ ] Ensure `PanelWrapper` in `DockviewWorkspace.tsx`:
  - Resolves the panel from `panelRegistry` using `panelId` from Dockview props.
  - Calls `useEditorContext()` once per panel render.
  - Maps `panelDef.category` to `PanelHeader.category` via a simple mapping (workspace/scene/world/game/tools/dev/system/utilities/custom).
  - Builds a `contextLabel` using `EditorContext`:
    - `graph`: scene title + world id when available
    - `scene` panels: scene title
    - `game` panels: session id or world id
    - `health` / system panels: preset id or other relevant summary
  - Wraps the panel component as:

    ```tsx
    <div className="h-full w-full flex flex-col bg-white dark:bg-neutral-900" data-panel-id={panelId}>
      <PanelHeader
        title={panelDef.title}
        category={mappedCategory}
        contextLabel={contextLabel}
        // onClickTitle and onOpenMenu left for future use
      />
      <div className="flex-1 min-h-0 overflow-auto">
        <Component />
      </div>
    </div>
    ```

- [ ] Avoid panel‑specific branching in `PanelWrapper` as much as possible; keep the `contextLabel` logic shallow and generic, with a few special cases for now.

### 3. Register & integrate `GameToolsPanel`

- [ ] Register `GameToolsPanel` in `corePanelsPlugin` (or a dedicated tools/dev plugin) as a `tools` or `dev` panel:
  - `id`: e.g. `'game-tools'`
  - `title`: `"Game Tools"`
  - `category`: `'tools'` or `'dev'`
  - `tags`: e.g. `['game', 'tools', 'catalog']`
  - `description`: e.g. `"Browse world tools, interactions, HUD widgets, and dev plugins"`

- [ ] Optionally add `game-tools` to at least one workspace preset (e.g. a “Playtest & Tools” layout) to make it discoverable.

### 4. Lightly adopt `useEditorContext` in 1–2 key panels

The heavy lifting happens in `PanelWrapper`, but a couple of panels can benefit from direct access to context:

- [ ] In GraphPanel toolbar (legacy core editor), use `useEditorContext()` instead of re‑pulling from stores when it’s convenient (e.g. for summarizing scene/world in the toolbar text).  
- [ ] In GameWorld or Game2D, use `useEditorContext()` for display‑only bits where it reduces store wiring.  

This isn’t required for correctness but helps validate the API shape and encourages consistent usage.

### 5. Prepare for future “switch editor/panel type” behavior

- [ ] Keep `PanelHeader.onClickTitle` and `PanelHeader.onOpenMenu` wired through `PanelWrapper`, but **no behavior is required yet**.  
- [ ] Document (in code comments and/or this task) the intended future behavior:
  - Clicking the header title in a graph panel should eventually open a menu of registered graph editor surfaces (scene graph vs arc graph, etc.).
  - Clicking the header title in other panels could open a “Replace panel with…” menu based on `panelRegistry` and `panelDef.category`.

This ensures the header and wrapper APIs are ready without forcing immediate implementation.

---

## Acceptance Criteria

- `useEditorContext()` exists, is typed, and is used by `PanelWrapper` (and optionally 1–2 panels) as a read‑only source of editor state.
- All Dockview panels rendered via `DockviewWorkspace` display the shared `PanelHeader`:
  - Correct panel title from `panelRegistry`
  - Category tag derived from `panelDef.category`
  - A sensible `contextLabel` in at least these cases: Graph, Scene‑related, Game, Health/system.
- `GameToolsPanel`:
  - No longer defines its own header; it relies on `PanelWrapper + PanelHeader`.
  - Is registered as a panel (via `corePanelsPlugin` or similar) and appears in the panel registry.
- No panel loses functionality due to the header wrapper (scrolling, overflow, and sizing remain correct).
- No new hard‑coded genre logic is introduced; everything remains driven by registries + editor context + panel metadata.

---

## Extended Context: `editor.primaryView` and `editor.mode`

As part of the **Core Editors & Workspace Modes** task (`CORE_EDITORS_AND_WORKSPACES_TASK.md`), `EditorContext` was extended with an `editor` section that tracks high-level editing context:

```ts
export interface EditorContext {
  // ... world, scene, runtime, workspace ...
  editor: {
    primaryView: 'game' | 'flow' | 'world' | 'none';
    mode: 'play' | 'edit-flow' | 'layout' | 'debug' | null;
  };
}
```

### `editor.primaryView`

Indicates which **core editor** is currently the focus:

- **`'game'`**: Game View (Game2D) is primary — runtime/play viewport
- **`'flow'`**: Flow View (Graph editor) is primary — logic/flow editor
- **`'world'`**: World editor (GameWorld) is primary — world/location editor
- **`'none'`**: No clear primary view

This is **derived** from:
1. Active runtime mode (if game is running, `primaryView` is `'game'`)
2. Current workspace preset ID (presets hint at their intended primary view)
3. Active panels in the layout (fallback heuristic)

### `editor.mode`

Indicates the current **high-level editing mode**:

- **`'play'`**: Game is running (Game View focus)
- **`'edit-flow'`**: Flow editing mode (Flow View focus)
- **`'layout'`**: HUD/layout/world tools mode
- **`'debug'`**: Dev tools, inspectors, validation mode
- **`null`**: No specific mode detected

### Usage in Panels and Headers

- **PanelWrapper** passes `coreEditorRole` to `resolveContextLabel`, allowing core editors to display enhanced context labels that include mode info (e.g., "Edit Flow • Scene: intro")
- **GameToolsPanel** uses `editor.primaryView` to suggest a default filter and displays a context indicator showing the current mode and view

### Design Notes

- These fields are **derived**, not a new source of truth — all writes still go through underlying stores
- The derivation rules are intentionally **simple heuristics** that can be refined over time
- This supports the Blender-like goal of making "modes" visible without hard-coding genre-specific layouts

See `CORE_EDITORS_AND_WORKSPACES_TASK.md` for full implementation details.

---

## Notes & Extensions

- This task is complementary to `GAME_CREATOR_JOURNEY.md`. EditorContext and PanelHeader are infrastructural steps that make "modes" and "tool families" visible and consistent without rigid layouts.
- Follow‑up tasks can focus on:
  - A true "switch editor" menu on panel title click, driven by `graphEditorRegistry` and `panelRegistry`.
  - Workspace preset refinements (World & Locations, Narrative & Flow, Playtest & Tuning).
  - A more opinionated "Game Tools" UX (open panel, jump to route, show activation state, etc.).

