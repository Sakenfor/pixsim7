# Documentation Streamlining Plan

**Date**: 2025-12-06
**Total Documentation Files**: 427
**Goal**: Reduce redundancy and improve discoverability

---

## Executive Summary

The codebase has accumulated **427 documentation files**:
- **132 Claude tasks** (31%) - Long-lived roadmaps
- **151 active docs** (35%) - System documentation
- **44 archived** (10%) - Historical/completed work
- **30 root-level** (7%) - High-level guides
- **70+ component READMEs** (16%) - Scattered throughout code

**Key Issues**:
1. 19 files about plugins with significant overlap
2. 12 files about generation systems
3. 11 files about architecture
4. 5 TASK completion summaries in root (should be archived)
5. 21 component-level READMEs (many empty or outdated)

---

## High-Priority Streamlining (Quick Wins)

### 1. Move Task Completion Summaries to Archive ⚡

**Current location**: Root directory
**Files**:
- `TASK_100_IMPLEMENTATION_SUMMARY.md`
- `TASK_16_COMPLETION_SUMMARY.md`
- `TASK_19_COMPLETION_SUMMARY.md`
- `TASK_43_COMPLETION_SUMMARY.md`
- `TASK_49_IMPLEMENTATION_SUMMARY.md`

**Action**: Move to `docs/archive/task-summaries/`

**Impact**: Cleaner root directory, easier to find active docs

---

### 2. Consolidate Plugin Documentation (19 files → 6 files) 📦

**Current state**: 19 files spread across root and docs/

**Proposed structure**:
```
docs/PLUGIN_SYSTEM.md          - Main guide + quickstart
docs/PLUGIN_ARCHITECTURE.md    - Architecture + loader internals
docs/PLUGIN_DEVELOPER_GUIDE.md - Building plugins
docs/PLUGIN_REFERENCE.md       - API reference
docs/PLUGIN_CATALOG.md         - Available plugins
docs/PLUGIN_WORKSPACE.md       - Workspace plugin specifics
```

**Files to consolidate/archive**:
- Multiple `PLUGIN_WORKSPACE_*` docs → merge into one
- `PLUGIN_LOADER.md` → merge into ARCHITECTURE
- Root `PLUGIN_SYSTEM.md` duplicate → delete
- Implementation completion docs → archive

**Impact**: Reduce from 19 → 6 files, clearer navigation

---

### 3. Consolidate Generation Documentation (12 files → 5 files) 🎬

**Current state**: 12 files about generation across docs/

**Key files**:
- `GENERATION_PIPELINE_REFACTOR_PLAN.md`
- `GENERATION_SERVICE_SPLIT.md`
- `GENERATION_CONFIG_EVOLUTION.md`
- `GENERATION_SYSTEM_ISSUES.md`
- `GENERATION_ALIAS_CONVENTIONS.md`
- `GENERATION_NODE_PLUGIN.md`
- `DYNAMIC_GENERATION_FOUNDATION.md`
- `docs/plans/generation-flow-fixes.md`
- `apps/main/docs/generation-status-integration.md`
- `EXAMPLE_GENERATION_API_SPLIT.md`
- Plus more...

**Proposed structure**:
```
docs/GENERATION_SYSTEM.md       - Overview + architecture
docs/GENERATION_GUIDE.md        - Usage guide for developers
docs/GENERATION_CONVENTIONS.md  - Aliases, config patterns
docs/GENERATION_PLUGINS.md      - Plugin integration points
docs/archive/generation/        - Historical refactor plans
```

**Impact**: Reduce from 12+ → 5 files, single source of truth

---

### 4. Consolidate Architecture Documentation (11 files → 4 files) 🏛️

**Current state**: 11 files with "ARCHITECTURE" in name

**Files**:
- `ARCHITECTURE.md` (root, 36KB)
- `ARCHITECTURE_DIAGRAMS.md` (root, 27KB)
- `ARCHITECTURE_SIMPLIFICATION_PLAN.md` (root, 13KB)
- `EXTENSION_ARCHITECTURE.md`
- `PLUGIN_SYSTEM_ARCHITECTURE.md`
- `LAUNCHER_ARCHITECTURE.md`
- `EDITABLE_UI_ARCHITECTURE.md`
- `NPC_PERSONA_ARCHITECTURE.md`
- Plus archived architecture docs

**Proposed structure**:
```
ARCHITECTURE.md              - High-level system architecture
docs/ARCHITECTURE_DIAGRAMS.md - Visual diagrams + explanations
docs/subsystems/             - Subsystem-specific architecture
  - plugin-architecture.md
  - launcher-architecture.md
  - ui-architecture.md
  - npc-architecture.md
docs/archive/architecture/   - Historical plans
```

**Impact**: Reduce overlap, clearer hierarchy

---

### 5. Audit Component-Level READMEs (21 files) 📁

**Current state**: 21 README.md files in `apps/main/src/`

**Action needed**: Review each for:
- **Empty or placeholder** → Delete
- **Outdated info** → Update or delete
- **Valuable context** → Keep and update
- **Integration guides** → Consider moving to docs/

**Examples to review**:
- `apps/main/src/components/README.md`
- `apps/main/src/components/panels/README.md`
- `apps/main/src/lib/README.md`
- Many subfolder READMEs

**Impact**: Remove noise, keep only valuable component docs

---

## Medium-Priority Improvements

### 6. Organize Root-Level Documentation 📋

**Current root docs** (30 files):
- System overviews (ARCHITECTURE, GAMEPLAY_SYSTEMS, etc.)
- Migration guides (RELATIONSHIP_MIGRATION_GUIDE, VARIANT_B_MIGRATION_PLAN)
- Implementation examples (ENTITY_STATS_EXAMPLES, SEMANTIC_PACKS_IMPLEMENTATION)
- Completion summaries (TASK_*_SUMMARY.md)

**Proposed organization**:
```
# Keep in root (essential entry points):
- README.md
- ARCHITECTURE.md
- DEVELOPMENT_GUIDE.md
- SETUP.md (if exists)

# Move to docs/:
- System guides → docs/systems/
- Migration guides → docs/migrations/
- Examples → docs/examples/
- Completion summaries → docs/archive/
```

**Impact**: Cleaner root, better discoverability

---

### 7. Claude Tasks Organization (132 files) 📝

**Current state**: Good structure with README and index

**Recommendations**:
1. **Archive completed tasks** that are no longer referenced
2. **Consolidate related tasks** that evolved (e.g., relationship tasks 07, 107, 111, 112)
3. **Create summary docs** for task groups:
   - `claude-tasks/areas/RELATIONSHIPS.md` - All relationship tasks
   - `claude-tasks/areas/GENERATION.md` - All generation tasks
   - `claude-tasks/areas/PLUGINS.md` - All plugin tasks

**Keep current structure** but add better cross-references

---

### 8. Create Documentation Index 🗂️

**New file**: `docs/INDEX.md`

Categorized index of all documentation:
```markdown
# Documentation Index

## Getting Started
- README.md - Project overview
- DEVELOPMENT_GUIDE.md - Setup and workflows
- docs/SYSTEM_OVERVIEW.md - Architecture overview

## Core Systems
- [Architecture](ARCHITECTURE.md)
- [Plugin System](docs/PLUGIN_SYSTEM.md)
- [Generation Pipeline](docs/GENERATION_SYSTEM.md)
- [Relationship System](docs/RELATIONSHIPS_AND_ARCS.md)
...

## Developer Guides
- [Frontend Components](docs/frontend/COMPONENTS.md)
- [Backend Services](docs/backend/SERVICES.md)
- [Plugin Development](docs/PLUGIN_DEVELOPER_GUIDE.md)
...

## Task Tracking
- [Claude Tasks](claude-tasks/README.md)
- [Task Status Overview](claude-tasks/TASK_STATUS_UPDATE_NEEDED.md)
```

---

## Documentation Standards (Going Forward)

### Naming Conventions

```
# System documentation:
SYSTEM_NAME.md              - Main guide (user-facing)
SYSTEM_NAME_ARCHITECTURE.md - Architecture details (technical)
SYSTEM_NAME_GUIDE.md        - Developer guide
SYSTEM_NAME_REFERENCE.md    - API/usage reference

# Task documentation:
claude-tasks/NNN-brief-name.md

# Component documentation:
src/path/to/component/README.md (only if substantial)

# Archived documentation:
docs/archive/category/ORIGINAL_NAME.md
```

### File Placement Rules

1. **Root directory**: Only essential entry points (README, ARCHITECTURE, DEVELOPMENT_GUIDE)
2. **docs/**: All system documentation, guides, references
3. **docs/archive/**: Completed work, historical plans, outdated info
4. **claude-tasks/**: Long-lived roadmaps and multi-phase work
5. **Component READMEs**: Only for complex components needing context

### When to Archive

Archive documentation when:
- Work is complete and implementation is stable
- Document describes a migration that's finished
- Historical context is valuable but not actively used
- Multiple newer docs supersede it

---

## Implementation Plan

### Phase 1: Quick Wins (1-2 hours)
- [ ] Move TASK_*_SUMMARY.md to docs/archive/task-summaries/
- [ ] Delete empty component READMEs
- [ ] Create docs/INDEX.md

### Phase 2: Plugin Consolidation (3-4 hours)
- [ ] Merge plugin docs as described
- [ ] Update cross-references
- [ ] Archive superseded docs

### Phase 3: Generation Consolidation (2-3 hours)
- [ ] Merge generation docs
- [ ] Create clear guide structure
- [ ] Archive refactor plans

### Phase 4: Architecture Cleanup (2-3 hours)
- [ ] Consolidate architecture docs
- [ ] Create subsystem architecture folder
- [ ] Update diagrams doc

### Phase 5: Component README Audit (2-3 hours)
- [ ] Review all 21 component READMEs
- [ ] Update, merge, or delete as appropriate
- [ ] Document component documentation standards

---

## Success Metrics

- **Reduce total docs**: 427 → ~300 files (30% reduction)
- **Consolidate overlapping areas**: Plugin (19→6), Generation (12→5), Architecture (11→4)
- **Improve discoverability**: Single index, clear categories
- **Reduce root clutter**: 30 → ~5 essential files
- **Archive historical**: Move ~50 completed/outdated docs to archive

---

## Notes

This plan builds on the previous `DOCUMENTATION_CLEANUP_PLAN.md` (Nov 2025) which identified similar issues. Some cleanup was done (obsolete UI analysis files removed), but significant opportunities remain.

The focus is on **consolidation without loss** - merge overlapping docs, archive completed work, but preserve valuable historical context and implementation details.
