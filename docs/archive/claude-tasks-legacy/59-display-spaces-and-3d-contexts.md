**Task 59: Display Spaces & 3D Contexts (Room‑Safe Modeling)**

> **For Agents**
> - Generalizes the current `display` model so we can support 3D “rooms” (and other 3D/AR/VR contexts) **without baking “room” into core types**.
> - Introduces **display spaces** (world‑level topology) and **display targets** (how hotspots/scenes point into that topology).
> - Builds on existing `GameHotspot.meta.display` modes (`fullscreen` / `surface` / `panel`) instead of replacing them.
> - Read:
>   - `docs/GAME_WORLD_DISPLAY_MODES.md`
>   - `docs/SYSTEM_OVERVIEW.md`
>   - `claude-tasks/50-workspace-panel-system-enhancement.md`
>   - `claude-tasks/58-hud-builder-integration.md`

---

## Goals

1. Define a **generic “display space”** concept at world level (rooms are just one `kind`).
2. Define a **display target** shape for hotspots/scenes to reference spaces/surfaces without knowing 3D details.
3. Update docs so 3D usage is modeled via **world meta + display spaces**, not new scene types.
4. Provide light TypeScript helpers/conventions that sit on top of `meta` JSON (no DB/schema changes).

Non-goals:
- No new core DB columns for `GameWorld`, `GameLocation`, `GameHotspot`, or `GameScene`.
- No new “3D scene” type; `Scene` stays world‑agnostic and 2D‑focused.
- No full 3D renderer implementation or room navigation; this task is about **modeling and contracts**, not rendering.

---

## Phase Checklist

- [ ] **Phase 59.1 – Display Space & Target Types**
- [ ] **Phase 59.2 – World & Hotspot Meta Conventions**
- [ ] **Phase 59.3 – Editor & Dev Tool Stubs**
- [ ] **Phase 59.4 – Docs & Examples**

**Status:** Not started.

---

## Phase 59.1 – Display Space & Target Types

**Goal:** Introduce generic **display space** and **display target** types that can be used from both world meta and frontend code, without constraining us to “rooms only”.

### Plan

- Add a small shared types module (location can be adjusted if there’s already a better home, e.g. `packages/types/src/display.ts` or a `display` section in an existing types file):

  ```ts
  // Example: packages/types/src/display.ts

  export type DisplaySpaceKind =
    | '3d-room'
    | '3d-outdoor'
    | '2d-layer'
    | 'ar-surface'
    | 'vr-space'
    | string;

  export interface DisplaySurfaceConfig {
    id: string;
    label: string;
    /** Optional hint for 3D engines (e.g. glTF node name, screen mesh id). */
    nodeName?: string;
    /** Arbitrary renderer-specific configuration (kept in JSON). */
    config?: Record<string, unknown>;
  }

  export interface DisplaySpaceDefinition {
    id: string;
    kind: DisplaySpaceKind;
    label: string;
    description?: string;
    /** Optional mapping of surface ids to surface configs. */
    surfaces?: DisplaySurfaceConfig[];
    /** Renderer-specific configuration (camera presets, nav meshes, etc.). */
    config?: Record<string, unknown>;
  }

  /**
   * A target inside the display topology. Can be used by hotspots, UI, or future triggers.
   */
  export interface DisplayTarget {
    /** Which space we want to target (e.g. a room, outdoor area, or 2D layer space). */
    spaceId?: string;
    /** Which surface within that space (e.g. "tv-screen", "billboard-main"). */
    surfaceId?: string;
    /** Optional logical layer/channel (useful for HUD/overlay semantics). */
    layerId?: string;
  }
  ```

- Ensure these types are **purely TypeScript** helpers that describe how JSON is structured in `meta` fields; they must not require DB migrations.

### Verification

- Types compile and can be imported from:
  - frontend world editor code,
  - any 3D renderer / runtime helpers,
  - future display‑related plugins.

---

## Phase 59.2 – World & Hotspot Meta Conventions

**Goal:** Define how display spaces and targets live inside existing `meta` JSON for `GameWorld` and `GameHotspot`, building on top of current `display` modes.

### Plan

- Extend `docs/GAME_WORLD_DISPLAY_MODES.md` to define **two layers**:
  1. **Display spaces topology** (world‑level):
     - Suggested convention inside `GameWorld.meta.display`:
       ```jsonc
       {
         "display": {
           "spaces": {
             "lounge": {
               "id": "lounge",
               "kind": "3d-room",
               "label": "Lounge",
               "surfaces": [
                 {
                   "id": "main-screen",
                   "label": "Main Screen",
                   "nodeName": "tv_screen_01"
                 }
               ],
               "config": {
                 "cameraPresets": ["wide", "closeup"],
                 "lightingProfile": "evening"
               }
             },
             "story-overlay": {
               "id": "story-overlay",
               "kind": "2d-layer",
               "label": "Story Overlay Layer"
             }
           }
         }
       }
       ```
     - This **does not add DB columns**; it’s purely a convention for how JSON is shaped in `GameWorld.meta`.

  2. **Display target references** (hotspot‑level):
     - Keep existing `GameHotspot.meta.display` *modes* (fullscreen / surface / panel) from the current doc.
     - Introduce a sibling `displayTarget` object based on the `DisplayTarget` type:
       ```jsonc
       {
         "meta": {
           "display": {
             "mode": "surface",
             "autoPlay": true,
             "pauseWorld": false,
             "closeOnEnd": false,
             "surface": {
               "fit": "cover",
               "loop": true,
               "emissive": true
             }
           },
           "displayTarget": {
             "spaceId": "lounge",
             "surfaceId": "main-screen"
           }
         }
       }
       ```
     - For non‑3D cases (e.g. fullscreen overlay), `displayTarget` can either be omitted or target a logical 2D space:
       ```jsonc
       {
         "meta": {
           "display": {
             "mode": "fullscreen",
             "pauseWorld": true
           },
           "displayTarget": {
             "spaceId": "story-overlay"
           }
         }
       }
       ```

- Clarify in the doc that:
  - **Scenes stay 2D and world‑agnostic** (no `spaceId` or `roomId` on `Scene` or `SceneNode`).
  - All 3D context lives in `GameWorld.meta.display.spaces` and `GameHotspot.meta.displayTarget` + `meta.display`.

### Verification

- Updated documentation clearly explains:
  - where to define spaces (world meta),
  - how hotspots reference them (display targets + existing display modes),
  - that “room” is just a `kind: "3d-room"` value, not a hard domain type.

---

## Phase 59.3 – Editor & Dev Tool Stubs

**Goal:** Provide minimal UI/dev affordances to inspect and experiment with display spaces and targets, without committing to a full 3D editor.

### Plan

- In the world / hotspot editor UI:
  - Add **read‑only** or basic form controls to:
    - List `GameWorld.meta.display.spaces` (id, label, kind).
    - For each hotspot, show its `displayTarget` (space + surface) next to existing `display.mode` controls.
  - Initial implementation can use:
    - simple JSON editors, or
    - small dropdowns populated from `spaces` if available.

- Add a small **Dev Tools panel** (or extend an existing one) to:
  - Show the currently active `DisplayTarget` when a hotspot/interaction is selected.
  - Resolve the referenced space/surface using the shared types from Phase 59.1.
  - This is for inspection only; no runtime 3D work is required in this task.

### Verification

- From the editor/dev tools, a developer can:
  - See which display spaces exist for a world.
  - See which space/surface a hotspot points at.
  - Confirm that changing JSON in `meta` is reflected in the UI.

---

## Phase 59.4 – Docs & Examples

**Goal:** Make the “display spaces + targets” model discoverable and clearly separate it from scenes and 3D implementation details.

### Plan

- Update `docs/GAME_WORLD_DISPLAY_MODES.md`:
  - Add a **“Display Spaces”** section explaining:
    - `spaces` topology in `GameWorld.meta.display`.
    - `DisplaySpaceDefinition` / `DisplayTarget` concepts.
    - Examples for:
      - `kind: "3d-room"` (classic room with screens),
      - `kind: "3d-outdoor"` (e.g. courtyard with billboards),
      - `kind: "2d-layer"` (overlay spaces used by HUD/panels).
  - Explicitly state that:
    - Scenes are 2D graph content only.
    - 3D context and layout are **world responsibilities** via display spaces + targets.

- Update `docs/SYSTEM_OVERVIEW.md`:
  - Briefly mention display spaces in the sections describing:
    - Game World & locations,
    - 3D display modes / hotspots,
    - Scene Editor & Graph (clarifying that scenes do not know about spaces).

- Optional: add a small example showing how a single scene/video can be:
  - Shown fullscreen via one hotspot,
  - Projected onto a lounge TV (`spaceId: "lounge", surfaceId: "main-screen"`),
  - Rendered as a small panel overlay in another context — all without changing the scene itself.

### Verification

- A new contributor reading the docs can answer:
  - “Where do I define 3D rooms/outdoor spaces?” → `GameWorld.meta.display.spaces`.
  - “How does a hotspot know **where** to show a scene/video?” → `meta.display` + `meta.displayTarget`.
  - “Why don’t scenes have `roomId`?” → because scenes are reusable 2D graphs; 3D context lives in display spaces.

---

## Success Criteria

- 3D “rooms” are modeled as **one kind of display space**, not a hardwired concept in scenes or core DB models.
- Hotspots reference spaces/surfaces via **display targets**, keeping scenes world‑agnostic.
- `GAME_WORLD_DISPLAY_MODES.md` and `SYSTEM_OVERVIEW.md` clearly describe this topology so future 3D/AR/VR work doesn’t require breaking changes.

