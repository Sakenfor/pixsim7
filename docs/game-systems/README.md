# Game Systems

Documentation for game mechanics, world systems, and scene/world editors.

## Overview & Architecture

- **[SYSTEM_OVERVIEW.md](./SYSTEM_OVERVIEW.md)** - High-level game systems overview
  - Worlds, sessions, and scenes
  - NPC systems
  - Core mechanics

- **[ENGINE_LAYERING_FOUNDATION.md](./ENGINE_LAYERING_FOUNDATION.md)** - Engine layering and determinism
  - Engine architecture
  - RNG and deterministic systems

## Scene & Graph Systems

- **[GRAPH_SYSTEM.md](./GRAPH_SYSTEM.md)** - Multi-layer graph architecture
  - Scene graphs
  - Arc graphs
  - Character graphs

- **[GRAPH_UI_LIFE_SIM_PHASES.md](./GRAPH_UI_LIFE_SIM_PHASES.md)** - Graph editor integration with world/life-sim
  - Graph editor phases
  - Integration with simulation

- **[GRAPH_RENDERER_PLUGINS.md](./GRAPH_RENDERER_PLUGINS.md)** - Graph node rendering plugin system
  - Rendering plugins
  - Node visualization

## World & Interaction Design

- **[EDITOR_2D_WORLD_LAYOUT_SPEC.md](./EDITOR_2D_WORLD_LAYOUT_SPEC.md)** - 2D world layout and NPC interaction editor design
  - World layout editor
  - NPC positioning

- **[NODE_EDITOR_DEVELOPMENT.md](./NODE_EDITOR_DEVELOPMENT.md)** - Node-based scene editor architecture
  - Scene editor
  - Node-based workflow

- **[HOTSPOT_ACTIONS_2D.md](./HOTSPOT_ACTIONS_2D.md)** - 2D hotspot actions and NPC portrait schema
  - Hotspot interactions
  - NPC portrait system

- **[GAME_WORLD_DISPLAY_MODES.md](./GAME_WORLD_DISPLAY_MODES.md)** - 2D/3D display modes for scenes
  - Fullscreen, surface, and panel presentation
  - Display spaces and targets

## Game Mechanics

- **[GAMEPLAY_SYSTEMS.md](./GAMEPLAY_SYSTEMS.md)** - Relationship, quest, and game systems reference
  - Relationship system
  - Quest systems
  - Core mechanics

---

**Related:**
- [../narrative/](../narrative/) – Dialogue systems
- [../actions/](../actions/) – Action blocks *(deprecated — replaced by block primitives; see [../architecture/block-primitives-evolution.md](../architecture/block-primitives-evolution.md))*
- [../architecture/block-primitives-evolution.md](../architecture/block-primitives-evolution.md) – Current block/primitives system
