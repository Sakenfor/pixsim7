# Game Systems

Documentation for game mechanics, world systems, NPCs, interactions, relationships, and scene/world editors.

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

## NPC & Zone Systems

- **[NPC_INTERACTIVE_ZONES_DESIGN.md](./NPC_INTERACTIVE_ZONES_DESIGN.md)** - Zone system design and metadata-driven approach
- **[NPC_ZONE_TRACKING_SYSTEM.md](./NPC_ZONE_TRACKING_SYSTEM.md)** - Advanced zone tracking across video segments
- **[NPC_RESPONSE_GRAPH_DESIGN.md](./NPC_RESPONSE_GRAPH_DESIGN.md)** - Node-based visual programming for NPC reactions
- **[NPC_RESPONSE_USAGE.md](./NPC_RESPONSE_USAGE.md)** - Practical guide for the response system
- **[NPC_RESPONSE_VIDEO_INTEGRATION.md](./NPC_RESPONSE_VIDEO_INTEGRATION.md)** - Video generation integration

## Interaction System

- **[INTERACTION_PLUGIN_MANIFEST.md](./INTERACTION_PLUGIN_MANIFEST.md)** - Plugin contract and interface specification
- **[INTERACTION_SYSTEM_MIGRATION.md](./INTERACTION_SYSTEM_MIGRATION.md)** - Migration to plugin-based architecture

## Relationships

- **[RELATIONSHIPS_AND_ARCS.md](./RELATIONSHIPS_AND_ARCS.md)** - Relationship system and story arc design

---

**Related:**
- [../narrative/](../narrative/) – Dialogue systems
- [../stats-and-systems/](../stats-and-systems/) – Stat mechanics
- [../architecture/block-primitives-evolution.md](../architecture/block-primitives-evolution.md) – Current block/primitives system
