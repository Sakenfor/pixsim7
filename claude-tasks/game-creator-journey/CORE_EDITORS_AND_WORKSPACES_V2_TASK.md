# Task: Core Editors & Workspace Modes (Reimplementation on Current Main)

**Status:** planned  
**Area:** Frontend – Workspace presets, editor identity, UX structure  
**Related docs:**  
- `claude-tasks/game-creator-journey/GAME_CREATOR_JOURNEY.md`  
- `claude-tasks/game-creator-journey/EDITOR_CONTEXT_AND_PANEL_HEADER_TASK.md`  
- `claude-tasks/game-creator-journey/CORE_EDITORS_AND_WORKSPACES_TASK.md` (original implementation)  
- `apps/main/src/components/layout/DockviewWorkspace.tsx`  
- `apps/main/src/stores/workspaceStore.ts`  
- `apps/main/src/routes/Game2D.tsx`  
- Graph editor host / registration (`apps/main/src/lib/graph/*`)  

---

## Background & Intent

An earlier branch (`claude/core-editors-workspaces-01J5LDgxkGeAuGw4W3JzQch2`) implemented **core editors** and **workspace modes**, but it was coupled to large backend removals (brain/stat/analysis systems) and is no longer safe to merge directly.

The design intent from that branch is still valid:

- Clearly name and elevate two **core editors**:
  - **Game View** – the primary runtime/play viewport (currently `Game2D`).
  - **Flow View** – the primary logic/graph editor (scene/flow graph).
- Represent high-level **editor state** in a shared context:
  - `editor.primaryView`: `'game' | 'flow' | 'world' | 'none'`
  - `editor.mode`: `'play' | 'edit-flow' | 'layout' | 'debug' | null`
- Provide curated **workspace presets** that center those editors (with other panels as satellites).
- Use this context in headers/tools (PanelHeader, GameToolsPanel) for clearer orientation.

This task is to **re-implement** that idea on top of the current `main` branch, respecting the newer brain/state and runtime work, without importing the old branch’s large deletions.

---

## Core Concepts (unchanged)

### Core Editors

1. **Game View (canonical runtime viewport)**
   - Current implementation: `Game2D` route (`apps/main/src/routes/Game2D.tsx`).
   - Purpose: show the game as the player sees it (world, HUD, interactions).

2. **Flow View (canonical logic/flow editor)**
   - Current implementation: scene or flow graph editor (`GraphEditorHost` / graph panel).
   - Purpose: design scenes/flows, choices, transitions.

### Satellite Editors & Tools

- World editor (world/locations).
- HUD/overlay editors.
- Tool panels (world tools, dev tools, inspection, validation, plugins).

These orbit the core editors rather than competing as equal “views.”

### Modes

High-level modes describe what the editor is *doing*, not genre/theme:

- `primaryView`: `'game' | 'flow' | 'world' | 'none'`
- `mode`:
  - `'play'` – actively running the game.
  - `'edit-flow'` – editing graphs/flows.
  - `'layout'` – arranging HUD/world layout and tools.
  - `'debug'` – focusing on dev tools, logs, inspectors.

---

## Goals

1. **Expose editor.primaryView + editor.mode in EditorContext**, derived from existing state.
2. **Mark core editors in panel metadata** (e.g., `coreEditorRole` on panel definitions).
3. **Define workspace presets** that clearly center a core editor:
   - World & Locations (world editor–centric).
   - Narrative & Flow (flow editor–centric).
   - Playtest & Tuning (game view–centric).
4. **Reflect editor context in headers and tools**:
   - Panel headers show view/mode (e.g., “Edit Flow • Scene: intro”).  
   - GameToolsPanel can bias its UI based on `primaryView`/`mode`.
5. Maintain **flexibility**: presets and metadata should not lock layouts or modes; they’re guidance, not constraints.

---

## Implementation Steps

### Phase 1 – Extend EditorContext

**Goal:** Add editor view/mode to the shared context, derived from current UI state.

**Key Steps:**

1. Update `apps/main/src/lib/context/editorContext.ts`:
   - Extend `EditorContext` (or equivalent type) with:
     ```ts
     editor: {
       primaryView: 'game' | 'flow' | 'world' | 'none';
       mode: 'play' | 'edit-flow' | 'layout' | 'debug' | null;
     };
     ```
2. Derive `primaryView` from:
   - Active route (e.g., Game2D route active ⇒ `'game'`).
   - Active panels in Dockview/workspace (e.g., graph panel in focus ⇒ `'flow'`).
   - World-editor panel focus ⇒ `'world'`.
3. Derive `mode` from a combination of:
   - Game/runtime state (if available) for `'play'`.
   - Active flow/graph editor for `'edit-flow'`.
   - HUD/world layout panels for `'layout'`.
   - Dev/inspection panels for `'debug'` when nothing else dominates.
4. Keep these heuristics simple and side-effect free; they can be refined later.

Deliverable: `useEditorContext()` exposes `editor.primaryView` and `editor.mode` for other components.

---

### Phase 2 – Annotate Core Editors

**Goal:** Mark Game View and Flow View explicitly in panel/route metadata.

**Key Steps:**

1. Introduce an optional `coreEditorRole` on panel definitions (likely in `panelRegistry` types):
   ```ts
   coreEditorRole?: 'game-view' | 'flow-view' | 'world-editor' | 'none';
   ```
2. Tag relevant panels:
   - Game2D / Game View panel: `coreEditorRole: 'game-view'`.
   - Graph editor panel: `coreEditorRole: 'flow-view'`.
   - World editor panel: `coreEditorRole: 'world-editor'` (if present).
3. Optionally, add clear JSDoc comments on the Game2D route and graph registration indicating they are canonical core editors.

Deliverable: Panel registry knows which panels are core editors, and EditorContext can use this if needed.

---

### Phase 3 – Workspace Presets

**Goal:** Provide curated layouts that foreground a core editor and satellites.

**Key Steps:**

1. Edit `apps/main/src/stores/workspaceStore.ts` to define or update presets:
   - **World & Locations**
     - Primary region: world editor and world tools.
     - Secondary: Game View/HUD preview, asset browser, world tools panel.
   - **Narrative & Flow**
     - Primary: Flow graph editor + scene/graph context.
     - Secondary: inspector, validation, world context selector.
   - **Playtest & Tuning**
     - Primary: Game View (Game2D) with runtime state panel.
     - Secondary: world tools, HUD designer, brain/relationship tools, dev console.
2. Ensure presets can still be customized by the user; they’re starting points, not rigid layouts.

Deliverable: Workspace selector shows these named presets with layouts centered on core editors.

---

### Phase 4 – Panel Headers & GameToolsPanel

**Goal:** Surface editor context in the UI so users see which core editor and mode they’re in.

**Key Steps:**

1. Update `PanelHeader` / `PanelWrapper` (wherever context labels are built) to:
   - Use `editor.primaryView` and `editor.mode` to augment labels for core editors, e.g.:
     - Game View panel: `"Play • Session #X"`
     - Flow View panel: `"Edit Flow • Scene: intro"`
2. Update `apps/main/src/components/panels/tools/GameToolsPanel.tsx` to:
   - Read `editor.primaryView` / `editor.mode` via `useEditorContext()`.
   - Use this to reorder or highlight tools that are most relevant to the current context (e.g., flow tools when in Flow View).
   - Keep behavior soft: no tools should disappear solely based on mode.

Deliverable: Headers and GameToolsPanel respond to editor context, making the app feel more “mode-aware” while staying flexible.

---

### Phase 5 – Docs & Follow-Ups

**Goal:** Document the pattern and leave hooks for future improvements.

**Key Steps:**

1. Update or append a short section in:
   - `GAME_CREATOR_JOURNEY.md` explaining Core Editors (Game View, Flow View) and modes.
   - `EDITOR_CONTEXT_AND_PANEL_HEADER_TASK.md` describing how `editor.primaryView`/`mode` should be used by headers and panels.
2. Optionally, note the existence of the earlier branch and that this implementation supersedes it on current `main`.

Potential follow-ups (separate tasks):

- Add a top-level “mode switcher” UI component (e.g., in workspace toolbar).
- Allow switching between alternative flow editors (scene graph vs arc graph) under the Flow View umbrella.
- Per-world workspace presets driven by world metadata.

---

## Acceptance Criteria

- `EditorContext` exposes `editor.primaryView` and `editor.mode`, with reasonable heuristics.
- Game2D and the scene/flow graph editor are clearly marked as core editors (Game View and Flow View).
- Workspace presets exist for:
  - World & Locations
  - Narrative & Flow
  - Playtest & Tuning
- Panel headers for these core editors include the current mode in their context labels.
- GameToolsPanel can see `editor.primaryView`/`mode` and at least uses them for ordering/highlighting.
- No existing brain/stat/runtime or backend systems need to be removed to support this; the implementation is additive over current `main`.

