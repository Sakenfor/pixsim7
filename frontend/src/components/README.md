# Frontend Components

This directory contains React components for the PixSim7 frontend UI.

## Game / Scene Editor Components

### GraphPanel + SceneBuilderPanel

**Node-based scene editor** for authoring branching narrative graphs:

- **`GraphPanel.tsx`** – Visual graph canvas using React Flow
  - Drag-and-drop nodes with connection mode
  - Port-aware edges (default, success, failure)
  - Set start node, rename, delete, duplicate

- **`SceneBuilderPanel.tsx`** – Property inspector and configuration form
  - Node-specific fields (selection strategy, progression steps, mini-game config)
  - Cast/role management for NPC binding
  - Edge conditions and effects editor

- **`nodes/SceneNode.tsx`** – Node component with multiple handles
  - Visual indicators for node type and metadata
  - Connection handles for different edge types

**See:**
- `docs/NODE_EDITOR_DEVELOPMENT.md` – Complete editor architecture and development roadmap
- `docs/GRAPH_UI_LIFE_SIM_PHASES.md` – World/life-sim integration phases and character binding model
- `docs/SYSTEM_OVERVIEW.md` – High-level map of all game systems

---

### WorldContextSelector

**World and location context bar** for scene editing:

- Dropdown selectors for `GameWorld` and `GameLocation`
- Provides world-aware context for scene authoring
- Used by scene editor and 2D preview

**See:**
- `docs/GRAPH_UI_LIFE_SIM_PHASES.md` – Phase 1 (World-Aware Scene Editing Context)
- `docs/SYSTEM_OVERVIEW.md` – Worlds, locations, and sessions overview

---

## Other Components

For non-game components (layout, gallery, dock, etc.), refer to inline comments and type definitions.
