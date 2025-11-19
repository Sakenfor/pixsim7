# App Map & Architecture Index

**Last Updated:** 2025-11-19

---

# For AI Agents: START HERE

**This is the canonical entry point for understanding PixSim7's architecture.**

## Workflow for Agents

1. **Read APP_MAP.md first** (this file) - Get the big picture and locate subsystems
2. **Follow links to system docs** - Read authoritative specifications for each system
3. **Check code locations** - Examine implementation details
4. **Then consult task files** - Use for roadmap/status context only

## What Each Document Type Means

- **APP_MAP.md** = The index/directory - tells you where to find everything
- **System docs** (`SYSTEM_OVERVIEW.md`, `SOCIAL_METRICS.md`, etc.) = The authoritative specifications - how systems work
- **Code** = The reality - what actually runs
- **Task files** (`claude-tasks/*.md`) = Roadmap and status tracking - NOT primary specifications

## Task Files Are NOT Specs

Task files in `claude-tasks/` are:
- Roadmaps showing planned work and progress
- Status trackers with phase checklists
- Implementation notes documenting what was done
- Context for understanding development history

Task files are NOT:
- The primary specification for how systems work
- Authoritative documentation for current implementation
- The place to look up API contracts or data models
- Guaranteed to be up-to-date with latest code

**Always read system docs before task files.** Task files complement the docs, they don't replace them.

---

## Overview

PixSim7 is a plugin-based game/simulation platform with the following major subsystems:
---

### 2. Plugin System

**Purpose:** Extensible plugin architecture for adding custom behaviors, tools, and UI elements without modifying core code.

**Code Locations:**
- `frontend/src/lib/pluginLoader.ts` - Plugin loading and initialization
- `frontend/src/lib/plugins/` - Plugin infrastructure and catalog
- `frontend/src/lib/plugins/catalog.ts` - Plugin discovery and metadata API
- `frontend/src/lib/registries.ts` - Plugin registry implementations
- `frontend/src/lib/gallery/` - Gallery tool plugins
- `frontend/src/lib/worldTools/` - World tool plugins
- `frontend/src/lib/providers/` - Generation UI provider plugins
- `plugins/` - User-installed plugins directory

**Plugin Kinds:**

| Kind | Registry | Typical Location | Purpose |
|------|----------|------------------|---------|
| `session-helper` | `sessionHelperRegistry` | `packages/game-core/src/session/` | Game session state helpers and utilities |
| `interaction` | `interactionRegistry` | `frontend/src/lib/plugins/interactions/` | NPC interactions (dialogue, combat, trade, etc.) |
| `node-type` | `nodeTypeRegistry` | `frontend/src/components/graph/nodes/` | Custom scene graph node types |
| `gallery-tool` | `galleryToolRegistry` | `frontend/src/lib/gallery/tools/` | Asset gallery toolbar actions |
| `world-tool` | `worldToolRegistry` | `frontend/src/lib/worldTools/` | World/HUD panels (inventory, relationships, quest log) |
| `ui-plugin` | `pluginManager` | `plugins/` | User-installed UI extensions |
| `generation-ui` | `generationUIPluginRegistry` | `frontend/src/lib/providers/` | Generation workflow UI providers |

**Plugin Catalog API:**
- `listAllPlugins()` - Get all registered plugins with metadata
- `filterByKind(kind)` - Filter plugins by kind
- `filterByOrigin(origin)` - Filter by origin (builtin, plugins-dir, ui-bundle, dev)
- `searchPlugins(query)` - Full-text search across plugin metadata
- `getPluginDependencyGraph()` - Analyze plugin feature dependencies
- `getPluginHealth()` - Plugin health and metadata completeness analysis

**Documentation:**
- [PLUGIN_SYSTEM.md](./PLUGIN_SYSTEM.md) - Plugin architecture and development guide
- [PLUGIN_REFERENCE.md](./PLUGIN_REFERENCE.md) - Plugin API reference
- [INTERACTION_PLUGIN_MANIFEST.md](./INTERACTION_PLUGIN_MANIFEST.md) - Interaction plugin spec
- [GALLERY_TOOLS_PLUGIN.md](./GALLERY_TOOLS_PLUGIN.md) - Gallery tool plugin development
- [PROVIDER_CAPABILITY_REGISTRY.md](./PROVIDER_CAPABILITY_REGISTRY.md) - Provider plugin patterns
- [CAPABILITY_PLUGIN_INTEGRATION.md](./CAPABILITY_PLUGIN_INTEGRATION.md) - Integrating plugins with capabilities

**Plugin Origins:**
- `builtin` - Core plugins bundled with the app
- `plugins-dir` - User-installed plugins from `plugins/` directory
- `ui-bundle` - Plugins bundled in UI compilation
- `dev` - Development/experimental plugins

---

### 3. Graph / Scene Editor

**Purpose:** Visual graph editor for creating scenes, quests, and interactive narrative flows using nodes and connections.

**Code Locations:**
- `frontend/src/components/GraphPanel.tsx` - Main graph canvas and rendering
- `frontend/src/components/inspector/InspectorPanel.tsx` - Node property inspector
- `frontend/src/modules/scene-builder/` - Scene builder module
- `frontend/src/components/graph/nodes/` - Node type implementations
- `packages/types/` - Scene, Node, and graph-related types

**Node Types:**
- Dialogue nodes (branching conversations)
- Action nodes (trigger game events)
- Condition nodes (branching logic)
- Location nodes (world areas)
- Quest nodes (quest objectives and stages)
- Custom nodes (via `node-type` plugins)

**Documentation:**
- [NODE_EDITOR_DEVELOPMENT.md](./NODE_EDITOR_DEVELOPMENT.md) - Node editor architecture
- [GRAPH_UI_LIFE_SIM_PHASES.md](./GRAPH_UI_LIFE_SIM_PHASES.md) - Graph UI implementation phases
- [DYNAMIC_NODE_INSPECTOR.md](./DYNAMIC_NODE_INSPECTOR.md) - Dynamic inspector system

**Key Features:**
- Drag-and-drop node creation
- Connection-based flow control
- Property inspector with type-specific editors
- Template support for common patterns
- Export/import scene graphs

---

### 4. Game & Simulation

**Purpose:** Runtime game environments for testing and playing interactive content.

**Code Locations:**
- `frontend/src/routes/Game2D.tsx` - 2D world exploration game
- `frontend/src/routes/NpcBrainLab.tsx` - NPC behavior testing environment
- `frontend/src/lib/worldTools/` - World tool panels (HUD components)
- `packages/game-core/` - Core game logic and session management
- Future: `frontend/src/routes/SimulationPlayground.tsx` - System testing playground

**Game Components:**
- **Game2D**: Play scenes with character movement, NPC interactions, hotspot actions
- **NpcBrainLab**: Test NPC AI, relationships, and interaction outcomes
- **World Tools**: HUD panels for inventory, relationships, quest log, world info
- **Hotspot System**: Interactive areas in 2D scenes

**Documentation:**
- [HOTSPOT_ACTIONS_2D.md](./HOTSPOT_ACTIONS_2D.md) - Hotspot and interaction system
- [RELATIONSHIPS_AND_ARCS.md](./RELATIONSHIPS_AND_ARCS.md) - Relationship mechanics
- [SOCIAL_METRICS.md](./SOCIAL_METRICS.md) - Social metrics system (tiers, mood, reputation)
- [ACTION_ENGINE_USAGE.md](./ACTION_ENGINE_USAGE.md) - Action execution system
- [ACTION_BLOCKS_UNIFIED_SYSTEM.md](./ACTION_BLOCKS_UNIFIED_SYSTEM.md) - Action blocks architecture

---

### 5. Social Metrics System

**Purpose:** Unified framework for computing, previewing, and displaying derived social values (relationship tiers, NPC moods, reputation bands).

**Code Locations:**
- `pixsim7_backend/domain/metrics/` - Backend evaluators and types
- `pixsim7_backend/api/v1/game_*_preview.py` - Preview API endpoints
- `packages/types/src/game.ts` - Shared TypeScript types
- `packages/game-core/src/metrics/` - API client and helpers
- `packages/game-core/src/npcs/brain.ts` - Client-side mood computation

**Supported Metrics:**

| Metric | Input | Output | Schema Location |
|--------|-------|--------|-----------------|
| **Relationship Tier** | Affinity (0-100) | Tier ID (stranger, friend, lover) | `GameWorld.meta.relationship_schemas` |
| **Intimacy Level** | Affinity, trust, chemistry, tension | Intimacy ID (light_flirt, intimate) or null | `GameWorld.meta.intimacy_schema` |
| **NPC Mood** | Relationship values | Mood ID, valence, arousal, optional emotion | `GameWorld.meta.npc_mood_schema` |
| **Reputation Band** | Subject/target, reputation score | Band ID (enemy, neutral, ally) | `GameWorld.meta.reputation_schemas` |

**API Endpoints:**
- `POST /api/v1/game/relationships/preview-tier` - Preview relationship tier
- `POST /api/v1/game/relationships/preview-intimacy` - Preview intimacy level
- `POST /api/v1/game/npc/preview-mood` - Preview NPC mood state
- `POST /api/v1/game/reputation/preview-reputation` - Preview reputation band

**Game-Core Helpers:**
- `previewRelationshipTier(args)` - Call tier preview API
- `previewIntimacyLevel(args)` - Call intimacy preview API
- `previewNpcMood(args)` - Call mood preview API
- `previewReputationBand(args)` - Call reputation preview API
- `buildNpcBrainState(params)` - Client-side mood computation (no API call)

**Key Features:**
- **Schema-Driven**: Worlds customize thresholds and bands via `GameWorld.meta`
- **Stateless Previews**: API endpoints for "what-if" scenarios without mutating state
- **Type-Safe**: Full TypeScript types from backend to frontend
- **Dual Computation**: Preview API for planning, client-side for live display
- **Extensible**: Easy to add new metric types (skill levels, social standing, etc.)

**Usage Patterns:**
- **Use Preview API**: Editor tools, scenario planning, schema testing, "what-if" calculations
- **Use Client-Side**: Runtime display, real-time updates, performance-critical UI, offline mode

**Documentation:**
- [SOCIAL_METRICS.md](./SOCIAL_METRICS.md) - Complete social metrics reference
- [RELATIONSHIPS_AND_ARCS.md](./RELATIONSHIPS_AND_ARCS.md) - Relationship mechanics and session data
- [NPC_PERSONA_ARCHITECTURE.md](./NPC_PERSONA_ARCHITECTURE.md) - NPC brain state and personality

**Related Systems:**
- Relationship system (session data source)
- NPC brain system (mood computation)
- Emotional state system (discrete emotions)
- Action block system (separate mood tags for actions)

---

### 6. Generation System

**Purpose:** AI-powered content generation with pluggable UI providers, prompt engineering, and concept discovery.

**Code Locations:**
- `frontend/src/routes/Generate.tsx` - Generation UI orchestrator
- `frontend/src/lib/providers/` - Generation UI provider plugins
- `frontend/src/modules/generation/` - Generation module and capabilities
- Backend generation endpoints and prompt systems

**Generation Types:**
- Character portraits (via portrait provider)
- Scenes and locations
- NPC personalities and backstories
- Quest narratives
- Dialogue and interactions

**Documentation:**
- [ACTION_BLOCKS_CONCEPT_DISCOVERY.md](./ACTION_BLOCKS_CONCEPT_DISCOVERY.md) - Concept discovery workflow
- [ACTION_PROMPT_ENGINE_SPEC.md](./ACTION_PROMPT_ENGINE_SPEC.md) - Prompt engineering system
- [DYNAMIC_GENERATION_FOUNDATION.md](./DYNAMIC_GENERATION_FOUNDATION.md) - Generation architecture

---

## Live Maps & Dev Panels

These interactive tools provide real-time visibility into the app's structure and runtime state:

### Capability Browser
- **Purpose:** Browse and search all registered features, routes, actions, and state
- **Location:** `frontend/src/components/capabilities/CapabilityBrowser.tsx`
- **Usage:** Import and render in dev routes or config panels

### App Map Panel
- **Purpose:** Visualize app architecture, plugin ecosystem, and feature dependencies
- **Route:** `/app-map` (dev route)
- **Location:** `frontend/src/components/dev/AppMapPanel.tsx`
- **Features:**
  - **Features & Routes Tab:** Browse all features with their routes and actions
  - **Plugin Ecosystem Tab:** Search and filter plugins by kind, origin, and tags
  - **Dependency Graph Tab:** Interactive visualization of feature-plugin relationships
  - **Capability Testing Tab:** Test routes, invoke actions, and inspect state
  - **Statistics Tab:** System overview with health metrics and usage stats
  - **Export Functionality:** Download complete app map as JSON for analysis

### Plugin Health Monitor
- **API:** `getPluginHealth()` from `catalog.ts`
- **Usage:** Call `printPluginHealth()` in console for quick analysis

---

## Roadmap / Next Steps

The following designer-focused features are planned (see `claude-tasks/` for detailed specs):

1. **World HUD Layout Designer** ([01-world-hud-layout-designer.md](../claude-tasks/01-world-hud-layout-designer.md))
   - Per-world HUD layout configuration
   - Drag-and-drop tool placement
   - Visibility conditions

2. **Interaction Presets & Palettes** ([02-interaction-presets-and-palettes.md](../claude-tasks/02-interaction-presets-and-palettes.md))
   - Reusable interaction presets
   - Designer-friendly palette UI
   - Per-world preset libraries

3. **Scene & Quest Graph Templates** ([03-scene-and-quest-graph-templates.md](../claude-tasks/03-scene-and-quest-graph-templates.md))
   - Template library for common scene patterns
   - Quick-start quest templates
   - Template customization and sharing

4. **Per-World UI Themes & View Modes** ([04-per-world-ui-themes-and-view-modes.md](../claude-tasks/04-per-world-ui-themes-and-view-modes.md))
   - Custom themes per world
   - View mode configurations
   - Designer-friendly theme editor

5. **Simulation Playground** ([05-simulation-playground-for-npc-brain-and-world.md](../claude-tasks/05-simulation-playground-for-npc-brain-and-world.md))
   - NPC AI testing environment
   - World state simulation
   - Automated testing scenarios

---

## Additional Documentation

### Backend Architecture
- [ADMIN_PANEL.md](./ADMIN_PANEL.md) - Admin panel and management
- [BACKEND_INTERACTION_DISPATCHER.md](./BACKEND_INTERACTION_DISPATCHER.md) - Interaction routing

### Advanced Systems
- [CUBE_SYSTEM_DYNAMIC_REGISTRATION.md](./CUBE_SYSTEM_DYNAMIC_REGISTRATION.md) - Dynamic system registration
- [CONTROL_CENTER_PLUGIN_MIGRATION.md](./CONTROL_CENTER_PLUGIN_MIGRATION.md) - Plugin migration guide
- [ENGINE_LAYERING_FOUNDATION.md](./ENGINE_LAYERING_FOUNDATION.md) - Engine architecture layers

### Development
- [ARCHITECTURE_AUDIT_CLAUDE_TASKS.md](./ARCHITECTURE_AUDIT_CLAUDE_TASKS.md) - Architecture review tasks
- [FRONTEND_CLAUDE_TASKS.md](./FRONTEND_CLAUDE_TASKS.md) - Frontend development tasks
- [CLAUDE_UI_TASKS.md](./CLAUDE_UI_TASKS.md) - UI improvement tasks

---

## Quick Reference

### Starting Points for Common Tasks

**Adding a new feature:**
1. Create a module in `frontend/src/modules/your-feature/`
2. Register feature using `registerCompleteFeature()`
3. Add routes, actions, and state as needed
4. Register module in `frontend/src/modules/index.ts`

**Creating a plugin:**
1. Choose plugin kind (see Plugin Kinds table above)
2. Follow plugin spec for that kind (see Plugin System docs)
3. Place in appropriate registry location
4. Test with plugin catalog tools

**Adding a route:**
1. Register route via capability system
2. Add route component in `frontend/src/routes/`
3. Wire into `App.tsx` `<Routes>`

**Exploring the system:**
1. Visit `/app-map` for live architecture view
2. Use `printPluginHealth()` in console
3. Browse capability registry with dev tools
4. Check plugin catalog with `listAllPlugins()`

---

## Contributing

When adding new features or plugins:
- Register capabilities properly via `registerCompleteFeature()`
- Provide complete plugin metadata (description, category, tags)
- Document feature dependencies using `providesFeatures` / `consumesFeatures`
- Update this index if adding major subsystems
- Add links to new detailed docs as needed

---

**For Questions:**
- See detailed docs linked above
- Check dev panel tools (`/app-map`, capability browser)
- Review existing module/plugin implementations as examples
