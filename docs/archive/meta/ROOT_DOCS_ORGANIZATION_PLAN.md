# Root Directory Documentation Organization

**Date**: 2025-12-06

## Current State

25 markdown files in repository root - far too many for easy navigation.

## Organization Plan

### KEEP IN ROOT (5 Essential Entry Points)

These are the only docs that should remain in root:

1. **README.md** (425 lines) - Project overview and quick start
2. **ARCHITECTURE.md** (952 lines) - High-level system architecture
3. **ARCHITECTURE_DIAGRAMS.md** (349 lines) - Visual architecture diagrams
4. **DEVELOPMENT_GUIDE.md** (800 lines) - Development setup and workflows
5. **AI_README.md** (575 lines) - AI assistant guide (essential for AI context)

**Rationale**: These 5 files provide the complete entry point for new developers and AI assistants.

### MOVE TO docs/ (13 System Documentation Files)

Active system documentation that belongs in docs/ directory:

1. **ABSTRACT_STAT_SYSTEM.md** (422 lines) → docs/
2. **AGENTS.md** (143 lines) → docs/
3. **CROSS_PROVIDER_ASSETS.md** (539 lines) → docs/
4. **DYNAMIC_NODE_TYPES.md** (310 lines) → docs/
5. **ENTITY_STATS_EXAMPLES.md** (591 lines) → docs/
6. **GAMEPLAY_SYSTEMS.md** (372 lines) → docs/
7. **GRAPH_RENDERER_PLUGINS.md** (494 lines) → docs/
8. **HUD_LAYOUT_DESIGNER.md** (373 lines) → docs/
9. **LOGGING_STRUCTURE.md** (634 lines) → docs/
10. **RELATIONSHIP_MIGRATION_GUIDE.md** (528 lines) → docs/
11. **SEMANTIC_PACKS_IMPLEMENTATION.md** (258 lines) → docs/
12. **STAT_SYSTEM_INTEGRATION_PLAN.md** (608 lines) → docs/
13. **WORLD_SESSIONS_ISSUES.md** (1388 lines) → docs/

**Rationale**: System guides belong in organized docs/ directory, not root.

### MOVE TO docs/archive/meta/ (4 Documentation Meta Files)

Documentation about documentation:

1. **CONSOLIDATION_SESSION_SUMMARY.md** (225 lines)
2. **DOCUMENTATION_CHANGELOG.md** (635 lines)
3. **DOCUMENTATION_CLEANUP_PLAN.md** (235 lines)
4. **DOCUMENTATION_STREAMLINING_PLAN.md** (543 lines)

**Rationale**: Meta-documentation about the documentation process itself.

### MOVE TO docs/archive/completed/ (3 Completed Work Files)

Historical completed work:

1. **OPUS_REDESIGN_BRIEF.md** (195 lines) - Design brief (completed)
2. **UI_CONSOLIDATION_COMPLETED.md** (184 lines) - Completed consolidation
3. **VARIANT_B_MIGRATION_PLAN.md** (161 lines) - Completed migration

**Rationale**: These represent completed work and should be archived.

## Impact

**Before**: 25 markdown files in root
**After**: 5 markdown files in root (80% reduction)

**Benefits**:
- Clean root directory with only essential entry points
- System documentation organized in docs/
- Historical/meta docs properly archived
- Easier for new developers to find what they need
- Follows established documentation standards

## Implementation Steps

1. Create docs/archive/meta/ directory
2. Move system docs to docs/
3. Move meta docs to docs/archive/meta/
4. Move completed work to docs/archive/completed/
5. Update docs/INDEX.md with new locations
6. Update cross-references in moved files
7. Commit changes

## Files Staying in Root

```
/
├── README.md                    # Project overview
├── ARCHITECTURE.md              # System architecture
├── ARCHITECTURE_DIAGRAMS.md     # Visual diagrams
├── DEVELOPMENT_GUIDE.md         # Development setup
├── AI_README.md                 # AI assistant guide
└── docs/                        # All other documentation
```

Clean, minimal, and focused on entry points only.
