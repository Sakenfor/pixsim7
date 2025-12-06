# Documentation Index

**Last Updated**: 2025-12-06

Quick reference guide to all PixSim7 documentation. This index organizes 400+ documentation files by category for easy navigation.

---

## 🚀 Getting Started

**New to the project?** Start here:

- [README.md](../README.md) - Project overview and quick start
- [DEVELOPMENT_GUIDE.md](../DEVELOPMENT_GUIDE.md) - Development setup and workflows
- [ARCHITECTURE.md](../ARCHITECTURE.md) - High-level system architecture
- [SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md) - Detailed system overview

**Backend Setup**:
- [Backend README](../pixsim7/backend/main/README.md) - Backend overview
- [Backend Getting Started](../pixsim7/backend/main/GETTING_STARTED.md) - Setup guide
- [Redis and Workers Setup](../pixsim7/backend/main/REDIS_AND_WORKERS_SETUP.md)
- [TimescaleDB Setup](TIMESCALEDB_SETUP.md)

**Frontend Setup**:
- [Apps/Main README](../apps/main/README.md) - Main frontend app

---

## 📚 Core Systems

### Architecture & Design
- [Architecture](../ARCHITECTURE.md) - System architecture overview
- [Architecture Diagrams](../ARCHITECTURE_DIAGRAMS.md) - Visual architecture diagrams
- [Architecture Documentation Index](architecture/README.md) - Organized architecture docs
- [Extension Architecture](EXTENSION_ARCHITECTURE.md) - Plugin/extension design
- [UI Architecture](architecture/subsystems/ui-architecture.md) - Editable UI system
- [Launcher Architecture](architecture/subsystems/launcher-architecture.md) - Application launcher
- [NPC Architecture](architecture/subsystems/npc-architecture.md) - NPC persona system
- [ADR: Gizmo Architecture](ADR-GIZMO-ARCHITECTURE.md) - Gizmo system ADR

### Plugin System
- [Plugin System](systems/plugins/PLUGIN_SYSTEM.md) - Main plugin guide
- [Unified Plugin System](systems/plugins/UNIFIED_PLUGIN_SYSTEM.md) - Cross-family plugin system
- [Plugin Developer Guide](systems/plugins/PLUGIN_DEVELOPER_GUIDE.md) - Building plugins
- [Plugin Reference](systems/plugins/PLUGIN_REFERENCE.md) - API reference
- [Plugin Architecture](systems/plugins/PLUGIN_ARCHITECTURE.md) - Plugin loading & architecture
- [Plugin Catalog](systems/plugins/PLUGIN_CATALOG.md) - Available plugins
- [Plugin Workspace](systems/plugins/PLUGIN_WORKSPACE.md) - Workspace plugin specifics
- [Backend Plugin Capabilities](decisions/20251121-backend-plugin-auto-discovery.md)

### Generation System
- [Generation System](systems/generation/GENERATION_SYSTEM.md) - Overview & architecture
- [Generation Guide](systems/generation/GENERATION_GUIDE.md) - Developer guide
- [Generation Alias Conventions](systems/generation/GENERATION_ALIAS_CONVENTIONS.md) - Naming conventions
- [Generation Status](systems/generation/GENERATION_STATUS.md) - Status integration
- [Realtime Video Generation](systems/generation/REALTIME_VIDEO_GENERATION.md) - Streaming generation
- [Intimacy and Generation](systems/generation/INTIMACY_AND_GENERATION.md) - Context-aware generation
- [Generation Node Plugin](systems/generation/GENERATION_NODE_PLUGIN.md) - Plugin nodes
- [Action Blocks Unified System](ACTION_BLOCKS_UNIFIED_SYSTEM.md) - Action blocks
- [Smart MediaCard Generate Button](SMART_MEDIACARD_GENERATE_BUTTON.md)

### Relationship & Stats System
- [Relationships and Arcs](RELATIONSHIPS_AND_ARCS.md) - Relationship system overview
- [Relationship Migration Guide](../RELATIONSHIP_MIGRATION_GUIDE.md)
- [Abstract Stat System](../ABSTRACT_STAT_SYSTEM.md)
- [Stat System Integration Plan](../STAT_SYSTEM_INTEGRATION_PLAN.md)
- [Entity Stats Examples](../ENTITY_STATS_EXAMPLES.md)
- [Social Metrics](SOCIAL_METRICS.md)

### Game & Simulation
- [Gameplay Systems](../GAMEPLAY_SYSTEMS.md)
- [World Sessions Issues](../WORLD_SESSIONS_ISSUES.md)
- [Turn-Based World Mode](TURN_BASED_WORLD_MODE.md)
- [Simulation Automation](SIMULATION_AUTOMATION.md)
- [NPC Dialogue Enhancements](NPC_DIALOGUE_ENHANCEMENTS_STATUS.md)
- [NPC Response Video Integration](NPC_RESPONSE_VIDEO_INTEGRATION.md)
- [NPC Interactive Zones Design](NPC_INTERACTIVE_ZONES_DESIGN.md)
- [Behavior System README](behavior_system/README.md)

### UI & Components
- [Components Guide](frontend/COMPONENTS.md)
- [Frontend Component Guide](FRONTEND_COMPONENT_GUIDE.md)
- [HUD Layout Designer](../HUD_LAYOUT_DESIGNER.md)
- [Panel Consolidation Analysis](PANEL_CONSOLIDATION_ANALYSIS.md)
- [Panel Organization Audit](PANEL_ORGANIZATION_AUDIT.md)
- [Workspace Panel System](claude-tasks/50-workspace-panel-system-enhancement.md)

### Graph & Node Systems
- [Graph System](GRAPH_SYSTEM.md)
- [Graph Renderer Plugins](../GRAPH_RENDERER_PLUGINS.md)
- [Dynamic Node Types](../DYNAMIC_NODE_TYPES.md)
- [Node Editor Development](NODE_EDITOR_DEVELOPMENT.md)

### Overlay & Widgets
- [Overlay Data Binding](OVERLAY_DATA_BINDING.md)
- [Overlay Positioning System](OVERLAY_POSITIONING_SYSTEM.md)
- [Overlay String Paths](OVERLAY_STRING_PATHS.md)
- [Widget Integration Guide](../apps/main/src/lib/widgets/INTEGRATION_GUIDE.md)
- [Widget Demo Guide](../apps/main/src/lib/widgets/DEMO_GUIDE.md)

---

## 🛠️ Developer Guides

### Frontend Development
- [Component Guide](frontend/COMPONENTS.md)
- [Panel Plugins and Registry](../apps/main/src/lib/panels/PANEL_PLUGINS_AND_REGISTRY.md)
- [Gizmo Integration](../apps/main/src/components/gizmos/INTEGRATION.md)
- [Shapes Integration Guide](../apps/main/src/components/shapes/INTEGRATION_GUIDE.md)
- [Data Binding Guide](../apps/main/src/lib/dataBinding/DATA_BINDING_GUIDE.md)
- [Editing Core README](../apps/main/src/lib/editing-core/README.md)
- [HUD Integration Guide](../apps/main/src/lib/gameplay-ui-core/HUD_INTEGRATION_GUIDE.md)
- [Overlay Integration Guide](../apps/main/src/lib/overlay/INTEGRATION_GUIDE.md)

### Backend Development
- [Backend Services](backend/SERVICES.md)
- [Backend Architecture Conventions](claude-tasks/40-backend-architecture-conventions-and-cleanup.md)
- [Backend Modernization](BACKEND_MODERNIZATION.md)
- [Backend Startup](BACKEND_STARTUP.md)
- [Backend Interaction Dispatcher](BACKEND_INTERACTION_DISPATCHER.md)
- [Adding JWT Providers](../pixsim7/backend/main/services/provider/ADDING_JWT_PROVIDERS.md)

### API & Integration
- [API Payload Examples](../apps/main/src/lib/api/PAYLOAD_EXAMPLES.md)
- [Action Engine Usage](ACTION_ENGINE_USAGE.md)
- [Action Prompt Engine Spec](ACTION_PROMPT_ENGINE_SPEC.md)
- [Narrative Prompt Engine Spec](NARRATIVE_PROMPT_ENGINE_SPEC.md)
- [Provider Capability Registry](PROVIDER_CAPABILITY_REGISTRY.md)
- [Provider Capability Integration](examples/PROVIDER_CAPABILITY_INTEGRATION.md)

### Testing & Quality
- [Interaction Authoring Guide](INTERACTION_AUTHORING_GUIDE.md)
- [Scenario Tests README](../tests/scenarios/README.md)
- [Launcher Integration Testing](LAUNCHER_INTEGRATION_TESTING.md)

---

## 📦 Specific Systems

### Launcher
- [Launcher README](../launcher/README.md)
- [Launcher GUI Integration](../launcher/gui/INTEGRATION_GUIDE.md)

### Chrome Extension
- [Chrome Extension README](../chrome-extension/README.md)
- [Chrome Extension Quick Start](../chrome-extension/QUICK_START.md)
- [Chrome Extension Modules](../chrome-extension/content/MODULES.md)
- [Sora Support](../chrome-extension/SORA_SUPPORT.md)

### Asset Management
- [Cross-Provider Assets](../CROSS_PROVIDER_ASSETS.md)
- [Asset Roles and Resolver](ASSET_ROLES_AND_RESOLVER.md)
- [Gallery Surfaces](../apps/main/src/lib/gallery/GALLERY_SURFACES.md)

### Prompt System
- [Prompt System Review](PROMPT_SYSTEM_REVIEW.md)
- [Prompt Versioning System](PROMPT_VERSIONING_SYSTEM.md)
- [Semantic Packs Implementation](../SEMANTIC_PACKS_IMPLEMENTATION.md)
- [Prompts Git Features](PROMPTS_GIT_FEATURES.md)

### Character & NPC Systems
- [Character Linkage Conventions](CHARACTER_LINKAGE_CONVENTIONS.md)
- [Character Registry](CHARACTER_REGISTRY.md)
- [NPC Zone Tracking System](NPC_ZONE_TRACKING_SYSTEM.md)

---

## 📋 Task Management

### Claude Tasks (Long-lived Roadmaps)
- [Claude Tasks README](../claude-tasks/README.md) - **START HERE** for task documentation
- [Task Status Update Needed](../claude-tasks/TASK_STATUS_UPDATE_NEEDED.md)
- [Task Tracking Overview](TASK_TRACKING_OVERVIEW.md)
- [Claude UI Tasks](CLAUDE_UI_TASKS.md)
- [Frontend Claude Tasks](FRONTEND_CLAUDE_TASKS.md)

**Task Areas**:
- Generation: Tasks 10, 15, 115-120, 128-131
- Relationships: Tasks 07, 107, 111-112
- Behavior & ECS: Tasks 13, 19-20, 110
- Plugins: Tasks 16, 27, 29, 55
- UI & Panels: Tasks 50, 52, 54, 60, 70, 102
- Editing & HUD: Tasks 100-101, 105-106
- Graph & Templates: Tasks 03, 47, 53
- See [claude-tasks/README.md](../claude-tasks/README.md) for complete index

### Completed Task Summaries
Moved to [docs/archive/task-summaries/](archive/task-summaries/)

---

## 🔧 Configuration & Setup

### Infrastructure
- [Database](DATABASE.md) - Database schema and design
- [Caching Guide](CACHING_GUIDE.md)
- [Port Configuration](PORT_CONFIGURATION.md)
- [Logging Structure](../LOGGING_STRUCTURE.md)
- [Log Filtering and Settings](LOG_FILTERING_AND_SETTINGS.md)

### Scripts & Tools
- [Script Inventory](SCRIPT_INVENTORY.md)
- [Device Agent README](../scripts/DEVICE_AGENT_README.md)
- [Import Accounts Guide](../scripts/IMPORT_ACCOUNTS_GUIDE.md)
- [Create Plugin README](../scripts/create-plugin/README.md)

---

## 📖 Reference Documentation

### Registry & Patterns
- [Registry Patterns](REGISTRY_PATTERNS.md)
- [App Capability Registry](APP_CAPABILITY_REGISTRY.md)
- [Capability Hooks](CAPABILITY_HOOKS.md)
- [Session Helper Reference](SESSION_HELPER_REFERENCE.md)

### Generated Docs
- [Interactions](generated/INTERACTIONS.md)
- [Node Types](generated/NODE_TYPES.md)
- [Session Helpers](generated/SESSION_HELPERS.md)

### Icons & Assets
- [Icons README](../apps/main/src/lib/ICONS_README.md)

---

## 📜 Architecture Decision Records (ADRs)

Located in [docs/decisions/](decisions/):
- [ADR: Backend Plugin Auto-Discovery](decisions/20251121-backend-plugin-auto-discovery.md)
- [ADR: Cross-Provider Asset System](decisions/20251121-cross-provider-asset-system.md)
- [ADR: Extension Architecture](decisions/20251121-extension-architecture.md)
- [ADR: Game Session JSON Conventions](decisions/20251121-game-session-json-conventions.md)
- [ADR: Structured Logging System](decisions/20251121-structured-logging-system.md)
- [ADR: Documentation Lifecycle](decisions/20251122-documentation-lifecycle.md)
- [ADR: Gizmo Architecture](ADR-GIZMO-ARCHITECTURE.md)

---

## 📚 Historical & Archived Documentation

### Archive Overview
- [Archive README](archive/README.md)
- [Completed Refactoring](archive/completed-refactoring/)
- [Actions Archive](archive/actions/)
- [Launcher Archive](archive/launcher/)
- [Old Status Reports](archive/old-status/)
- [Plugin Archive](archive/plugins/)
- [Task Summaries](archive/task-summaries/) - Completed task implementation summaries

### Recent Changes
- [Recent Changes 2025-01](RECENT_CHANGES_2025_01.md)
- [Documentation Changelog](../DOCUMENTATION_CHANGELOG.md)

---

## 🔍 Finding Documentation

### By Topic

**Working with Assets?**
→ Cross-Provider Assets, Gallery Surfaces, Asset Roles

**Building a Plugin?**
→ Plugin Developer Guide, Plugin Reference, Extension Architecture

**Working on Generation?**
→ Dynamic Generation Foundation, Generation Pipeline Refactor

**Building UI?**
→ Frontend Component Guide, Panel Plugins, Overlay Integration

**Working with NPCs/Game?**
→ Gameplay Systems, NPC Persona Architecture, Relationship System

**Setting up Dev Environment?**
→ Development Guide, Backend Getting Started, Setup Docs

### By File Type

- **READMEs**: Component/module overviews (21 files in apps/main/src)
- **Guides**: Step-by-step instructions (*_GUIDE.md)
- **Specs**: Technical specifications (*_SPEC.md)
- **Plans**: Implementation plans (*_PLAN.md)
- **ADRs**: Architecture decisions (docs/decisions/)
- **Tasks**: Long-lived roadmaps (claude-tasks/)

---

## 📝 Documentation Standards

When creating new documentation, follow these conventions:

**System Documentation Naming**:
- `SYSTEM_NAME.md` - Main guide
- `SYSTEM_NAME_ARCHITECTURE.md` - Architecture details
- `SYSTEM_NAME_GUIDE.md` - Developer guide
- `SYSTEM_NAME_REFERENCE.md` - API/usage reference

**Component Documentation**:
- See [Component Documentation Standards](COMPONENT_DOCUMENTATION_STANDARDS.md) for guidelines
- Use [Component README Template](../apps/main/docs/COMPONENT_README_TEMPLATE.md) for new components
- READMEs for complex components needing context (150+ lines)
- INTEGRATION_GUIDE.md for complex integration scenarios

**Placement**:
- Root: Only essential entry points (README, ARCHITECTURE, DEVELOPMENT_GUIDE)
- docs/: All system documentation
- docs/archive/: Completed/historical work
- claude-tasks/: Multi-phase roadmaps
- apps/main/src/{component}/: Component-specific documentation

**See Also**:
- [Documentation Lifecycle ADR](decisions/20251122-documentation-lifecycle.md)
- [Component Documentation Standards](COMPONENT_DOCUMENTATION_STANDARDS.md)

---

## 🤝 Contributing to Docs

1. Check this index first - don't duplicate existing docs
2. Follow naming conventions above
3. Place in appropriate directory
4. Update this INDEX.md if adding major documentation
5. Archive completed/historical docs to docs/archive/
6. Link from related documentation

---

**Need help?** Check [DEVELOPMENT_GUIDE.md](../DEVELOPMENT_GUIDE.md) or the [Task Tracking Overview](TASK_TRACKING_OVERVIEW.md)
