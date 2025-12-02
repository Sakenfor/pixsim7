# PixSim7 Task Tracking Overview

**Last Updated:** 2025-12-02
**Purpose:** Comprehensive status of all Claude tasks to enable quick coordination between agents and humans without redundant analysis.

---

## Executive Summary

This document provides a **single source of truth** for what's been completed and what remains across all PixSim7 Claude tasks. Use this to:
- **Quickly orient** new agents or developers to the project status
- **Avoid redundant analysis** by seeing what's already done
- **Identify blockers** and dependencies between tasks
- **Plan next steps** based on what's complete vs in-progress

---

## Quick Status Matrix

| Task | Name | Overall Status | Phases Complete | Notes |
|------|------|----------------|-----------------|-------|
| 01 | World HUD Layout Designer | ✅ Mostly Complete | 7/10 | Phases 1-7 done; 8-10 are future enhancements |
| 02 | Interaction Presets & Palettes | ✅ Complete | 10/10 | All phases implemented |
| 03 | Scene/Quest Graph Templates | ✅ Mostly Complete | 9/10 | Phase 10 (analytics) not started |
| 04 | Per-World UI Themes & View Modes | ✅ Complete | 10/10 | All phases implemented |
| 05 | Simulation Playground | ✅ Complete | 10/10 | All phases implemented |
| 06 | App Map & Dev Panel | ⏸️ Partial | 6/10 | Phases 1-6 done; 7-10 pending |
| 07 | Relationship Preview API & Metrics | ✅ Mostly Complete | 9.5/10 | Phase 6 partial (TS fallback deprecated) |
| 08 | Social Metrics & NPC Systems | ✅ Complete | 10/10 | All phases implemented |
| 09 | Intimacy & Scene Generation Prompts | ✅ Complete | 10/10 | Reference implementation complete |
| 10 | Unified Generation Pipeline | ⏸️ Partial | 6/10 | Phases 1-5, 8 done; 6-7, 9-10 pending |
| 11 | World-Aware Session Normalization | ✅ Complete | 10/10 | All phases implemented with migration |
| 12 | Intimacy Scene Composer | ✅ Complete | 7/7 | All phases implemented |
| 13 | NPC Behavior System | 📝 Design | 0/N | Design document only, not implemented |
| 14 | Unified Mood & Brain Integration | ✅ Complete | 10/10 | All phases implemented |
| 15 | Unified Generation Request Path | ✅ Complete | 10/10 | All phases complete; JobStatus→GenerationStatus renamed |
| 16 | Backend Plugin Capabilities | 📝 Design | 0/7 | Design document only, not implemented |
| 17 | NPC Interaction Layer | ✅ Complete | 7/7 | All phases complete (with world_time fix) |
| 18 | Frontend UI Structure Audit | ✅ Complete | 6/6 | Audit completed 2025-11-19 |
| 19 | NPC ECS & Plugin Metrics | 📝 Design | 0/N | Design document only, not implemented |
| 20 | Narrative Runtime Unification | ✅ Complete | 8/8 | All phases complete 2025-11-19 |
| 21 | World Time & Simulation Scheduler | ⏸️ Mostly Complete | 6/7 | Phases 1-4, 6-7 done; Phase 5 deferred |
| 22 | Game Mode & ViewState Model | 📝 Design | 0/5 | Design document only, not implemented |
| 23 | World GameProfile & Simulation Modes | 📝 Design | 0/5 | Design document only, not implemented |
| 24 | Architecture Validation | ✅ Complete | 5/5 | Validation completed 2025-11-19 |
| 25 | Snapshot & Scenario Runner | ⏸️ Partial | 5/5 | All phases marked complete but needs verification |
| 26 | Character Identity & Scene-Asset Graph | ✅ Complete | 5/5 | All phases complete; graph API + frontend browser |
| 27 | Registry Unification & Dogfooding | ✅ Complete | 4/4 | All phases complete; core now uses plugin APIs |
| 28 | Extensible Scoring & Simulation Config | ✅ Complete | 5/5 | All phases complete; pluggable scoring + custom styles |
| 50 | Plugin-Based Panel Registry | ✅ Complete | 5/5 | All phases complete; panels as plugins |
| 51 | Plugin Browser & Management | ✅ Complete | 5/5 | All phases complete; unified plugin UI |
| 52 | Panel Configuration & Layout | ✅ Complete | 5/5 | All phases complete; panel config store |
| 53 | Graph Editor Registry & Surfaces | ✅ Complete | 5/5 | All phases complete; graph editor plugin system |
| 54 | Dev Tools Surface & Debug Workspace | ✅ Complete | 5/5 | All phases complete; dev tools registry and presets |
| 104 | Rejected Upload Tracking & Asset Metadata | ✅ Complete | 4/5 | Backend infrastructure done; UI features future work |
| 105 | Editing-Core Hardening & Adoption Guidelines | ✅ Complete | 3/4 | Documentation complete; tests skipped (optional) |

**Legend:**
- ✅ Complete: All or nearly all phases done
- 🔄 In Progress: Currently being worked on
- ⏸️ Partial: Some phases done, significant work remains
- 📝 Design: Design document exists but not implemented

---

## Detailed Task Status

### ✅ COMPLETED TASKS (Production Ready)

#### Task 02: Interaction Presets & Palettes
**Status:** All 10 phases complete (2025-11-19)

**What it does:**
- Designer-friendly interaction presets for NPC slots and hotspots
- Preset editor with categorization and usage tracking
- Cross-world preset libraries and outcome-aware suggestions

**Key Files:**
- `apps/main/src/components/game/InteractionPresetEditor.tsx`
- `packages/game/engine/src/interactions/*`

---

#### Task 04: Per-World UI Themes & View Modes
**Status:** All 10 phases complete

**What it does:**
- Per-world UI theming system
- View mode presets and user-level overrides
- Dynamic themes driven by world state

**Key Files:**
- `packages/game/engine/src/world/worldUiConfig.ts`
- `packages/game/engine/src/world/dynamicThemeRules.ts`

---

#### Task 05: Simulation Playground
**Status:** All 10 phases complete

**What it does:**
- Stress-testing tool for time progression and NPC behavior
- Multi-world/multi-session comparison
- Scenario save/load and automation harness

**Key Files:**
- `apps/main/src/routes/SimulationPlayground.tsx`

---

#### Task 08: Social Metrics & NPC Systems
**Status:** All 10 phases complete (2025-11-19)

**What it does:**
- NPC mood and reputation as first-class metrics
- Built on Task 07's preview API pattern
- Integration with Mood Debug and dialogue plugins

**Key Files:**
- `pixsim7/backend/main/domain/metrics/mood_evaluators.py`
- `pixsim7/backend/main/domain/metrics/reputation_evaluators.py`
- `packages/game/engine/src/metrics/preview.ts`

---

#### Task 09: Intimacy & Scene Generation Prompts
**Status:** All 10 phases complete (reference implementation)

**What it does:**
- `GenerationSocialContext` for relationship-aware generation
- Content rating and safety controls
- Integration with generation pipeline

**Key Files:**
- `packages/types/src/generation.ts`
- `packages/game/engine/src/relationships/socialContext.ts`
- `docs/INTIMACY_AND_GENERATION.md`

---

#### Task 11: World-Aware Session Normalization
**Status:** All 10 phases complete with migration (2025-11-19)

**What it does:**
- Sessions linked to worlds via `world_id`
- Relationship normalization uses per-world schemas
- Schema validation with Pydantic models
- Redis caching (60s TTL) for normalized data

**Key Files:**
- `pixsim7/backend/main/domain/game/schemas.py`
- `pixsim7/backend/main/services/game/session_service.py`
- Migration: `20251119_0000_add_world_id_to_game_session.py`

---

#### Task 12: Intimacy Scene Composer
**Status:** All 7 phases complete (2025-11-19)

**What it does:**
- Visual editor for intimate scenes and relationship progression
- Gate visualizer with tier/intimacy progress
- Multi-layer validation (world + user ratings)
- Live preview with what-if analysis

**Key Files:**
- `apps/main/src/components/intimacy/IntimacySceneComposer.tsx`
- `apps/main/src/lib/intimacy/validation.ts`
- `docs/INTIMACY_SCENE_COMPOSER.md`

---

#### Task 14: Unified Mood & Brain Integration
**Status:** All 10 phases complete (2025-11-19)

**What it does:**
- Unified mood domains (general, intimate, social)
- Single mood state for general + intimate + active emotion
- Integration with NPC brain and Mood Debug tools

**Key Files:**
- `pixsim7/backend/main/domain/metrics/mood_types.py`
- `packages/game/engine/src/npcs/brain.ts`

---

#### Task 17: NPC Interaction Layer
**Status:** All 7 phases complete (✅ with world_time fix applied)

**What it does:**
- Canonical `NpcInteraction` model (TS + Pydantic)
- Availability and gating logic for interactions
- Execution pipeline with relationship effects
- **Note:** world_time fix applied to `interaction_execution.py` (2025-11-19)

**Key Files:**
- `pixsim7/backend/main/domain/game/interaction_execution.py`
- `docs/INTERACTION_AUTHORING_GUIDE.md`

**Follow-up Applied:**
- Fixed `lastInteractionAt` to use `session.world_time` instead of `datetime.utcnow()`
- Unblocked Task 21.6 for proper chain timing

---

#### Task 18: Frontend UI Structure Audit
**Status:** All 6 phases complete (2025-11-19)

**What it does:**
- Comprehensive audit of UI organization
- Component and route inventory
- Shared package boundary validation
- Agent-facing conventions documented

**Findings:**
- ✅ UI organization is excellent
- ✅ Shared package boundaries are clean
- ✅ No significant duplication detected

---

#### Task 20: Narrative Runtime Unification
**Status:** All 8 phases complete (2025-11-19)

**What it does:**
- Unified narrative runtime for dialogue, action blocks, and generation
- Integration with NPC ECS and interaction layer
- Narrative program versioning and composition

**Key Files:**
- `pixsim7/backend/main/domain/narrative/*`
- `docs/INTERACTION_AUTHORING_GUIDE.md`

---

#### Task 24: Architecture Validation
**Status:** All 5 phases complete (2025-11-19)

**What it does:**
- Meta-QA pass over major refactors
- ECS access pattern validation
- Plugin integration audit
- Performance and safety checks

**Findings:**
- ✅ Architecture is sound
- ✅ All systems working correctly
- ⚠️ Minor issues documented (legacy routes, direct mutations)

**Key Files:**
- `claude-tasks/24-architecture-validation-results.md`

---

#### Task 15: Unified Generation Request Path & Job Deprecation
**Status:** ✅ All 10 phases complete (2025-11-20)

**What it does:**
- Unified generation model with canonical `/api/v1/generations` endpoint
- Renamed `JobStatus` → `GenerationStatus` for clarity
- Zero legacy code or backward compatibility needed
- Clean, debt-free codebase with single generation path

**Key Changes:**
- Phases 1-5: Canonical path established, no legacy job infrastructure found
- Phase 6: Frontend already using `/api/v1/generations` exclusively
- Phases 7-10: No backward compatibility, deprecation, or cleanup needed
- Renamed JobStatus → GenerationStatus across 7 backend files

**Key Files:**
- `pixsim7/backend/main/domain/generation.py`
- `pixsim7/backend/main/api/v1/generations.py`
- `apps/main/src/lib/api/generations.ts`
- `claude-tasks/15-unified-generation-request-path-and-job-deprecation.md`

---

#### Task 26: Character Identity & Scene-Asset Graph Unification
**Status:** ✅ All 5 phases complete

**What it does:**
- Unified character identity graph connecting templates, instances, NPCs, scenes, assets, generations
- Backend graph traversal and query APIs with filtering
- Standardized character linkage conventions for scenes and assets
- Frontend character graph browser with interactive visualization

**Complete:**
- Phase 1: Inventory of character/scene/asset links
- Phase 2: TypeScript graph model types (9 node types, 13 edge types)
- Phase 3: Backend graph access & query APIs with admin routes
- Phase 4: Scene & asset linkage via standardized metadata conventions
- Phase 5: Frontend CharacterGraphBrowser component with 4 view modes

**Key Files:**
- `pixsim7/backend/main/domain/character_graph.py`
- `pixsim7/backend/main/api/v1/character_graph.py`
- `packages/types/src/characterGraph.ts`
- `apps/main/src/components/character-graph/CharacterGraphBrowser.tsx`
- `docs/CHARACTER_LINKAGE_CONVENTIONS.md`

---

#### Task 27: Registry Unification & Built-in Dogfooding
**Status:** ✅ All 4 phases complete (2025-11-20)

**What it does:**
- Unified registration patterns so core features use the same plugin infrastructure they offer to plugins
- Philosophy: "If a plugin could do X, core should use the same pathway when doing X built-in"

**Complete:**
- Phase 1: Registry-ify built-in conditions (replaced 40+ line if/elif chain with `BUILTIN_CONDITIONS` dict)
- Phase 2: Unify component registration (core ECS components now register through `behavior_registry`)
- Phase 3: Data-driven behavior profiles (custom profiles definable in world metadata)
- Phase 4: Testing & documentation

**Key Changes:**
- `conditions.py`: Built-in conditions use registry lookup instead of if/elif chain
- `ecs.py`: Added `register_core_components()` called at startup
- `gameProfile.ts`: Behavior profiles lookup world metadata first, then fall back to built-ins
- Uniform code paths for core and plugins

**Key Files:**
- `pixsim7/backend/main/domain/behavior/conditions.py`
- `pixsim7/backend/main/domain/game/ecs.py`
- `pixsim7/backend/main/main.py`
- `packages/game/engine/src/world/gameProfile.ts`
- `claude-tasks/27-registry-unification-and-builtin-dogfooding.md`

---

#### Task 28: Extensible Scoring & Simulation Configuration
**Status:** ✅ All 5 phases complete (2025-11-20)

**What it does:**
- Pluggable scoring factors for activity selection
- Per-world simulation tier overrides
- Custom game styles and behavior profiles

**Complete:**
- Phase 1: Pluggable scoring factor registry (plugins can register custom scoring factors)
- Phase 2: Default scoring factor set (baseWeight, activityPreference, categoryPreference, traitModifier, etc.)
- Phase 3: Per-world scoring overrides via `world.meta.behavior.scoringConfig`
- Phase 4: Simulation tier overrides via `world.meta.simulationConfig.tierLimits`
- Phase 5: Testing & documentation

**Key Changes:**
- `scoring.py`: Added `SCORING_FACTORS` registry and `register_scoring_factor()` API
- `gameProfile.ts`: Added `getDefaultSimulationTierLimits()` with world metadata support
- Custom behavior profiles: Worlds can define profiles in `meta.behavior.behaviorProfiles`
- Custom game styles: Non-core styles fall back to 'hybrid' defaults

**Key Files:**
- `pixsim7/backend/main/domain/behavior/scoring.py`
- `packages/game/engine/src/world/gameProfile.ts`
- `packages/types/src/game.ts`
- `claude-tasks/28-extensible-scoring-and-simulation-config.md`

---

#### Task 50: Plugin-Based Panel Registry
**Status:** ✅ All 5 phases complete (2025-11-22)

**What it does:**
- Unified panel registration via plugin system
- Core panels as a plugin (corePanelsPlugin)
- Panel metadata with categories, tags, icons
- Plugin-based panel discovery and management

**Key Changes:**
- Created `PanelPlugin` type and `PanelDefinition` interface
- Moved all core panels to `corePanelsPlugin.tsx`
- Integrated panel registry with plugin catalog
- Added panel categories: core, game, development, tools

**Key Files:**
- `apps/main/src/lib/panels/panelPlugin.ts`
- `apps/main/src/lib/panels/corePanelsPlugin.tsx`
- `apps/main/src/lib/panels/panelRegistry.ts`

---

#### Task 51: Plugin Browser & Management
**Status:** ✅ All 5 phases complete (2025-11-22)

**What it does:**
- Unified plugin browser UI showing all plugin families
- Filter by family, origin, activation state
- Enable/disable plugins with activation controls
- Plugin search and detailed plugin cards

**Key Files:**
- `apps/main/src/components/settings/PluginBrowserPanel.tsx`
- `apps/main/src/lib/plugins/pluginSystem.ts`
- Registered as 'plugin-browser' panel in settings

---

#### Task 52: Panel Configuration & Layout
**Status:** ✅ All 5 phases complete (2025-11-22)

**What it does:**
- Panel configuration store (panelConfigStore)
- Per-panel settings (compact mode, visibility, etc.)
- Integration with workspace layouts
- Panel state persistence

**Key Files:**
- `apps/main/src/stores/panelConfigStore.ts`
- Panel configs for all core panels
- Integration with workspace presets

---

#### Task 53: Graph Editor Registry & Surfaces
**Status:** ✅ All 5 phases complete (2025-11-23)

**What it does:**
- Graph editor registry for multiple graph editor types
- GraphEditorDefinition with metadata and store bindings
- Built-in graph editors: scene-graph-v2, arc-graph
- Workspace preset integration for graph editor selection
- Graph editor switcher in workspace UI

**Key Changes:**
- Created `GraphEditorRegistry` and `GraphEditorDefinition`
- Registered scene and arc graph editors
- Added graph editor selection to workspace presets
- Integrated with panel system

**Key Files:**
- `apps/main/src/lib/graph/editorRegistry.ts`
- `apps/main/src/lib/graph/registerGraphEditors.ts`
- `apps/main/src/components/graph/GraphEditorHost.tsx`
- `docs/NODE_EDITOR_DEVELOPMENT.md`

---

#### Task 54: Dev Tools Surface & Debug Workspace
**Status:** ✅ All 5 phases complete (2025-11-23)

**What it does:**
- Developer tools registry (devToolRegistry)
- DevToolsPanel for browsing and accessing dev tools
- Dev workspace presets (dev-default, dev-plugins, dev-architecture)
- Plugin integration for dev tools
- Registered 8 built-in dev tools: session viewer, plugin workspace, dependency graph, app map, backend architecture, generation health, template analytics, capability testing

**Complete:**
- Phase 1: Dev tool definition & registry with search/filtering
- Phase 2: Registered existing dev tools (8 tools)
- Phase 3: Dev workspace presets & navigation panel
- Phase 4: Plugin integration ('dev-tool' family)
- Phase 5: UX polish & comprehensive documentation

**Key Changes:**
- Created `DevToolRegistry` with category-based organization
- Implemented `DevToolsPanel` with search and filtering
- Added 3 dev workspace presets to workspaceStore
- Extended plugin system with 'dev-tool' plugin family
- Added registerDevTool() to registry bridge

**Key Files:**
- `apps/main/src/lib/devtools/devToolRegistry.ts`
- `apps/main/src/lib/devtools/registerDevTools.ts`
- `apps/main/src/components/dev/DevToolsPanel.tsx`
- `apps/main/src/lib/plugins/registryBridge.ts`
- `docs/APP_MAP.md` (Dev Tools section)
- `docs/SYSTEM_OVERVIEW.md` (Dev Tools section)
- `claude-tasks/54-dev-tools-surface-and-debug-workspace.md`

---

### ⏸️ PARTIALLY COMPLETE TASKS

#### Task 01: World HUD Layout Designer
**Status:** 7/10 phases complete

**Complete:**
- Phases 1-7: Per-world HUD config, regions, layout editor, visibility conditions, presets, profiles, server-backed presets

**Pending:**
- Phase 8: HUD usage analytics
- Phase 9: Layout validation & recommendations
- Phase 10: Responsive/device-aware layouts

**Key Files:**
- `apps/main/src/components/game/RegionalHudLayout.tsx`
- `apps/main/src/components/game/HudLayoutEditor.tsx`

---

#### Task 03: Scene/Quest Graph Templates
**Status:** 9/10 phases complete

**Complete:**
- Phases 1-9: In-memory templates, palette, persistence, per-world templates, export/import, template library, wizards, validation, cross-world packs

**Pending:**
- Phase 10: Template usage analytics & refactoring hints (not started)

**Key Files:**
- `apps/main/src/lib/graph/templates.ts`
- `apps/main/src/components/graph/GraphTemplatePalette.tsx`

---

#### Task 06: App Map & Dev Panel
**Status:** 6/10 phases complete

**Complete:**
- Phase 1: Static APP_MAP.md
- Phase 2: App Map dev view via GraphPanel
- Phases 3-6: Dependency graph, plugin drill-down, capability testing, export/import

**Pending:**
- Phase 7: Enhanced search & filtering
- Phase 8: Health gating & warnings
- Phase 9: Performance/load metrics integration
- Phase 10: Integration with codegen & scaffolding

**Key Files:**
- `docs/APP_MAP.md`
- `apps/main/src/components/dev/DependencyGraphPanel.tsx`

---

#### Task 07: Relationship Preview API & Metrics
**Status:** 9.5/10 phases complete

**Complete:**
- Phases 1-5, 7-10: Audit, design, backend preview endpoints, TS wrappers, migration (no migration needed), metric system, docs, regression, offline tooling

**Partial:**
- Phase 6: TS fallback logic deprecated but still present for backward compatibility

**Key Files:**
- `pixsim7/backend/main/api/v1/game_relationship_preview.py`
- `packages/game/engine/src/relationships/preview.ts`
- `docs/SOCIAL_METRICS.md`

---

#### Task 10: Unified Generation Pipeline
**Status:** 6/10 phases complete (Phase 8 added 2025-11-20)

**Complete:**
- Phase 1: Migration to unified `Generation` model
- Phase 2: Frontend generation nodes wired to service
- Phase 3: Prompt versioning & `prompt_config` integration
- Phase 4: Social context & intimacy integration
- Phase 5: Validation & health panel
- Phase 8: Safety & content rating enforcement (2025-11-20)

**Pending:**
- Phase 6: Caching, determinism & seed strategy
- Phase 7: Telemetry (cost, latency, provider health)
- Phase 9: Regression harness for generations
- Phase 10: Developer tools & App Map integration

**Key Files:**
- `pixsim7/backend/main/services/generation/generation_service.py`
- `packages/game/engine/src/generation/requestBuilder.ts`

---

#### Task 21: World Time & Simulation Scheduler
**Status:** 6/7 phases complete (2025-11-20)

**Complete:**
- Phases 1-4: Time tracking, scheduler design, basic tick loop, tier-based simulation
- Phase 6: Chain timing & cooldowns now use world_time (unblocked 2025-11-20)
- Phase 7: Telemetry integration

**Deferred:**
- Phase 5: Generation service integration (integration points ready, low priority)

**Key Changes (Phase 6):**
- Fixed `apply_npc_effects()`, `track_interaction_cooldown()`, `advance_interaction_chain()`
- All functions now accept optional `world_time` parameter
- Maintains backward compatibility with real-time fallback
- Ensures gameplay consistency using world_time instead of real-time

**Key Files:**
- `pixsim7/backend/main/domain/game/interaction_execution.py`
- `pixsim7/backend/main/domain/game/interaction_availability.py`

---

#### Task 25: Snapshot & Scenario Runner
**Status:** 5/5 phases marked complete but needs verification

**All phases marked complete:**
- Phase 1: Snapshot format & capture/restore APIs
- Phase 2: Scenario script model
- Phase 3: Headless runner & execution engine
- Phase 4: Assertion & reporting framework
- Phase 5: Example scenarios & CI hook

**Note:** Status shows complete but may need verification of actual implementation

---

### 📝 DESIGN-ONLY TASKS (Not Yet Implemented)

#### Task 13: NPC Behavior System (Activities & Routine Graphs)
**Status:** Design document only

**What it covers:**
- Graph-based, preference-driven NPC behavior
- Activity catalog, NPC preferences, routine graphs
- Activity resolution and scoring
- Integration with relationships, mood, scenes, generation

**Next Steps:**
- Implement activity catalog and basic routine graph
- Build NPC preference system
- Create activity resolution logic

---

#### Task 16: Backend Plugin Capabilities & Sandboxing
**Status:** Design document only (0/7 phases)

**What it covers:**
- Capability-based plugin model
- Permission enforcement
- Plugin observability and failure isolation
- Path to out-of-process/sandboxed plugins

**Next Steps:**
- Inventory plugin types and touch points
- Define permission model
- Implement `PluginContext` & DI

---

#### Task 19: NPC ECS & Plugin Metrics
**Status:** Design document only

**What it covers:**
- Component-based (ECS-like) model for NPC state
- Plugin component namespaces
- Typed metric registry across components
- Backward compatibility via projections

**Next Steps:**
- Finalize component storage layout
- Implement component access APIs
- Migrate core systems to use components

**Dependencies:**
- Wait for Tasks 13, 14, 16, 17 to be stable

---

#### Task 22: Game Mode & ViewState Model
**Status:** Design document only (0/5 phases)

**What it covers:**
- Unified game mode/view-state model (map/room/scene/conversation)
- Frontend GameState store & route integration
- Session-level GameState backend support
- Integration with narrative runtime & interactions

**Next Steps:**
- Define GameMode & GameContext types
- Implement frontend GameState store
- Add session-level tracking

---

#### Task 23: World GameProfile & Simulation Modes
**Status:** Design document only (0/5 phases)

**What it covers:**
- World-level profile for life-sim vs VN tuning
- Simulation mode configuration (real-time vs turn-based)
- Behavior scoring weights and narrative emphasis
- Integration with scheduler and Game2D

**Next Steps:**
- Define GameProfile & SimulationMode schema
- Wire into behavior and scoring
- Align turn-based mode in Game2D

---

## Key Documentation Files

### Core Architecture
- `docs/APP_MAP.md` - Architecture index and system overview
- `docs/SYSTEM_OVERVIEW.md` - Backend architecture
- `docs/RELATIONSHIPS_AND_ARCS.md` - Relationship system conventions
- `docs/SOCIAL_METRICS.md` - Social metrics and preview APIs
- `docs/DYNAMIC_GENERATION_FOUNDATION.md` - Generation system design

### Specific Systems
- `docs/INTIMACY_AND_GENERATION.md` - Intimacy-aware generation
- `docs/INTIMACY_SCENE_COMPOSER.md` - Intimacy scene editor
- `docs/INTERACTION_AUTHORING_GUIDE.md` - Interaction and chain authoring
- `docs/behavior_system/README.md` - NPC behavior system (design)

### Process & Tracking
- `claude-tasks/README.md` - How to use Claude task files
- `claude-tasks/TASK_STATUS_UPDATE_NEEDED.md` - Recent status updates
- `docs/TASK_TRACKING_OVERVIEW.md` - This file

---

## Critical Dependencies & Blockers

### Recently Resolved
✅ **Task 17.5 → Task 21.6** (2025-11-19)
- **Issue:** Interaction execution used real-time instead of world_time
- **Fix:** Updated `interaction_execution.py` to accept and use `world_time` parameter
- **Impact:** Task 21.6 (Chain Timing) now unblocked

### Current Blockers
None critical for content production.

### Future Implementation Order
Recommended sequence for design-only tasks:

1. **Task 13** (NPC Behavior System) - Foundation for many other systems
2. **Task 16** (Plugin Capabilities) - Needed for extensibility
3. **Task 19** (NPC ECS) - Depends on 13, 16, 17 being stable
4. **Task 22** (Game Mode) - Needed for proper UI state management
5. **Task 23** (GameProfile) - Depends on 13, 21, 22
6. **Task 26** (Character Identity Graph) - Can proceed independently

---

## Recent Changes Log

### 2025-11-19
- ✅ Completed Task 17 all phases (with world_time fix)
- ✅ Completed Task 20 all phases (narrative runtime)
- ✅ Fixed interaction timing to use world_time (unblocked Task 21.6)
- ✅ Updated all task checklists

### 2025-11-18
- Added character registry migrations (Task 26 Phase 1)

---

## How to Use This Document

### For Agents Starting Work
1. Check the **Quick Status Matrix** to see what's done
2. Read the **Detailed Task Status** for your area
3. Check **Critical Dependencies & Blockers** before starting
4. Review related docs in **Key Documentation Files**

### For Humans Coordinating Work
- Use **Quick Status Matrix** for high-level planning
- Reference **Detailed Task Status** for specific questions
- Check **Recent Changes Log** to see what's fresh
- Use this to avoid asking agents to re-analyze completed work

### Updating This Document
- Regenerate when major phases complete
- Update **Recent Changes Log** with date and summary
- Keep **Quick Status Matrix** accurate
- Add new blockers/dependencies as discovered

---

## Architectural Analysis: Design Flexibility & Dynamic Loading

### Overview

This section identifies areas where the architecture might be "cornering itself" with hardcoded patterns, and opportunities for more dynamic, plugin-driven approaches.

### 🟢 Excellent Dynamic Patterns (Already Implemented)

#### 1. **Behavior Extension Registry** (`behavior_registry.py`)
**Status:** ✅ Excellent plugin architecture

**What's Good:**
- Fully dynamic condition/effect/component registration
- Plugins can register at runtime via `BehaviorExtensionAPI`
- Permission-checked access through `PluginContext`
- Clean separation: registry is locked after startup, preventing runtime corruption
- Metrics tracking per plugin for observability

**Example:**
```python
behavior_registry.register_condition(
    "plugin:game-stealth:has_disguise",
    plugin_id="game-stealth",
    evaluator=check_disguise_fn
)
```

#### 2. **Provider Registry** (`services/provider/registry.py`)
**Status:** ✅ Clean registry pattern

**What's Good:**
- Simple registration API
- Auto-discovery capability
- Easy to add new providers without code changes

---

### 🟡 Partially Hardcoded (Opportunities for Improvement)

#### 1. **Condition Types in Behavior System** (`conditions.py`)
**Current State:** 10 hardcoded condition types with giant if/elif chain

```python
if cond_type == "relationship_gt":
    return _eval_relationship_gt(condition, context)
elif cond_type == "relationship_lt":
    return _eval_relationship_lt(condition, context)
elif cond_type == "flag_equals":
    return _eval_flag_equals(condition, context)
# ... 7 more hardcoded types
elif cond_type == "custom":
    return _eval_custom(condition, context)  # Plugin escape hatch
```

**Issues:**
- Core condition types are hardcoded
- Adding new built-in conditions requires code changes
- `custom` type exists as escape hatch, but all built-ins are still hardcoded

**Better Approach:**
```python
# Register built-in conditions at module load
BUILTIN_CONDITIONS = {
    "relationship_gt": _eval_relationship_gt,
    "relationship_lt": _eval_relationship_lt,
    "flag_equals": _eval_flag_equals,
    # ... etc
}

def evaluate_condition(condition, context):
    cond_type = condition.get("type")

    # Try built-in registry first
    if cond_type in BUILTIN_CONDITIONS:
        return BUILTIN_CONDITIONS[cond_type](condition, context)

    # Fall back to custom evaluators
    if cond_type in CONDITION_EVALUATORS:
        return CONDITION_EVALUATORS[cond_type](condition, context)

    logger.warning(f"Unknown condition type: {cond_type}")
    return False
```

**Benefits:**
- Built-ins and plugins use same pathway
- Easy to move built-ins to plugins if needed
- Reduces code duplication

---

#### 2. **ECS Component Schemas** (`ecs.py` lines 61-69)
**Current State:** Hardcoded component schema registry

```python
COMPONENT_SCHEMAS = {
    "core": RelationshipCoreComponentSchema,
    "romance": RomanceComponentSchema,
    "stealth": StealthComponentSchema,
    "mood": MoodStateComponentSchema,
    "quests": QuestParticipationComponentSchema,
    "behavior": BehaviorStateComponentSchema,
    "interactions": InteractionStateComponentSchema,
}
```

**Issues:**
- Core component types are hardcoded in ECS module
- Plugins can register via `behavior_registry.register_component_schema()`, but core components bypass this
- Two different registration paths (core vs plugin)

**Better Approach:**
```python
# In ecs.py - just access the behavior_registry
from pixsim7.backend.main.infrastructure.plugins.behavior_registry import behavior_registry

def get_component_schema(component_name: str):
    """Get component schema from unified registry"""
    schema_meta = behavior_registry.get_component_schema(component_name)
    if schema_meta:
        return schema_meta.schema
    return None  # No schema validation for dynamic components
```

**During startup (in app initialization):**
```python
# Register core components through same API as plugins
behavior_registry.register_component_schema(
    "core",
    plugin_id="__core__",
    schema=RelationshipCoreComponentSchema,
    metrics={...}
)
```

**Benefits:**
- Single source of truth for all components
- Core and plugins treated uniformly
- Easier introspection for tooling

---

#### 3. **GameProfile Scoring Weights** (`gameProfile.ts` lines 25-62)
**Current State:** Hardcoded switch statement for behavior profiles

```typescript
switch (behaviorProfile) {
  case 'work_focused':
    return { categoryPreference: 1.0, urgency: 1.5, ... };
  case 'relationship_focused':
    return { categoryPreference: 0.6, urgency: 0.8, ... };
  case 'balanced':
  default:
    return baseWeights;
}
```

**Issues:**
- Only 3 behavior profiles hardcoded
- Custom profiles require code changes
- Can't define new profiles via world metadata

**Better Approach:**
```typescript
// In world.meta or as presets
"behaviorProfiles": {
  "work_focused": {
    "weights": { "categoryPreference": 1.0, "urgency": 1.5, ... }
  },
  "relationship_focused": {
    "weights": { "categoryPreference": 0.6, ... }
  },
  "custom_night_owl": {
    "weights": { "timeOfDayPreference": 2.0, ... }
  }
}

// Function becomes a lookup with fallback
export function getScoringWeights(
  behaviorProfile: string,
  worldProfiles?: Record<string, BehaviorProfileDef>
): ScoringConfig['weights'] {
  // Try world-defined profiles first
  if (worldProfiles?.[behaviorProfile]) {
    return worldProfiles[behaviorProfile].weights;
  }

  // Fall back to built-in presets
  return BUILTIN_PROFILES[behaviorProfile] ?? BUILTIN_PROFILES.balanced;
}
```

**Benefits:**
- Designers can create custom behavior profiles per world
- No code changes needed for new profiles
- Built-ins remain as sensible defaults

---

#### 4. **GameStyle & GameMode Enums** (`types/game.ts`)
**Current State:** Hardcoded union types

```typescript
export type GameStyle = 'life_sim' | 'visual_novel' | 'hybrid';
export type GameMode = 'map' | 'room' | 'scene' | 'conversation' | 'menu';
export type BehaviorProfile = 'work_focused' | 'relationship_focused' | 'balanced';
```

**Issues:**
- Can't add new game styles without touching types
- Plugins can't define new modes
- Limits experimentation (e.g., "roguelike" or "tactical" styles)

**Better Approach:**
```typescript
// Core types remain for validation, but allow extensions
export type CoreGameStyle = 'life_sim' | 'visual_novel' | 'hybrid';
export type GameStyle = CoreGameStyle | string;  // Allow custom styles

// Or use a registry pattern
export const GAME_STYLES = new Set(['life_sim', 'visual_novel', 'hybrid']);

export function registerGameStyle(style: string, config: GameStyleConfig) {
  GAME_STYLES.add(style);
  GAME_STYLE_CONFIGS.set(style, config);
}

// Usage
registerGameStyle('roguelike', {
  simulationDefaults: { ... },
  behaviorProfile: 'exploration_focused',
  narrativeProfile: 'light'
});
```

**Trade-offs:**
- Lose type safety for custom styles
- But gain flexibility for mods/plugins
- Could use const assertions for known styles while allowing extensions

---

### 🔴 Potential Design Corners

#### 1. **Scoring System Fixed to 8 Factors** (`scoring.py`)
**Current State:** Scoring calculation hardcoded to specific factors

```python
# Start with base weight
score = base_weight * weights["baseWeight"]

# Activity-specific preference
score *= activity_pref * weights["activityPreference"]

# Category preference
score *= category_pref * weights["categoryPreference"]

# ... 5 more hardcoded factors
```

**Issue:**
- Plugins can't add new scoring factors
- Must modify core code to add dimensions (e.g., "weather preference", "social fatigue")

**Better Approach:**
```python
# Define scoring factors as a registry
SCORING_FACTORS = {
    'base': lambda activity, npc, ctx, w: w['baseWeight'],
    'activity_pref': lambda activity, npc, ctx, w: calculate_activity_pref(...),
    'category_pref': lambda activity, npc, ctx, w: calculate_category_pref(...),
    # ... etc
}

def calculate_activity_score(activity, npc_preferences, npc_state, context, scoring_weights):
    score = 1.0

    for factor_id, factor_fn in SCORING_FACTORS.items():
        factor_value = factor_fn(activity, npc_preferences, npc_state, context, scoring_weights)
        score *= factor_value

    return score

# Plugins can register factors
def register_scoring_factor(factor_id, factor_fn):
    SCORING_FACTORS[factor_id] = factor_fn
```

**Benefits:**
- Plugins can add scoring dimensions
- Core factors still work the same
- More modular testing

---

#### 2. **Simulation Tier Limits Hardcoded per Style** (`gameProfile.ts` lines 73-107)
**Current State:** Tier limits hardcoded in switch statement

```typescript
switch (style) {
  case 'life_sim':
    return { detailed: 10, active: 150, ambient: 800, dormant: 10000 };
  case 'visual_novel':
    return { detailed: 20, active: 50, ambient: 200, dormant: 2000 };
  // ...
}
```

**Issue:**
- Can't configure tier limits per world without code change
- Assumes all life-sim worlds want same limits
- No way to override for specific world needs

**Better Approach:**
```typescript
// World metadata can override defaults
"simulationConfig": {
  "tierLimits": {
    "detailed": 15,    // Override for this specific world
    "active": 75,
    "ambient": 300
  }
}

// Function checks world first, then style defaults
export function getSimulationTierLimits(
  world: GameWorld,
  style?: GameStyle
): TierLimits {
  // Explicit world config wins
  if (world.meta?.simulationConfig?.tierLimits) {
    return world.meta.simulationConfig.tierLimits;
  }

  // Fall back to style defaults
  return STYLE_DEFAULT_TIER_LIMITS[style ?? world.meta?.gameProfile?.style ?? 'hybrid'];
}
```

---

### 🎯 Recommendations

#### High Priority (Easy Wins)

1. **Unify Component Registration**
   - Move core components to use `behavior_registry` during startup
   - Eliminate `COMPONENT_SCHEMAS` hardcoded dict
   - File: `pixsim7/backend/main/domain/game/ecs.py`

2. **Registry-ify Built-in Conditions**
   - Convert if/elif chain to registry lookup
   - Treat built-ins as "always registered" conditions
   - File: `pixsim7/backend/main/domain/behavior/conditions.py`

3. **Make Behavior Profiles Data-Driven**
   - Move hardcoded switch to preset lookup
   - Allow world.meta to define custom profiles
   - File: `packages/game/engine/src/world/gameProfile.ts`

#### Medium Priority (More Invasive)

4. **Extensible Scoring Factors**
   - Refactor scoring to use factor registry
   - Allow plugins to register scoring dimensions
   - File: `pixsim7/backend/main/domain/behavior/scoring.py`

5. **Per-World Simulation Overrides**
   - Check world metadata before style defaults
   - Allow fine-tuning per world
   - File: `packages/game/engine/src/world/gameProfile.ts`

#### Low Priority (Design Discussion Needed)

6. **Extensible Type System**
   - Decide on string unions vs registries for GameStyle/GameMode
   - Balance type safety vs flexibility
   - May require breaking changes

---

### Summary

**Current State:**
- ✅ Plugin system is excellent (behavior_registry, provider_registry)
- 🟡 Some systems use plugins but keep built-ins hardcoded
- 🔴 A few areas locked to specific sets (profiles, scoring factors)

**Philosophy:**
The codebase already has the **right infrastructure** (registries, plugin APIs, permission system). The opportunity is to **dogfood it** - make core features use the same extensibility they offer to plugins.

**Key Principle:**
> "If a plugin could theoretically do X, the core should use the same pathway when doing X built-in."

This creates:
- Uniform code paths (easier to maintain)
- Better testing (core features exercise plugin APIs)
- True extensibility (anything core can do, plugins can do)

---

**Last Updated:** 2025-11-20
**Generated By:** Claude Code Task Analysis Agent
**Source:** Analysis of all files in `claude-tasks/` directory
