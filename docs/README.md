# PixSim7 Documentation

Welcome to the PixSim7 documentation! This guide helps you navigate the documentation structure.

---

## 📍 Quick Navigation

### 🏗️ **Architecture** → [architecture/](./architecture/)
Current architecture, design decisions, and refactoring plans.

**Start here:** [architecture/CURRENT.md](./architecture/CURRENT.md) - Latest architecture snapshot with action items

### 📖 **Narrative & Dialogue** → [narrative/](./narrative/)
Complete dialogue and story systems documentation.
- Engine specification and schema
- Interaction authoring guide
- Runtime implementation

### ⚙️ **Action Blocks** → [actions/](./actions/)
Video generation and scene action systems.

### 🎮 **Game Systems** → [game/](./game/)
NPCs, interactions, zones, and relationship mechanics.

### 📊 **Game Mechanics** → [stats-and-systems/](./stats-and-systems/)
Stats, social metrics, and game mechanics systems.

### 🎨 **UI & Display** → [ui/](./ui/)
HUD, overlays, gizmos, and display systems.

### 🎮 **Control Systems** → [controls/](./controls/)
Cube controls and control center systems.

### 💬 **Prompts** → [prompts/](./prompts/)
Prompt versioning, management, and best practices.

### 🎭 **Comic Panels** → [comedy-panels/](./comedy-panels/)
Comic panel display system.

### 📚 **Reference** → [reference/](./reference/)
API references and technical specifications.

### 🔧 **Systems** → [systems/](./systems/)
Plugin architecture and AI generation system.

### 📚 **Guides** → [guides/](./guides/)
How-to guides and best practices.

---

## 🗂️ Directory Structure

```
docs/
├── README.md                       # This file
├── REORGANIZATION_PLAN.md          # Reorganization details
├── DOCUMENTATION_AUDIT_REPORT*.md  # Audit reports
│
├── narrative/                      # 🆕 Dialogue & story systems
│   ├── README.md
│   ├── ENGINE_SPECIFICATION.md     # Consolidated spec
│   ├── ENGINE_USAGE.md
│   ├── RUNTIME.md
│   ├── RUNTIME_MIGRATION.md
│   └── INTERACTION_AUTHORING_GUIDE.md
│
├── actions/                        # 🆕 Action blocks
│   ├── README.md
│   ├── ACTION_BLOCKS_UNIFIED_SYSTEM.md
│   ├── ACTION_BLOCKS_I2I_EXTENSION.md
│   ├── ACTION_ENGINE_USAGE.md
│   └── ACTION_PROMPT_ENGINE_SPEC.md
│
├── game/                           # 🆕 Game systems
│   ├── README.md
│   ├── NPC_INTERACTIVE_ZONES_DESIGN.md
│   ├── NPC_ZONE_TRACKING_SYSTEM.md
│   ├── NPC_RESPONSE_GRAPH_DESIGN.md
│   ├── NPC_RESPONSE_USAGE.md
│   ├── NPC_RESPONSE_VIDEO_INTEGRATION.md
│   ├── INTERACTION_*.md
│   └── RELATIONSHIPS_AND_ARCS.md
│
├── stats-and-systems/              # 🆕 Game mechanics
│   ├── README.md
│   ├── ABSTRACT_STAT_SYSTEM.md
│   ├── STAT_SYSTEM_INTEGRATION_PLAN.md
│   ├── ENTITY_STATS_EXAMPLES.md
│   ├── SOCIAL_METRICS.md
│   └── ...
│
├── ui/                             # 🆕 UI systems
│   ├── README.md
│   ├── HUD_LAYOUT_DESIGNER.md
│   ├── OVERLAY_POSITIONING_SYSTEM.md
│   ├── OVERLAY_DATA_BINDING.md
│   ├── GIZMO_SURFACES_AND_DEBUG_DASHBOARDS.md
│   └── ...
│
├── controls/                       # 🆕 Control systems
│   ├── README.md
│   ├── CONTROL_CUBES.md
│   ├── CUBE_SYSTEM_V2_PLUGIN.md
│   ├── CUBE_SYSTEM_DYNAMIC_REGISTRATION.md
│   └── CONTROL_CENTER_PLUGIN_MIGRATION.md
│
├── prompts/                        # 🆕 Prompt management
│   ├── README.md
│   ├── PROMPT_SYSTEM_REVIEW.md
│   ├── PROMPT_VERSIONING_SYSTEM.md
│   ├── PROMPTS_GIT_FEATURES.md
│   └── SONNET_PROMPT_INJECTION_GUIDE.md
│
├── comedy-panels/                  # 🆕 Scene display
│   ├── README.md
│   └── COMIC_PANELS.md
│
├── reference/                      # 🆕 API references
│   ├── README.md
│   ├── SESSION_HELPER_REFERENCE.md
│   ├── CHARACTER_*.md
│   ├── DYNAMIC_*.md
│   └── NODE_*.md
│
├── architecture/                   # Architecture docs
│   ├── CURRENT.md
│   ├── frontend.md
│   ├── decisions/
│   └── ...
│
├── systems/                        # Domain systems
│   ├── plugins/
│   └── generation/
│
├── backend/                        # Backend docs
│   └── ...
│
├── guides/                         # How-to guides
│   └── registry-patterns.md
│
├── archive/                        # Archived docs
│   ├── deprecated-narrative/
│   ├── deprecated-sessions/
│   ├── deprecated-navigation/
│   └── ...
│
└── reference/                      # Core reference
    ├── APP_MAP.md
    ├── PLUGIN_ARCHITECTURE.md
    ├── repo-map.md
    └── ...
```

---

## 📌 Canonical Docs by Topic

This section points to the authoritative documentation for each major system.

**Audit Reports:**
- [DOCUMENTATION_AUDIT_REPORT.md](./DOCUMENTATION_AUDIT_REPORT.md) - Complete audit of 243 docs with categorization
- [DOCUMENTATION_AUDIT_REPORT_ROOT_LEVEL.md](./DOCUMENTATION_AUDIT_REPORT_ROOT_LEVEL.md) - **⚠️ HIGH-PRIORITY**: Deep analysis of 118 root-level docs identifying content overlaps and consolidation opportunities

### Architecture & Design
- **[architecture/CURRENT.md](./architecture/CURRENT.md)** - Current architecture state (Dec 2025)
- **[architecture/frontend-backend-boundaries.md](./architecture/frontend-backend-boundaries.md)** - API patterns and boundaries
- **[architecture/spatial-model.md](./architecture/spatial-model.md)** - Spatial positioning system
- **[architecture/generic-game-objects.md](./architecture/generic-game-objects.md)** - Entity composition system
- **[architecture/generic-links.md](./architecture/generic-links.md)** - Template/runtime linking
- **[repo-map.md](./repo-map.md)** - Repository structure and path aliases

### Plugin System
- **[PLUGIN_ARCHITECTURE.md](./PLUGIN_ARCHITECTURE.md)** - Plugin system overview (canonical, Dec 14)
- **[PLUGIN_BUNDLE_FORMAT.md](./PLUGIN_BUNDLE_FORMAT.md)** - Plugin bundle specification (Dec 14)
- **[systems/plugins/PLUGIN_DEVELOPER_GUIDE.md](./systems/plugins/PLUGIN_DEVELOPER_GUIDE.md)** - Step-by-step development
- **[systems/plugins/UNIFIED_PLUGIN_SYSTEM.md](./systems/plugins/UNIFIED_PLUGIN_SYSTEM.md)** - Registration patterns

### Generation System
- **[systems/generation/overview.md](./systems/generation/overview.md)** - System architecture overview
- **[systems/generation/GENERATION_GUIDE.md](./systems/generation/GENERATION_GUIDE.md)** - Developer guide
- **[systems/generation/GENERATION_ALIAS_CONVENTIONS.md](./systems/generation/GENERATION_ALIAS_CONVENTIONS.md)** - Naming conventions
- **[systems/generation/provider-capabilities.md](./systems/generation/provider-capabilities.md)** - Provider matrix

### Game Systems
- **[event-bus-and-spatial-queries.md](./event-bus-and-spatial-queries.md)** - Event/query system (Dec 14)
- **[NARRATIVE_ENGINE_USAGE.md](./NARRATIVE_ENGINE_USAGE.md)** - Narrative runtime usage
- **[ACTION_BLOCKS_UNIFIED_SYSTEM.md](./ACTION_BLOCKS_UNIFIED_SYSTEM.md)** - Action system architecture
- **[INTERACTION_AUTHORING_GUIDE.md](./INTERACTION_AUTHORING_GUIDE.md)** - Interaction creation guide

### Backend & Services
- **[backend-domain-map.md](./backend-domain-map.md)** - Backend domain structure (canonical reference)
- **[BACKEND_ORGANIZATION.md](./BACKEND_ORGANIZATION.md)** - Domain organization summary
- **[backend/SERVICES.md](./backend/SERVICES.md)** - Service API reference

### UI & Gameplay
- **[INTIMACY_SCENE_COMPOSER.md](./INTIMACY_SCENE_COMPOSER.md)** - Scene composition system (2269 lines)
- **[COMIC_PANELS.md](./COMIC_PANELS.md)** - Comic panel display system (Dec 14)
- **[power-user-simulation.md](./power-user-simulation.md)** - Complete workflow walkthrough (Dec 14)
- **[GIZMO_SURFACES_AND_DEBUG_DASHBOARDS.md](./GIZMO_SURFACES_AND_DEBUG_DASHBOARDS.md)** - Gizmo system

---

## 🎯 Common Tasks

### I want to understand the current architecture
→ Read [architecture/CURRENT.md](./architecture/CURRENT.md)

### I want to refactor the codebase
→ See **Phases 1-5** in [architecture/CURRENT.md](./architecture/CURRENT.md#migration-action-plan)

### I want to create a plugin
→ Follow [systems/plugins/PLUGIN_DEVELOPER_GUIDE.md](./systems/plugins/PLUGIN_DEVELOPER_GUIDE.md)

### I want to understand the generation system
→ Read [systems/generation/overview.md](./systems/generation/overview.md)

### I want to follow best practices
→ Check [guides/registry-patterns.md](./guides/registry-patterns.md)

---

## 📋 Documentation Standards

### File Naming Conventions

**Current standard:** `lowercase-with-dashes.md`

- ✅ `architecture/frontend.md`
- ✅ `systems/generation/overview.md`
- ❌ `ARCHITECTURE_FRONTEND.md` (legacy)

**INDEX files:** Use `INDEX.md` (uppercase) for navigation indices in each directory.

### Document Structure

Each major directory should have:
1. **INDEX.md** - Navigation guide for that section
2. **README.md** (optional) - Overview of the section
3. Organized subdirectories by topic

### Links

Use relative links within docs:
```markdown
[Architecture](./architecture/CURRENT.md)
[Plugin System](../systems/plugins/architecture.md)
```

---

## 🔄 Recent Reorganization (Dec 2025)

The documentation was recently reorganized for better discoverability:

**Before:** 244 docs, 119 in root folder, scattered across 7+ locations
**After:** Clear hierarchy with navigation indices

**Key changes:**
- Consolidated architecture docs → `architecture/`
- Organized by system → `systems/plugins/`, `systems/generation/`
- Added INDEX.md files for navigation
- Moved guides → `guides/`
- Archived obsolete docs → `archive/`

---

## 🤝 Contributing to Docs

1. Follow the naming conventions (lowercase-with-dashes)
2. Update INDEX.md when adding new docs
3. Use relative links for cross-references
4. Add navigation breadcrumbs at the top of complex docs

---

## 📞 Need Help?

Can't find what you're looking for?

1. Check the INDEX.md in each major directory
2. Search for keywords in the repo
3. Ask in the team chat

---

**Last Updated:** December 2025
