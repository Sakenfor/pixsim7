# PixSim7 Documentation

Welcome to the PixSim7 documentation! This guide helps you navigate the documentation structure.

---

## 📍 Quick Navigation

### 🚀 **Getting Started** → [getting-started/](./getting-started/)
Setup, configuration, launcher, and initial usage.

### 🏗️ **Infrastructure** → [infrastructure/](./infrastructure/)
Backend architecture, deployment, and operations.

### 📖 **Narrative & Dialogue** → [narrative/](./narrative/)
Complete dialogue and story systems documentation.
- Engine specification and schema
- Interaction authoring guide
- Runtime implementation

### ⚙️ **Action Blocks** → [actions/](./actions/)
Video generation and scene action systems.

### 🎮 **Game Systems** → [game-systems/](./game-systems/)
Game mechanics, graphs, editors, and world design.

### 🎪 **Features** → [features/](./features/)
Feature specifications (intimacy, romance, generation, etc).

### 🔌 **Plugins & Extensibility** → [plugins-and-extensibility/](./plugins-and-extensibility/)
Plugin architecture, capability registry, and extensions.

### 💾 **Database & Logging** → [database-and-logging/](./database-and-logging/)
Database migrations, logging, and monitoring setup.

### 🔐 **Authentication** → [authentication/](./authentication/)
Authentication, security, and device automation.

### 🎨 **Frontend** → [frontend/](./frontend/)
Component system, UI guides, and development practices.

### 📊 **Audits & Analysis** → [audits-and-analysis/](./audits-and-analysis/)
Documentation audits, system analysis, and planning reports.

### 📚 **Reference** → [reference/](./reference/)
API references, technical specifications, and guides.

### 🚶 **Walkthroughs** → [walkthroughs/](./walkthroughs/)
Step-by-step examples and power user guides.

---

### 🏛️ **Legacy Organized Sections**

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

### 🏗️ **Architecture** → [architecture/](./architecture/)
Current architecture, design decisions, and refactoring plans.
**Start here:** [architecture/CURRENT.md](./architecture/CURRENT.md) - Latest architecture snapshot

### 🔧 **Systems** → [systems/](./systems/)
Plugin architecture and AI generation system.

### 📚 **Guides** → [guides/](./guides/)
How-to guides and best practices.

---

## 🗂️ Directory Structure

```
docs/
├── README.md                       # This file
├── APP_MAP.md                      # Canonical system overview
├── repo-map.md                     # Repository structure
├── AGENTS.md                       # Agent guidelines
├── TASK_TRACKING_OVERVIEW.md       # Task status tracking
├── REORGANIZATION_PLAN.md          # Reorganization details
│
├── getting-started/                # 🆕 Initial setup
│   ├── README.md
│   ├── SETUP.md
│   ├── LAUNCHER.md
│   ├── PORT_CONFIGURATION.md
│   └── ADMIN_PANEL.md
│
├── game-systems/                   # 🆕 Game mechanics & design
│   ├── README.md
│   ├── SYSTEM_OVERVIEW.md
│   ├── GRAPH_SYSTEM.md
│   ├── EDITOR_2D_WORLD_LAYOUT_SPEC.md
│   └── ... (9 files)
│
├── features/                       # 🆕 Feature specs
│   ├── README.md
│   ├── INTIMACY_SCENE_COMPOSER.md
│   ├── ROMANCE_PLUGIN.md
│   └── ... (7 files)
│
├── plugins-and-extensibility/      # 🆕 Plugin system
│   ├── README.md
│   ├── PLUGIN_ARCHITECTURE.md
│   ├── PLUGIN_BUNDLE_FORMAT.md
│   └── ... (5 files)
│
├── database-and-logging/           # 🆕 Database & ops
│   ├── README.md
│   ├── DATABASE.md
│   ├── TIMESCALEDB_SETUP.md
│   └── ... (5 files)
│
├── authentication/                 # 🆕 Auth & security
│   ├── README.md
│   ├── PASSWORD_SUPPORT_FOR_AUTO_REFRESH.md
│   ├── ANDROID_LOGIN_AUTOMATION.md
│   └── EXTENSION_FLOWS.md
│
├── frontend/                       # 🆕 UI development
│   ├── README.md
│   ├── FRONTEND_COMPONENT_GUIDE.md
│   ├── MICROFRONTENDS_SETUP.md
│   └── ... (5 files)
│
├── infrastructure/                 # 🆕 Backend architecture
│   ├── README.md
│   ├── BACKEND_ORGANIZATION.md
│   ├── BACKEND_MODERNIZATION.md
│   ├── LAUNCHER_INTEGRATION_TESTING.md
│   └── ... (10 files)
│
├── audits-and-analysis/            # 🆕 Audit reports
│   ├── README.md
│   ├── DOCUMENTATION_AUDIT_REPORT.md
│   ├── DOCUMENTATION_AUDIT_REPORT_ROOT_LEVEL.md
│   └── ... (6 files)
│
├── reference/                      # 🆕 Technical reference
│   ├── README.md
│   ├── CACHING_GUIDE.md
│   ├── event-bus-and-spatial-queries.md
│   └── ... (reference docs)
│
├── walkthroughs/                   # 🆕 Examples & guides
│   ├── README.md
│   └── power-user-simulation.md
│
├── narrative/                      # Dialogue & story systems
│   ├── README.md
│   ├── ENGINE_SPECIFICATION.md
│   └── ...
│
├── actions/                        # Action blocks
│   ├── README.md
│   └── ...
│
├── game/                           # NPCs & interactions
│   ├── README.md
│   └── ...
│
├── stats-and-systems/              # Game mechanics
│   ├── README.md
│   └── ...
│
├── ui/                             # UI systems
│   ├── README.md
│   └── ...
│
├── controls/                       # Control systems
│   ├── README.md
│   └── ...
│
├── prompts/                        # Prompt management
│   ├── README.md
│   └── ...
│
├── comedy-panels/                  # Scene display
│   ├── README.md
│   └── ...
│
├── architecture/                   # Architecture docs
│   ├── CURRENT.md
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
│   └── ...
│
└── archive/                        # Archived docs
    ├── deprecated-narrative/
    ├── deprecated-sessions/
    └── ...
```

---

## 📌 Canonical Docs by Topic

This section points to the authoritative documentation for each major system.

### Audits & Analysis
- **[audits-and-analysis/DOCUMENTATION_AUDIT_REPORT.md](./audits-and-analysis/DOCUMENTATION_AUDIT_REPORT.md)** - Complete audit of 243 docs with categorization
- **[audits-and-analysis/DOCUMENTATION_AUDIT_REPORT_ROOT_LEVEL.md](./audits-and-analysis/DOCUMENTATION_AUDIT_REPORT_ROOT_LEVEL.md)** - **⚠️ HIGH-PRIORITY**: Deep analysis of 118 root-level docs

### Getting Started
- **[getting-started/SETUP.md](./getting-started/SETUP.md)** - Complete setup guide
- **[getting-started/LAUNCHER.md](./getting-started/LAUNCHER.md)** - Launcher usage guide
- **[APP_MAP.md](./APP_MAP.md)** - Canonical system overview

### Architecture & Design
- **[architecture/CURRENT.md](./architecture/CURRENT.md)** - Current architecture state (Dec 2025)
- **[architecture/frontend-backend-boundaries.md](./architecture/frontend-backend-boundaries.md)** - API patterns and boundaries
- **[architecture/spatial-model.md](./architecture/spatial-model.md)** - Spatial positioning system
- **[repo-map.md](./repo-map.md)** - Repository structure and path aliases

### Plugin System & Extensibility
- **[plugins-and-extensibility/PLUGIN_ARCHITECTURE.md](./plugins-and-extensibility/PLUGIN_ARCHITECTURE.md)** - Plugin system overview
- **[plugins-and-extensibility/PLUGIN_BUNDLE_FORMAT.md](./plugins-and-extensibility/PLUGIN_BUNDLE_FORMAT.md)** - Plugin bundle specification
- **[plugins-and-extensibility/APP_CAPABILITY_REGISTRY.md](./plugins-and-extensibility/APP_CAPABILITY_REGISTRY.md)** - Capability registry system
- **[systems/plugins/PLUGIN_DEVELOPER_GUIDE.md](./systems/plugins/PLUGIN_DEVELOPER_GUIDE.md)** - Step-by-step development

### Backend & Infrastructure
- **[infrastructure/BACKEND_ORGANIZATION.md](./infrastructure/BACKEND_ORGANIZATION.md)** - Backend domain organization
- **[infrastructure/backend-domain-map.md](./infrastructure/backend-domain-map.md)** - Backend domain structure
- **[infrastructure/BACKEND_MODERNIZATION.md](./infrastructure/BACKEND_MODERNIZATION.md)** - Refactoring goals
- **[database-and-logging/DATABASE.md](./database-and-logging/DATABASE.md)** - Database migrations guide

### Generation System
- **[systems/generation/overview.md](./systems/generation/overview.md)** - System architecture overview
- **[systems/generation/GENERATION_GUIDE.md](./systems/generation/GENERATION_GUIDE.md)** - Developer guide
- **[systems/generation/APP_MAP_GENERATION.md](./systems/generation/APP_MAP_GENERATION.md)** - Generation pipeline overview
- **[systems/generation/ASSET_ROLES_AND_RESOLVER.md](./systems/generation/ASSET_ROLES_AND_RESOLVER.md)** - Asset roles system

### Game Systems & World Design
- **[game-systems/SYSTEM_OVERVIEW.md](./game-systems/SYSTEM_OVERVIEW.md)** - Game systems overview
- **[game-systems/GRAPH_SYSTEM.md](./game-systems/GRAPH_SYSTEM.md)** - Multi-layer graph architecture
- **[game-systems/EDITOR_2D_WORLD_LAYOUT_SPEC.md](./game-systems/EDITOR_2D_WORLD_LAYOUT_SPEC.md)** - 2D world layout editor design
- **[reference/event-bus-and-spatial-queries.md](./reference/event-bus-and-spatial-queries.md)** - Event/query system

### Narrative & Dialogue
- **[narrative/ENGINE_SPECIFICATION.md](./narrative/ENGINE_SPECIFICATION.md)** - Consolidated narrative engine spec
- **[narrative/ENGINE_USAGE.md](./narrative/ENGINE_USAGE.md)** - Narrative runtime usage
- **[narrative/INTERACTION_AUTHORING_GUIDE.md](./narrative/INTERACTION_AUTHORING_GUIDE.md)** - Interaction creation guide

### Features & Content
- **[features/INTIMACY_SCENE_COMPOSER.md](./features/INTIMACY_SCENE_COMPOSER.md)** - Scene composition system
- **[features/ROMANCE_PLUGIN.md](./features/ROMANCE_PLUGIN.md)** - Romance plugin system
- **[features/SIMULATION_AUTOMATION.md](./features/SIMULATION_AUTOMATION.md)** - Automation API

### Frontend & UI
- **[frontend/FRONTEND_COMPONENT_GUIDE.md](./frontend/FRONTEND_COMPONENT_GUIDE.md)** - Component system and conventions
- **[frontend/MICROFRONTENDS_SETUP.md](./frontend/MICROFRONTENDS_SETUP.md)** - Monorepo workspace setup
- **[ui/GIZMO_SURFACES_AND_DEBUG_DASHBOARDS.md](./ui/GIZMO_SURFACES_AND_DEBUG_DASHBOARDS.md)** - Gizmo system

### Examples & Walkthroughs
- **[walkthroughs/power-user-simulation.md](./walkthroughs/power-user-simulation.md)** - Complete workflow example: "The Harbor District" world

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
