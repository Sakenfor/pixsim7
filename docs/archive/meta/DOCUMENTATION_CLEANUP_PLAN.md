# Documentation Cleanup Plan

**Date**: 2025-11-19
**Status**: Analysis Complete

---

## Summary

Found significant documentation redundancy across the codebase:
- **5 UI analysis files** created during consolidation (4 now obsolete)
- **9 Launcher architecture docs** with overlapping content (~93K)
- **12 Plugin system docs** with duplicates (~170K)
- **8 Action system docs** with multiple "complete" files (~89K)
- **1 temp debug file** (540 lines)

**Total redundant docs**: ~35+ files, ~350K+ of documentation

---

## High Priority - Immediate Cleanup

### 1. Obsolete UI Analysis Files (DELETE ALL 4)

**Created**: During UI consolidation analysis
**Status**: Now obsolete - work is complete

Files to DELETE:
- ❌ `UI_STRUCTURE_ANALYSIS.md` (468 lines)
  - Pre-consolidation analysis, now outdated
  - Says Toast is duplicated (fixed)

- ❌ `UI_FILE_TREE_REFERENCE.txt` (410 lines)
  - Complete file tree dump, not needed

- ❌ `UI_CRITICAL_FILES.txt` (299 lines)
  - Action items all completed
  - Contains outdated information

- ❌ `UI_CONSOLIDATION_SUMMARY.md` (267 lines)
  - Pre-consolidation roadmap, superseded by COMPLETED doc

Files to KEEP:
- ✅ `UI_CONSOLIDATION_COMPLETED.md` (184 lines)
  - Current, accurate completion report
  - Authoritative record of work done

**Impact**: Remove 1,444 lines of obsolete analysis

---

### 2. Temp Debug Files (DELETE)

- ❌ `temp_sceneplayer_head_tail.txt` (540 lines)
  - Code dump for debugging
  - No longer needed

**Impact**: Remove 540 lines

---

## Medium Priority - Documentation Consolidation

### 3. Launcher Documentation (9 files → 3-4 files)

**Current files**:
```
LAUNCHER.md (4.5K) - Basic guide
LAUNCHER_STARTUP_GUIDE.md (4.5K) - Getting started
LAUNCHER_ANALYSIS_INDEX.md (9.4K) - Overview/index
LAUNCHER_ARCHITECTURE_ANALYSIS.md (19K) - Deep analysis
LAUNCHER_ARCHITECTURE_EVOLUTION.md (13K) - History
LAUNCHER_ARCHITECTURE_SUMMARY.md (11K) - Summary
LAUNCHER_DECOUPLING_STRATEGY.md (24K) - Strategy doc
LAUNCHER_INTEGRATION_TESTING.md (7.3K) - Testing
LAUNCHER_UI_REORGANIZATION.md (1.7K) - UI reorg
```

**Proposed consolidation**:
```
LAUNCHER.md - Main guide (merge LAUNCHER + STARTUP_GUIDE)
LAUNCHER_ARCHITECTURE.md - Architecture (merge ANALYSIS + SUMMARY + EVOLUTION)
LAUNCHER_TESTING.md - Testing guide (keep as-is)
Archive:
  - LAUNCHER_DECOUPLING_STRATEGY.md → docs/archive/ (completed work)
  - LAUNCHER_UI_REORGANIZATION.md → docs/archive/ (completed work)
  - LAUNCHER_ANALYSIS_INDEX.md → delete (superseded)
```

**Impact**: 9 files → 3 files + 2 archived

---

### 4. Plugin System Documentation (12 files → 5-6 files)

**Current files**:
```
Root:
  systems/plugins/PLUGIN_SYSTEM.md (28K) - Comprehensive guide
  PLUGIN_METADATA_IMPLEMENTATION.md (7.7K) - Implementation

docs/:
  systems/plugins/PLUGIN_SYSTEM.md (9.1K) - DUPLICATE basic guide
  PLUGIN_SYSTEM_ARCHITECTURE.md (12K) - Architecture
  PLUGIN_DEVELOPER_GUIDE.md (11K) - Dev guide
  PLUGIN_REFERENCE.md (22K) - API reference
  PLUGIN_LOADER.md (19K) - Loader implementation
  PLUGIN_CATALOG.md (13K) - Plugin catalog
  PLUGIN_WORKSPACE.md (9.7K) - Workspace plugin
  PLUGIN_WORKSPACE_COMPLETE_SUMMARY.md (17K) - Workspace summary
  PLUGIN_WORKSPACE_IMPLEMENTATION.md (12K) - Implementation
  PLUGIN_WORKSPACE_PHASES_3_5.md (16K) - Phase docs
```

**Issues**:
- Two `PLUGIN_SYSTEM.md` files (root vs docs/)
- Multiple workspace docs with overlap
- Architecture spread across multiple files

**Proposed consolidation**:
```
Keep in docs/:
  PLUGIN_SYSTEM.md - Main guide (merge root + docs versions)
  PLUGIN_ARCHITECTURE.md - Architecture (merge SYSTEM_ARCHITECTURE + LOADER)
  PLUGIN_DEVELOPER_GUIDE.md - Dev guide (keep)
  PLUGIN_REFERENCE.md - API reference (keep)
  PLUGIN_CATALOG.md - Plugin catalog (keep)
  PLUGIN_WORKSPACE.md - Workspace guide (merge all workspace docs)

Delete:
  Root: PLUGIN_SYSTEM.md (duplicate)
  Root: PLUGIN_METADATA_IMPLEMENTATION.md (merge into main)
  docs/PLUGIN_WORKSPACE_COMPLETE_SUMMARY.md (merge)
  docs/PLUGIN_WORKSPACE_IMPLEMENTATION.md (merge)
  docs/PLUGIN_WORKSPACE_PHASES_3_5.md (merge or archive)
```

**Impact**: 12 files → 6 files

---

### 5. Action System Documentation (8 files → 3-4 files)

**Current files**:
```
Root:
  ACTION_BLOCKS_IMPLEMENTATION_COMPLETE.md (8.7K)

docs/:
  ACTION_BLOCKS_CONCEPT_DISCOVERY.md (19K)
  ACTION_BLOCKS_UNIFIED_SYSTEM.md (16K)
  ACTION_BLOCK_GENERATION_GUIDE.md (8.3K)
  ACTION_ENGINE_SESSION_RESUME.md (5.7K)
  ACTION_ENGINE_USAGE.md (15K)
  ACTION_GENERATION_SYSTEM_COMPLETE.md (7.1K)
  ACTION_PROMPT_ENGINE_SPEC.md (9.7K)
```

**Issues**:
- Two "COMPLETE" docs
- Overlapping content between UNIFIED_SYSTEM and USAGE

**Proposed consolidation**:
```
Keep in docs/:
  ACTION_SYSTEM.md - Main guide (merge UNIFIED_SYSTEM + USAGE + COMPLETE docs)
  ACTION_GENERATION_GUIDE.md - Generation guide (GENERATION_GUIDE + PROMPT_ENGINE)
  ACTION_ENGINE_USAGE.md - Usage reference (keep)

Archive:
  ACTION_BLOCKS_CONCEPT_DISCOVERY.md → docs/archive/ (discovery doc)

Delete:
  Root: ACTION_BLOCKS_IMPLEMENTATION_COMPLETE.md (merge)
  docs/ACTION_BLOCKS_UNIFIED_SYSTEM.md (merge)
  docs/ACTION_GENERATION_SYSTEM_COMPLETE.md (merge)
```

**Impact**: 8 files → 3 files + 1 archived

---

## Low Priority - Consider Later

### Duplicate Root-Level Architecture Docs

Multiple architecture docs in root that might overlap with docs/ folder:
- ARCHITECTURE.md
- ARCHITECTURE_DIAGRAMS.md
- ARCHITECTURE_SIMPLIFICATION_PLAN.md
- OPUS_REDESIGN_BRIEF.md

**Action**: Review for consolidation in future cleanup

---

## Summary of Immediate Actions

### Files to DELETE immediately:
1. ❌ `UI_STRUCTURE_ANALYSIS.md`
2. ❌ `UI_FILE_TREE_REFERENCE.txt`
3. ❌ `UI_CRITICAL_FILES.txt`
4. ❌ `UI_CONSOLIDATION_SUMMARY.md`
5. ❌ `temp_sceneplayer_head_tail.txt`

**Total removed**: ~2,000 lines of obsolete documentation

### Impact:
- Cleaner repository
- Less confusion about current state
- Single source of truth for UI consolidation work
- Easier to find relevant docs

---

## Recommendation

**Immediate**: Delete the 5 obsolete files listed above
**Short-term**: Consider consolidating Launcher, Plugin, and Action docs
**Long-term**: Establish documentation standards to prevent future duplication

---

## Documentation Standards (Proposed)

To prevent future duplication:

1. **Single source of truth**: One primary doc per system
2. **Archive completed work**: Move implementation/planning docs to docs/archive/
3. **Clear naming**:
   - `SYSTEM.md` - Main guide
   - `SYSTEM_ARCHITECTURE.md` - Architecture details
   - `SYSTEM_REFERENCE.md` - API/usage reference
4. **No root-level completion reports**: Put in docs/ or archive
5. **No temp files in git**: Use .gitignore for debugging artifacts
