## Task 98: Comic Panel Widget & Scene Integration

**Status:** Planned

### Intent

Introduce a simple “comic panel” presentation layer for existing scenes and story beats, without creating a separate comic authoring system.

The goal is **not** full comics with speech bubbles, but:

- A list/sequence of images (frames) that visually represent story beats.
- Panels that can be connected by existing “transition” mechanics (before gameplay, between scenes, or during pauses).
- Reuse of the current narrative (scenes/arcs) and editable UI (overlay/HUD) infrastructure.

---

### High-Level Design

“Comic” is treated as a **presentation mode** for scenes/arcs, not a new narrative structure:

- Scenes and arcs stay as-is (scene builder, arc-graph, campaigns).
- Comic panels are:
  - Stored as **metadata** on scenes / nodes / session flags.
  - Rendered via a new **`comic-panel` widget type** in the overlay/HUD systems.
  - Connected by existing “transition” logic (e.g., quick generate, scene transitions, HUD transitions).

This keeps all data within the current JSON/meta conventions (no schema changes).

---

### Scope

In scope:

- Data conventions for “comic frames” attached to scenes/nodes/session flags.
- A new `comic-panel` widget type in overlay (and optionally HUD) systems.
- Registry, unified config, and editor support for `comic-panel`.
- Minimal gameplay UI glue to show panels at the right times.

Out of scope:

- Full comic authoring UI (panel grids, balloons, text layout).
- Backend schema changes (stick to JSON fields in meta/flags).
- Complex scripting/branching specific only to comics (reuse existing scene/arc logic).

---

### 98.1: Scene/Session Conventions for Comic Frames

**Goal:** Define where comic frame lists live so they can be referenced both by widgets and by gameplay/transition logic.

**Proposal:**

- Scene-level metadata:

  ```ts
  // apps/main/src/modules/scene-builder/types (conceptual shape)
  interface SceneMetaComicPanel {
    id: string;              // logical panel id within this scene
    assetId: string;         // gallery asset id or provider asset id
    caption?: string;        // optional text under image
    tags?: string[];         // optional tags (mood, location, etc.)
  }

  interface SceneMeta {
    // ...existing fields...
    comicPanels?: SceneMetaComicPanel[];
  }
  ```

- Optional session/flag-level state:

  ```json
  {
    "flags": {
      "comic": {
        "current_panel": "p1",
        "chapter": "issue_01"
      }
    }
  }
  ```

This allows:

- Static panels pre-authored per scene.
- Runtime selection via `GameSession.flags.comic.current_panel` when transitions or choices alter the visible frame.

**Tasks:**

- Document the convention in `docs/GAMEPLAY_SYSTEMS.md` or a dedicated `COMIC_PANELS.md`.
- (Optional) Add light TypeScript types for `SceneMetaComicPanel` in the appropriate module (`scene-builder` types file) without impacting backend schemas.

---

### 98.2: `comic-panel` Overlay/HUD Widget

**Goal:** Implement a reusable widget type that displays one or more comic frames based on bindings, using the existing overlay/HUD systems.

**Overlay side:**

- New widget implementation, e.g. `apps/main/src/lib/overlay/widgets/ComicPanelWidget.tsx`:

  ```ts
  export interface ComicPanelWidgetConfig {
    id: string;
    position: WidgetPosition;
    visibility: VisibilityConfig;
    // Data inputs (typically via bindings or simple props)
    panelIds?: string[];           // ids within Scene.meta.comicPanels
    assetIds?: string[];           // direct gallery asset ids (fallback)
    layout?: 'single' | 'strip' | 'grid2';
    showCaption?: boolean;
    className?: string;
    priority?: number;
  }
  ```

- The widget should:
  - Render one or more images in a simple layout (no speech bubbles).
  - Optionally show `caption` text under each frame.
  - Be purely presentational; it does not change game state itself.

**Registry integration:**

- Register `comic-panel` in `apps/main/src/lib/overlay/overlayWidgetRegistry.ts`:
  - Add a factory mapping `UnifiedWidgetConfig` → `ComicPanelWidgetConfig` → `OverlayWidget`.
  - Provide `defaultConfig` with:
    - Reasonable position (e.g. bottom-center).
    - `layout: 'single'` and `showCaption: true`.
- Update `overlayConfig.toUnifiedWidget` / `fromUnifiedWidget` to:
  - Extract props like `layout`, `showCaption`, and static `panelIds`/`assetIds` into `props`.
  - Optionally map bindings for `panelIds` or `assetIds` using `UnifiedDataBinding`.

**HUD side (optional but recommended):**

- Reuse the same `comic-panel` widget in HUD via unified config:
  - HUD surfaces that want a persistent “comic strip” region can add `comic-panel` widgets with region-based positions.

---

### 98.3: Editor Integration (Overlay & HUD)

**Goal:** Make `comic-panel` usable from existing editors without new custom UIs.

**Overlay editor:**

- Add `comic-panel` to the available widget types list in:
  - `apps/main/src/components/overlay-editor/WidgetList.tsx`
  - Use registry defaults via `getWidget`/`createWidget` (already wired by Task 94/95).
- Extend `TypeSpecificProperties` to handle:
  - `layout` enum selector.
  - `showCaption` toggle.
  - Simple fields for static `assetIds`/`panelIds` for quick testing.
  - (Bindings for dynamic selection will still go through the binding system; we can start with static props.)

**HUD editor:**

- Once HUD is integrated with unified configs (Task 97), ensure:
  - `comic-panel` shows up in HUD’s widget palette where appropriate.
  - Basic type-specific properties are editable similarly to overlay editor (layout, showCaption).

---

### 98.4: Gameplay Glue (Transitions & Story)

**Goal:** Allow existing “transition” mechanics to connect comic frames (either pre-gameplay or during play), without new scripting layers.

**Plan:**

- Decide initial trigger points:
  - E.g., “before entering scene X, show comic panel sequence Y”.
  - “When `GameSession.flags.comic.current_panel` changes, HUD/overlay updates automatically via data binding”.
- Implement a small helper in gameplay UI core (not new backend API):

  ```ts
  // apps/main/src/lib/gameplay-ui-core/comicPanels.ts (example)
  export function getActiveComicPanels(session: GameSession, sceneMeta: SceneMeta): SceneMetaComicPanel[] {
    const currentId = session.flags?.comic?.current_panel;
    if (currentId && sceneMeta.comicPanels) {
      return sceneMeta.comicPanels.filter(p => p.id === currentId);
    }
    // Fallback: all panels for the scene or first N
    return sceneMeta.comicPanels ?? [];
  }
  ```

- Wire this helper into whichever surface will first show the panels:
  - A dedicated comic overlay in Game2D.
  - A HUD region in the new HUD system.
- Leave “transition orchestration” (e.g. switching panels on timers or player input) to existing systems:
  - Quick generate / transition modules.
  - Scene/arc step transitions that bump `flags.comic.current_panel`.

---

### Acceptance Criteria

- **Data conventions:**
  - Scenes can declare `comicPanels` in meta without affecting existing behavior.
  - Optional `flags.comic` structure is documented for runtime state.
- **Widget:**
  - A `comic-panel` widget type exists in the overlay system and can be instantiated via registry/unified config.
  - It renders one or more images as simple panels with optional captions (no speech bubbles).
- **Editor:**
  - Overlay editor can add, position, and configure `comic-panel` widgets (basic props).
  - HUD editor can use `comic-panel` where applicable once unified configs are wired (Task 97).
- **Gameplay:**
  - At least one surface (overlay or HUD) can show comics for a scene based on `Scene.meta.comicPanels` and/or `flags.comic.current_panel`.

---

### Notes / Non-Goals

- No new backend tables or APIs; everything uses existing JSON fields and gallery assets.
- No full comic authoring UI (panel grids, bubble placement); images are treated as “frames” selected from the existing asset system.
- This task focuses on making comics *a way to present scenes*, reusing the existing narrative + editable UI architecture.

