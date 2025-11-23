# Game World – 2D Video Display Modes in 3D Contexts

## Scope

**This doc is for:** Developers working on 3D environments, video display modes (fullscreen, surface, panel), and how 2D narrative content is presented within 3D contexts.

**See also:**
- `SYSTEM_OVERVIEW.md` – High-level map of game systems
- `HOTSPOT_ACTIONS_2D.md` – Hotspot actions that trigger scenes
- `NODE_EDITOR_DEVELOPMENT.md` – Scene graph editor for authoring reusable scenes

---

## Overview

This document defines how 2D narrative content (videos / `ScenePlayer` scenes) is presented within the 3D world, **without baking “room” or any specific visual metaphor into the core domain**.

The goal is to keep:
- **Assets** generic (`3d_model`, `video`, etc.),
- **Scenes** reusable (graph of nodes/edges referencing assets),
- **World** as the long‑lived context (locations, hotspots, NPCs),
and express “how to show a scene here” as configuration, not new hard‑coded types.

3D “rooms” (and similar metaphors) are modeled as **display spaces** owned by the world, not as new scene types.

---

## 1. Concepts

- **Scene** (`GameScene` + `@pixsim7/types.Scene`):
  - Narrative unit: graph of nodes/edges referencing media assets.
  - Reusable across locations/world contexts.
  - **Does not know about 3D rooms / spaces** – it is display‑agnostic.

- **World / Location** (`GameLocation`, `GameHotspot`, future `GameObject`):
  - Long‑lived context hosted on the server.
  - Decides **where** and **how** to trigger a scene or play a media asset.
  - Owns the topology of **display spaces** that can host content.

- **Display Mode** (expressed in `GameHotspot.meta.display`):
  - Describes **how** a given scene/video is presented when triggered from a hotspot:
    - fullscreen overlay,
    - on a surface in 3D,
    - in a fixed 2D panel over the 3D view,
    - etc.

- **Display Space** (expressed in `GameWorld.meta.display.spaces`):
  - World‑level definition of places where content can appear (e.g. 3D rooms, outdoor areas, 2D layers).
  - Each space has a `kind` (e.g. `"3d-room"`, `"3d-outdoor"`, `"2d-layer"`, `"ar-surface"`) and optional **surfaces** (e.g. screens, billboards).

- **Display Target** (expressed in `GameHotspot.meta.displayTarget`):
  - A reference from a hotspot (or other trigger) into the world’s display spaces: which `spaceId`, which `surfaceId`, and optional logical `layerId`.
  - Lets us say “play this scene on the lounge TV” without baking “lounge” or “TV” into the scene itself.

---

## 2. Display Mode Schema (Hotspot Metadata)

Display **mode** settings live in `GameHotspot.meta.display`, keeping the core `GameHotspot` schema generic.

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
  - Render `ScenePlayer` fullscreen.
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

## 2.5 Display Spaces (World Topology)

Display spaces live in `GameWorld.meta.display.spaces`, and describe the topology of places where content can appear. This is **world configuration only** – no DB/schema changes, just JSON conventions.

Example:

```jsonc
{
  "meta": {
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
}
```

Notes:

- `kind` is intentionally generic:
  - `"3d-room"` – traditional room with screens, couches, etc.
  - `"3d-outdoor"` – courtyards, plazas, rooftop spaces.
  - `"2d-layer"` – overlay layers used by HUD or 2D UI.
  - `"ar-surface"`, `"vr-space"`, and custom values are allowed in the future.
- `surfaces` describe specific projection targets within a space (e.g. screens, billboards) using IDs and optional renderer hints like `nodeName`.

This lets us talk about “rooms” **as one kind of display space**, without baking “room” into the core domain model.

---

## 2.6 Display Targets (Hotspot References)

Display targets live in `GameHotspot.meta.displayTarget` and point into the world’s display spaces.

They work **alongside** `meta.display`:

- `meta.display` says **how** to show the content (fullscreen / surface / panel).
- `meta.displayTarget` says **where** in the world topology (which space/surface/layer).

Example: video on a lounge TV screen

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

Example: fullscreen story overlay (no specific 3D surface)

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

Client behavior:

- When a hotspot is triggered:
  - Use `meta.display` to determine the presentation mode.
  - Use `meta.displayTarget.spaceId` / `surfaceId` to resolve the actual 3D space + surface (or 2D layer) from `GameWorld.meta.display.spaces`.
  - Scenes remain unchanged; they simply provide the content (video/graph) to play at that target.

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
    "display": { ... },            // display spec from above
    "displayTarget": { ... }       // optional: where to show it
  }
}
```

Client logic:

- If `linked_scene_id` is present → load scene via `/api/v1/game/scenes/:id` and drive `ScenePlayer`.
- Else if `meta.asset_id` is present → load video asset and play it according to `display`.

This keeps:
- **what** – scene vs raw clip,
- **how** – fullscreen / surface / panel,
- **where** – which space/surface,
cleanly separated.

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
  - Optional `displayTarget`:
    - `spaceId` (dropdown from `GameWorld.meta.display.spaces`),
    - `surfaceId` (dropdown from selected space’s `surfaces`, if any).

Initially, these can be stored as raw JSON in `meta.display` / `meta.displayTarget` and edited with a simple JSON field; later you can break them into structured form inputs.

On the **world** side:

- Provide a simple way to:
  - View and edit `GameWorld.meta.display.spaces` (ID, label, kind).
  - Add/remove surfaces within a space (ID, label, optional `nodeName`).
- This can start as a basic JSON editor or dev‑only panel before becoming a full UI.

---

## 5. Scenes vs World – Modeling Choice

- Keep **Scenes** as reusable narrative units:
  - Server‑hosted, referenced by ID, independent of any particular 3D layout or space.

- Keep the **World** as the long‑lived context:
  - `GameLocation` / `GameHotspot` / (future) `GameObject` describe where scenes and assets appear.
  - `GameWorld.meta.display.spaces` defines the available display spaces and surfaces.

- Avoid “scene packages” that bundle 3D + logic + media into opaque blobs:
  - Instead, compose them at runtime:
    - World + display spaces decide 3D assets, hotspots, and where content can appear.
    - Hotspots choose `display.mode` + `displayTarget`.
    - Scenes describe narrative flow and which media assets to use.

This structure means:

- 2D content (`ScenePlayer` scenes) can be reused in multiple locations, spaces, and display modes.
- 3D content (assets) stays generic; world decides how to place and use it.
- Adding new display types (e.g., AR‑style overlays, VR spaces, new room types) becomes a matter of:
  - defining new `kind` values for display spaces, and
  - defining new `display.mode` variants,
not changing core domain models or scene types.

