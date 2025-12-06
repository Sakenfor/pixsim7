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

**Target folder structure**:
```
docs/systems/plugins/
  ├── PLUGIN_SYSTEM.md          - Main guide + quickstart
  ├── PLUGIN_ARCHITECTURE.md    - Architecture + loader internals
  ├── PLUGIN_DEVELOPER_GUIDE.md - Building plugins
  ├── PLUGIN_REFERENCE.md       - API reference
  ├── PLUGIN_CATALOG.md         - Available plugins
  └── PLUGIN_WORKSPACE.md       - Workspace plugin specifics

docs/archive/plugins/
  └── [Historical implementation docs]
```

**Files to consolidate/archive**:
- Multiple `PLUGIN_WORKSPACE_*` docs → merge into `docs/systems/plugins/PLUGIN_WORKSPACE.md`
- `PLUGIN_LOADER.md` → merge into `docs/systems/plugins/PLUGIN_ARCHITECTURE.md`
- Root `PLUGIN_SYSTEM.md` duplicate → delete (content merged)
- Implementation completion docs → `docs/archive/plugins/`

**Impact**: Reduce from 19 → 6 files, clearer navigation, single location

---

### 3. Consolidate Generation Documentation (12 files → 5 files) 🎬

**Current state**: 12 files about generation across docs/ and root

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

**Target folder structure**:
```
docs/systems/generation/
  ├── GENERATION_SYSTEM.md       - Overview + architecture
  ├── GENERATION_GUIDE.md        - Usage guide for developers
  ├── GENERATION_CONVENTIONS.md  - Aliases, config patterns
  ├── GENERATION_PLUGINS.md      - Plugin integration points
  └── GENERATION_STATUS.md       - Status integration (from apps/main/docs)

docs/archive/generation/
  ├── refactor-plans/            - Historical refactor plans
  └── evolution/                 - Config evolution history
```

**Impact**: Reduce from 12+ → 5 files, single source of truth, clear organization

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

**Target folder structure**:
```
ARCHITECTURE.md                      - High-level system architecture (stays in root)

docs/architecture/
  ├── ARCHITECTURE_DIAGRAMS.md       - Visual diagrams + explanations
  └── subsystems/
      ├── plugin-architecture.md     - Plugin system architecture
      ├── launcher-architecture.md   - Launcher architecture
      ├── ui-architecture.md         - UI/frontend architecture
      └── npc-architecture.md        - NPC system architecture

docs/archive/architecture/
  ├── simplification-plans/          - Historical simplification plans
  └── evolution/                     - Architecture evolution docs
```

**Files to consolidate**:
- `PLUGIN_SYSTEM_ARCHITECTURE.md` → `docs/architecture/subsystems/plugin-architecture.md`
- `LAUNCHER_ARCHITECTURE.md` → `docs/architecture/subsystems/launcher-architecture.md`
- `EDITABLE_UI_ARCHITECTURE.md` → `docs/architecture/subsystems/ui-architecture.md`
- `NPC_PERSONA_ARCHITECTURE.md` → `docs/architecture/subsystems/npc-architecture.md`
- `EXTENSION_ARCHITECTURE.md` → merge into plugin-architecture.md
- `ARCHITECTURE_SIMPLIFICATION_PLAN.md` → `docs/archive/architecture/simplification-plans/`

**Impact**: Reduce overlap, clearer hierarchy, subsystems organized

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

### Phase 1: Quick Wins ✅ COMPLETED

**Effort**: 1-2 hours | **Owner**: Documentation team | **Status**: ✅ Done

**Acceptance Criteria**:
- [x] 5 TASK summaries moved to docs/archive/task-summaries/
- [x] Component READMEs audited (result: all kept as valuable)
- [x] docs/INDEX.md created with comprehensive navigation
- [x] Root directory reduced from 30 → 26 markdown files
- [x] Changes committed

**Dependencies**: None

---

### Phase 2: Plugin Consolidation

**Effort**: 3-4 hours | **Owner**: Documentation team | **Status**: 🔄 In Progress

**Dependencies**:
- Phase 1 complete
- Familiarity with plugin system architecture

**Tasks**:
- [ ] Create `docs/systems/plugins/` directory
- [ ] Merge plugin docs into 6 consolidated files
- [ ] Update cross-references in codebase
- [ ] Archive superseded docs to `docs/archive/plugins/`
- [ ] Run link validation (check for broken links)
- [ ] Update docs/INDEX.md to reflect new structure
- [ ] Commit changes

**Acceptance Criteria**:
- [ ] Plugin docs reduced from 19 → 6 files
- [ ] All 6 files live in `docs/systems/plugins/`
- [ ] Historical docs archived to `docs/archive/plugins/`
- [ ] No broken links to old locations
- [ ] docs/INDEX.md updated
- [ ] Cross-references in code updated

---

### Phase 3: Generation Consolidation

**Effort**: 2-3 hours | **Owner**: Documentation team + generation experts

**Dependencies**:
- Phase 1 complete
- Understanding of generation pipeline

**Tasks**:
- [ ] Create `docs/systems/generation/` directory
- [ ] Merge generation docs into 5 consolidated files
- [ ] Move `apps/main/docs/generation-status-integration.md` to main docs
- [ ] Update cross-references
- [ ] Archive refactor plans to `docs/archive/generation/refactor-plans/`
- [ ] Run link validation
- [ ] Update docs/INDEX.md
- [ ] Commit changes

**Acceptance Criteria**:
- [ ] Generation docs reduced from 12+ → 5 files
- [ ] All files live in `docs/systems/generation/`
- [ ] Historical plans archived properly
- [ ] No broken links
- [ ] docs/INDEX.md updated

---

### Phase 4: Architecture Cleanup

**Effort**: 2-3 hours | **Owner**: Architecture team

**Dependencies**:
- Phase 1 complete
- Phase 2 complete (plugin architecture)

**Tasks**:
- [ ] Create `docs/architecture/subsystems/` directory
- [ ] Move subsystem architecture docs to new location
- [ ] Consolidate overlapping content
- [ ] Archive simplification plans
- [ ] Update cross-references
- [ ] Run link validation
- [ ] Update docs/INDEX.md
- [ ] Commit changes

**Acceptance Criteria**:
- [ ] Architecture docs reduced from 11 → 4-5 files
- [ ] Subsystem docs organized in `docs/architecture/subsystems/`
- [ ] Root ARCHITECTURE.md remains as entry point
- [ ] Historical plans archived
- [ ] No broken links
- [ ] docs/INDEX.md updated

---

### Phase 5: Component README Audit ✅

**Effort**: 2-3 hours | **Owner**: Component owners + documentation team | **Status**: ✅ Complete (2025-12-06)

**Dependencies**:
- Phase 1 audit results (all READMEs kept)
- Ongoing component development

**Tasks**:
- [x] Review component READMEs for accuracy
- [x] Update outdated information
- [x] Document component documentation standards
- [x] Create template for new component READMEs
- [x] Commit changes

**Acceptance Criteria**:
- [x] All 27 component READMEs reviewed and accurate
- [x] Component README template created (apps/main/docs/COMPONENT_README_TEMPLATE.md)
- [x] Standards documented (docs/COMPONENT_DOCUMENTATION_STANDARDS.md)
- [x] No outdated or incorrect information

**Results**:
- Inventoried 27 component documentation files (not 21 as originally estimated)
- Created comprehensive COMPONENT_DOCUMENTATION_STANDARDS.md (336 lines)
- Created COMPONENT_README_TEMPLATE.md with complete example structure
- Reviewed all component READMEs - most are already well-maintained
- Quality levels: 15 comprehensive (150+ lines), 4 adequate (50-150 lines), 8 minimal (organizational)
- No major issues found - existing documentation is high quality

---

### Link Validation & Index Maintenance

**After each phase**, run these validation steps:

```bash
# Check for broken markdown links (install markdown-link-check if needed)
find . -name "*.md" -not -path "*/node_modules/*" -exec markdown-link-check {} \;

# Or use ripgrep to find references to moved files
rg "PLUGIN_SYSTEM\.md" --type md  # Example for checking old references

# Regenerate documentation inventory
find . -name "*.md" -not -path "*/node_modules/*" -not -path "*/.git/*" | wc -l
```

**Update docs/INDEX.md** to reflect:
- New file locations
- Archived documents
- Updated categories

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

---

## Appendix: Documentation Inventory Tooling

### Regenerating the Inventory

The counts in this plan (427 total files, 19 plugin files, etc.) were generated using these commands:

```bash
# Total documentation count
find . -name "*.md" -not -path "*/node_modules/*" -not -path "*/.git/*" | wc -l

# By category
echo "Claude tasks:" && find ./claude-tasks -name "*.md" 2>/dev/null | wc -l
echo "Active docs/:" && find ./docs -name "*.md" -not -path "*/archive/*" 2>/dev/null | wc -l
echo "Archived:" && find ./docs/archive -name "*.md" 2>/dev/null | wc -l
echo "Root-level:" && find . -maxdepth 1 -name "*.md" 2>/dev/null | wc -l

# Find files by topic (e.g., plugin, generation, architecture)
find ./docs -name "*PLUGIN*.md" -not -path "*/archive/*" | wc -l
find ./docs -name "*GENERATION*.md" -not -path "*/archive/*" | wc -l
find . -maxdepth 2 -name "*ARCHITECTURE*.md" -not -path "*/node_modules/*" | wc -l

# Component READMEs
find ./apps/main/src -name "README.md" | wc -l

# Detailed file sizes
for file in $(find ./apps/main/src -name "README.md"); do
  lines=$(wc -l < "$file" 2>/dev/null || echo 0)
  echo "$lines lines: $file"
done | sort -n
```

### Automated Documentation Audit Script

Consider creating `scripts/docs_audit.sh` for reusable analysis:

```bash
#!/bin/bash
# scripts/docs_audit.sh - Documentation inventory and analysis

set -e

echo "=== Documentation Inventory Report ==="
echo "Generated: $(date)"
echo ""

# Total counts
total=$(find . -name "*.md" -not -path "*/node_modules/*" -not -path "*/.git/*" | wc -l)
echo "Total documentation files: $total"
echo ""

# Category breakdown
echo "## By Category"
echo "Claude tasks: $(find ./claude-tasks -name "*.md" 2>/dev/null | wc -l)"
echo "Active docs/: $(find ./docs -name "*.md" -not -path "*/archive/*" 2>/dev/null | wc -l)"
echo "Archived: $(find ./docs/archive -name "*.md" 2>/dev/null | wc -l)"
echo "Root-level: $(find . -maxdepth 1 -name "*.md" 2>/dev/null | wc -l)"
echo "Component READMEs: $(find ./apps/main/src -name "README.md" | wc -l)"
echo ""

# Topic analysis
echo "## By Topic"
echo "Plugin-related: $(find . -name "*PLUGIN*.md" -not -path "*/node_modules/*" -not -path "*/archive/*" | wc -l)"
echo "Generation-related: $(find . -name "*GENERATION*.md" -not -path "*/node_modules/*" -not -path "*/archive/*" | wc -l)"
echo "Architecture-related: $(find . -name "*ARCHITECTURE*.md" -not -path "*/node_modules/*" -not -path "*/archive/*" | wc -l)"
echo ""

# Size distribution
echo "## Size Distribution (component READMEs)"
find ./apps/main/src -name "README.md" -exec wc -l {} \; | sort -n | awk '{print $1 " lines: " $2}'
echo ""

# Recent changes
echo "## Recently Modified (last 7 days)"
find . -name "*.md" -not -path "*/node_modules/*" -mtime -7 | head -20
echo ""

echo "=== End of Report ==="
```

Usage:
```bash
bash scripts/docs_audit.sh > docs-inventory-$(date +%Y%m%d).txt
```

This provides a reproducible baseline for measuring cleanup progress.
