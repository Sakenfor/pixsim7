# Game World – 2D Video Display Modes in 3D Contexts

This document defines how 2D narrative content (videos / `ScenePlayer` scenes) is presented within the 3D world, without baking “room” or any specific visual metaphor into the core domain.

The goal is to keep:
- **Assets** generic (`3d_model`, `video`, etc.),
- **Scenes** reusable (graph of nodes/edges referencing assets),
- **World** as the long‑lived context (locations, hotspots, NPCs),
and express “how to show a scene here” as configuration, not new hard‑coded types.

---

## 1. Concepts

- **Scene** (`GameScene` + `@pixsim7/types.Scene`):
  - Narrative unit: graph of nodes/edges referencing media assets.
  - Reusable across locations/world contexts.

- **World / Location** (`GameLocation`, `GameHotspot`, future `GameObject`):
  - Long‑lived context hosted on the server.
  - Decides **where** and **how** to trigger a scene or play a media asset.

- **Display Mode** (new concept, expressed in `GameHotspot.meta` or similar):
  - Describes **how** a given scene/video is presented when triggered from a hotspot:
    - fullscreen overlay,
    - on a surface in 3D,
    - in a fixed 2D panel over the 3D view,
    - etc.

---

## 2. Display Mode Schema (Hotspot Metadata)

Display settings live in `GameHotspot.meta.display`, keeping the core `GameHotspot` schema generic.

### 2.1 Base shape

```jsonc
{
  "display": {
    "mode": "fullscreen" | "surface" | "panel",
    "autoPlay": true | false,
    "pauseWorld": true | false,
    "closeOnEnd": true | false
  }
}
```

- `mode` – how to present the content:
  - `"fullscreen"` – 2D overlay (`ScenePlayer` takes over the screen).
  - `"surface"` – project video onto a 3D surface (mesh) in the world.
  - `"panel"` – 2D panel anchored in screen space while world remains visible.
- `autoPlay` – start playing immediately when triggered.
- `pauseWorld` – pause camera movement / world simulation while content is playing.
- `closeOnEnd` – close the display when the scene/video finishes.

### 2.2 Fullscreen mode

```jsonc
{
  "display": {
    "mode": "fullscreen",
    "autoPlay": true,
    "pauseWorld": true,
    "closeOnEnd": true,
    "overlayStyle": {
      "background": "fade-black",   // or "blur-world", etc.
      "showSkip": true
    }
  }
}
```

- Client behavior (3D + UI):
  - Fade/blur 3D view.
  - Render `ScenePlayer` full‑screen.
  - Optionally show skip/exit controls based on `overlayStyle` and scene rules.

### 2.3 Surface mode (video on a 3D mesh)

```jsonc
{
  "display": {
    "mode": "surface",
    "autoPlay": true,
    "pauseWorld": false,
    "closeOnEnd": false,
    "surface": {
      "nodeName": "tv_screen_01",      // glTF node/mesh name
      "fit": "cover" | "contain",      // how to map video onto surface
      "emissive": true,                // optionally boost emissive for screen look
      "loop": true                     // loop video instead of ending scene
    }
  }
}
```

- Client behavior:
  - Find mesh by `nodeName` in the loaded 3D asset(s).
  - Attach a video texture using the current scene/video source.
  - Control playback based on `autoPlay`/`loop`.
  - Optionally keep this as a pure video (no ScenePlayer graph), or treat it as a single‑node scene.

### 2.4 Panel mode (HUD‑like window)

```jsonc
{
  "display": {
    "mode": "panel",
    "autoPlay": true,
    "pauseWorld": false,
    "closeOnEnd": true,
    "panel": {
      "anchor": "bottom-right" | "top-right" | "center",
      "size": { "width": 320, "height": 180 },  // pixels or relative
      "draggable": true
    }
  }
}
```

- Client behavior:
  - Render a `<Panel>` from `@pixsim7/ui` over the 3D canvas.
  - Inside it, either:
    - render a simple `<video>` loop, or
    - embed a slimmed‑down `ScenePlayer` instance.

---

## 3. Triggering Scenes vs Raw Videos

Each `GameHotspot` can point to either:

- A **full Scene** (graph) via `linked_scene_id` (current design), or
- A **single video Asset** via `meta.asset_id` (ambient or simple loops).

Suggested convention in `GameHotspot`:

```jsonc
{
  "hotspot_id": "couch-kiss",
  "linked_scene_id": 42,
  "meta": {
    "asset_id": 123,               // optional: direct video asset
    "display": { ... }             // display spec from above
  }
}
```

Client logic:

- If `linked_scene_id` is present → load scene via `/api/v1/game/scenes/:id` and drive `ScenePlayer`.
- Else if `meta.asset_id` is present → load video asset and play it according to `display`.

This keeps “what” (scene vs raw clip) and “how” (display mode) separate.

---

## 4. Editor Integration

In the **Game World editor** (main frontend):

- For each hotspot row, extend the form to include:
  - `display.mode` (dropdown: fullscreen / surface / panel),
  - For `"surface"`:
    - `surface.nodeName` (type‑ahead from known glTF node names, eventually),
    - `loop`, `emissive` toggles.
  - For `"panel"`:
    - anchor + size.
  - Optional `asset_id` if you want to point directly to a video asset instead of a full scene.

Initially, these can be stored as raw JSON in `meta.display` and edited with a simple JSON field; later you can break them into structured form inputs.

---

## 5. Scenes vs World – Modeling Choice

- Keep **Scenes** as reusable narrative units:
  - Server‑hosted, referenced by ID, independent of any particular 3D layout.

- Keep the **World** as the long‑lived context:
  - `GameLocation` / `GameHotspot` / (future) `GameObject` describe where scenes and assets appear.

- Avoid “scene packages” that bundle 3D + logic + media into opaque blobs:
  - Instead, compose them at runtime:
    - World → decides 3D assets + hotspots + display modes.
    - Scene → describes narrative flow and which media assets to use.

This structure means:
- 2D content (`ScenePlayer` scenes) can be reused in multiple locations and display modes.
- 3D content (assets) stays generic; world decides how to place and use it.
- Adding new display types (e.g., AR‑style overlays, VR) becomes a matter of defining new `display.mode` variants, not changing core domain models.

