# PixSim7 Documentation

Welcome to the PixSim7 documentation! This guide helps you navigate the documentation structure.

---

## 📍 Quick Navigation

### 🏗️ **Architecture** → [architecture/](./architecture/)
Current architecture, design decisions, and refactoring plans.

**Start here:** [architecture/CURRENT.md](./architecture/CURRENT.md) - Latest architecture snapshot with action items

- Current architecture state
- Import patterns and module structure
- **Refactoring action plan (Phases 1-5)**
- Feature boundaries and coupling analysis
- Registry standardization

### 🔧 **Systems** → [systems/](./systems/)
Domain-specific system documentation.

#### **Plugins** → [systems/plugins/](./systems/plugins/)
Plugin system architecture and development guides.
- Plugin types and registration
- Extension points
- Development workflow

#### **Generation** → [systems/generation/](./systems/generation/)
AI generation system (images, videos, audio).
- Provider abstraction
- Job management
- Status tracking

#### **Game** → [systems/game/](./systems/game/) *(planned)*
Game runtime, NPCs, behaviors, interactions.

#### **UI** → [systems/ui/](./systems/ui/) *(planned)*
UI components, panels, HUD system.

### 📚 **Guides** → [guides/](./guides/)
How-to guides and best practices.

- [guides/registry-patterns.md](./guides/registry-patterns.md) - Registry pattern migration guide

### 📖 **Reference** → [reference/](./reference/) *(planned)*
API references and technical specifications.

---

## 🗂️ Directory Structure

```
docs/
├── README.md                    # This file - navigation guide
│
├── architecture/                # Architecture documentation
│   ├── INDEX.md                # Architecture navigation
│   ├── CURRENT.md              # Latest architecture (Dec 2025)
│   ├── frontend.md             # Frontend architecture
│   ├── plugins.md              # Plugin architecture (ADR)
│   ├── decisions/              # Architecture Decision Records
│   ├── subsystems/             # Subsystem architectures
│   └── historical/             # Previous architecture versions
│
├── systems/                    # Domain-specific systems
│   ├── plugins/               # Plugin system
│   │   ├── INDEX.md
│   │   ├── architecture.md
│   │   └── reference.md
│   │
│   ├── generation/            # AI generation system
│   │   ├── INDEX.md
│   │   ├── overview.md
│   │   └── provider-*.md
│   │
│   ├── game/                  # Game systems
│   └── ui/                    # UI systems
│
├── guides/                     # How-to guides
│   └── registry-patterns.md
│
├── reference/                  # API references
│
└── archive/                    # Archived/obsolete docs
    ├── completed-tasks/
    └── old-designs/
```

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
