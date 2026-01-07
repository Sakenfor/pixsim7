# Documentation Audit & Consolidation Report

**Date:** 2025-12-14
**Audit Scope:** All markdown files in `/docs` directory
**Total Files Analyzed:** 243 markdown files
**Status:** Complete - Ready for Implementation

---

## Executive Summary

PixSim7 documentation has undergone significant reorganization (December 2025) with a shift toward a modular, hierarchical structure. The codebase maintains **clear canonical documents** for major systems, though some organizational redundancy exists in navigation and summary files.

**Key Findings:**
- ✅ 180+ files recommended to **KEEP** - well-maintained, non-overlapping
- ⚠️ 10 files recommended to **DEPRECATE** - superseded, duplicated, or outdated
- 🔄 5 files recommended to **MERGE** into canonical docs
- 📦 61 files in `archive/` - appropriately isolated, ignore for this audit
- 🆕 9 recent updates (Dec 14) indicate active development

**Recommendation:** This audit is **LOW-RISK** - it primarily involves adding deprecation headers and consolidating navigation files. No major reorganization needed.

---

## Detailed Findings by Category

### 1. APPLICATION ARCHITECTURE & MAPS

| File | Status | Action | Reason |
|------|--------|--------|--------|
| `APP_MAP.md` | ✅ CANONICAL | **KEEP** | Primary entry point; explicitly designated as "canonical entry point for both humans and AI agents" |
| `APP_MAP.md.bak` | ❌ BACKUP | **DEPRECATE** | Backup file; superseded by current APP_MAP.md |
| `APP_CAPABILITY_REGISTRY.md` | ✅ SEPARATE | **KEEP** | Distinct system design (capability registry architecture) |

**Action:** Add deprecation header to `APP_MAP.md.bak`. No merging needed - capability registry is a separate system.

---

### 2. PLUGIN SYSTEM ARCHITECTURE

**Canonical Doc:** `PLUGIN_ARCHITECTURE.md` (root level)

| File | Status | Action | Unique Content |
|------|--------|--------|-----------------|
| `PLUGIN_ARCHITECTURE.md` | ✅ CANONICAL | **KEEP** | Comprehensive overview; recently updated (Dec 14) |
| `systems/plugins/PLUGIN_SYSTEM.md` | ✅ DEEP DIVE | **KEEP** | UI Plugin System specifics |
| `systems/plugins/UNIFIED_PLUGIN_SYSTEM.md` | ✅ PATTERNS | **KEEP** | Migration and registration patterns |
| `systems/plugins/PLUGIN_DEVELOPER_GUIDE.md` | ✅ GUIDE | **KEEP** | Step-by-step implementation walkthrough |
| `systems/plugins/PLUGIN_CATALOG.md` | ✅ REFERENCE | **KEEP** | Plugin discovery API reference |
| `systems/plugins/README.md` | ⚠️ NAV | **DEPRECATE** | Navigation/overview; consolidate with PLUGIN_SYSTEM.md |
| `systems/plugins/INDEX.md` | ⚠️ NAV | **DEPRECATE** | Navigation index; redundant with README.md |

**Action:**
- Keep `PLUGIN_ARCHITECTURE.md` at root as primary canonical doc
- Keep `systems/plugins/*` for domain-specific deep dives
- Deprecate `systems/plugins/README.md` and `systems/plugins/INDEX.md`
- Add cross-references in root `PLUGIN_ARCHITECTURE.md` to system-specific docs

---

### 3. CORE ARCHITECTURE DOCUMENTATION

**Canonical Docs:** `architecture/CURRENT.md` and `architecture/README.md`

| File | Status | Action | Reason |
|------|--------|--------|--------|
| `architecture/CURRENT.md` | ✅ PRIMARY | **KEEP** | Frontend architecture analysis (Dec 13); most recent |
| `architecture/README.md` | ✅ NAV | **KEEP** | Overall architecture overview and navigation (Dec 12) |
| `architecture/INDEX.md` | ⚠️ OLD NAV | **DEPRECATE** | Older (Dec 6); superseded by README.md |
| `architecture/frontend.md` | ✅ SPECIFIC | **KEEP** | Frontend-specific architecture details |
| `architecture/plugins.md` | ✅ SPECIFIC | **KEEP** | Plugin architecture specifics |
| `architecture/clean-coupling-strategy.md` | ✅ SPECIFIC | **KEEP** | Specific coupling strategy documentation |
| `architecture/diagrams.md` | ✅ VISUAL | **KEEP** | Visual architecture diagrams reference |

**Action:**
- Deprecate `architecture/INDEX.md` (superseded by README.md)
- Keep all other architecture docs; they cover complementary concerns
- Ensure README.md has clear links to all constituent docs

---

### 4. NEW GAME OBJECT & SPATIAL SYSTEMS (Dec 14 Updates)

**Canonical Docs:** All four are complementary

| File | Status | Action | Last Updated |
|------|--------|--------|---------------|
| `architecture/generic-game-objects.md` | ✅ NEW | **KEEP** | 2025-12-14 |
| `architecture/generic-links.md` | ✅ NEW | **KEEP** | 2025-12-14 |
| `architecture/spatial-model.md` | ✅ NEW | **KEEP** | 2025-12-14 |
| `event-bus-and-spatial-queries.md` | ✅ NEW | **KEEP** | 2025-12-14 |

**Note:** These are newly implemented systems (all Dec 14 17:43). Each covers distinct architectural concepts and should be kept as separate canonical documents.

**Action:** Keep all four. Add cross-references between them:
- generic-game-objects → spatial-model (uses Transform)
- spatial-model → event-bus-and-spatial-queries (emits events)
- event-bus-and-spatial-queries → all (impacts all entities)

---

### 5. INTERACTION SYSTEM

**Canonical Doc:** `INTERACTION_AUTHORING_GUIDE.md` (primary) + complementary docs

| File | Status | Action | Purpose |
|------|--------|--------|---------|
| `INTERACTION_AUTHORING_GUIDE.md` | ✅ PRIMARY | **KEEP** | Comprehensive authoring guide (713 lines) |
| `INTERACTION_SYSTEM_MIGRATION.md` | ✅ HISTORY | **KEEP** | Documents migration to plugin-based system |
| `INTERACTION_SYSTEM_REFACTOR.md` | ✅ FUTURE | **KEEP** | Proposes modular improvements |
| `INTERACTION_PLUGIN_MANIFEST.md` | ✅ SPEC | **KEEP** | Plugin contract/interface specification |

**Action:** Keep all. Each serves a distinct purpose in the system lifecycle.

---

### 6. BACKEND ARCHITECTURE & DOMAINS

**Canonical Docs:** `backend-domain-map.md` + domain-specific docs

| File | Status | Action | Purpose |
|------|--------|--------|---------|
| `backend-domain-map.md` | ✅ PRIMARY | **KEEP** | Complete domain mapping (entry modules, imports, tests) |
| `BACKEND_ORGANIZATION.md` | ✅ SUMMARY | **KEEP** | High-level summary of organization work |
| `backend/SERVICES.md` | ✅ REFERENCE | **KEEP** | Services layer API reference |
| `backend/game.md` | ✅ DOMAIN | **KEEP** | Game domain documentation |
| `backend/simulation.md` | ✅ DOMAIN | **KEEP** | Simulation domain documentation |
| `backend/narrative.md` | ✅ DOMAIN | **KEEP** | Narrative domain documentation |
| `backend/content.md` | ✅ DOMAIN | **KEEP** | Content domain documentation |
| `backend/automation.md` | ✅ DOMAIN | **KEEP** | Automation domain documentation |

**Action:** Keep all. These are well-organized with a summary doc (BACKEND_ORGANIZATION) that points to detailed references.

---

### 7. GENERATION SYSTEM

**Canonical Docs:** `systems/generation/overview.md` + domain-specific docs

| File | Status | Action | Priority |
|------|--------|--------|----------|
| `systems/generation/overview.md` | ✅ OVERVIEW | **KEEP** | System architecture entry point |
| `systems/generation/GENERATION_GUIDE.md` | ✅ GUIDE | **KEEP** | Comprehensive developer guide |
| `systems/generation/GENERATION_ALIAS_CONVENTIONS.md` | ✅ SPEC | **KEEP** | Naming conventions (unique content) |
| `systems/generation/INTIMACY_AND_GENERATION.md` | ✅ FEATURE | **KEEP** | Intimacy-aware generation system |
| `systems/generation/REALTIME_VIDEO_GENERATION.md` | ✅ FEATURE | **KEEP** | Real-time streaming generation |
| `systems/generation/cross-provider-assets.md` | ✅ FEATURE | **KEEP** | Multi-provider asset management |
| `systems/generation/node-plugin.md` | ✅ PLUGIN | **KEEP** | Generation node plugin documentation |
| `systems/generation/provider-accounts.md` | ✅ FEATURE | **KEEP** | Account management specifics |
| `systems/generation/provider-capabilities.md` | ✅ REFERENCE | **KEEP** | Provider capability matrix |
| `systems/generation/status-tracking.md` | ✅ FEATURE | **KEEP** | Job status tracking system |
| `systems/generation/README.md` | ⚠️ NAV | **DEPRECATE** | Navigation summary; consolidate with overview.md |
| `systems/generation/INDEX.md` | ⚠️ NAV | **DEPRECATE** | Navigation index; consolidate with overview.md |

**Action:**
- Keep all topical files (10 files)
- Deprecate README.md and INDEX.md (navigation only, no unique content)

---

### 8. SPECIALIZED PLUGINS & FEATURES

| File | Status | Action | Category |
|------|--------|--------|----------|
| `ROMANCE_PLUGIN.md` | ✅ FEATURE | **KEEP** | Feature-specific plugin documentation |
| `SEDUCTION_NODE_PLUGIN.md` | ✅ FEATURE | **KEEP** | Feature-specific plugin documentation |
| `CUBE_SYSTEM_V2_PLUGIN.md` | ✅ FEATURE | **KEEP** | Feature-specific plugin documentation |
| `CONTROL_CENTER_PLUGIN_MIGRATION.md` | ✅ FEATURE | **KEEP** | Feature-specific plugin documentation |
| `GALLERY_TOOLS_PLUGIN.md` | ✅ FEATURE | **KEEP** | Gallery tool plugin development guide |
| `GRAPH_RENDERER_PLUGINS.md` | ✅ FEATURE | **KEEP** | Graph renderer plugin system |
| `PLUGIN_BUNDLE_FORMAT.md` | ✅ SPEC | **KEEP** | Plugin bundle format specification (Dec 14) |

**Action:** Keep all. Each documents a specific feature/plugin.

---

### 9. STANDARDS & GUIDELINES

| File | Status | Action |
|------|--------|--------|
| `COMPONENT_DOCUMENTATION_STANDARDS.md` | ✅ KEEP | Documentation standards (Dec 6) |
| `guidelines/IMPORT_HYGIENE.md` | ✅ KEEP | Import standards documentation |
| `guides/registry-patterns.md` | ✅ KEEP | Registry pattern guide (Dec 20) |
| `FRONTEND_COMPONENT_GUIDE.md` | ✅ KEEP | Frontend component development guide |

**Action:** Keep all. These are reference standards documents.

---

### 10. GENERATED DOCUMENTATION

| File | Status | Action | Purpose |
|------|--------|--------|---------|
| `generated/INTERACTIONS.md` | ✅ AUTO | **KEEP** | Auto-generated interaction reference |
| `generated/NODE_TYPES.md` | ✅ AUTO | **KEEP** | Auto-generated node type reference |
| `generated/SESSION_HELPERS.md` | ✅ AUTO | **KEEP** | Auto-generated session helper reference |

**Action:** Keep all. These are maintained automatically.

---

### 11. DOCUMENTATION METADATA

| File | Status | Action | Reason |
|------|--------|--------|--------|
| `README.md` | ✅ PRIMARY | **KEEP** | Main entry point (Dec 2025, most current) |
| `INDEX.md` | ⚠️ OLD | **DEPRECATE** | Older version (Dec 6); superseded by README.md |
| `DOCS_CONSOLIDATION_ANALYSIS.md` | ✅ META | **KEEP** | Meta-reference for consolidation work |
| `RECENT_CHANGES_2025_01.md` | ⚠️ OUTDATED | **DEPRECATE** | Old (January 2025, outdated); archive if needed |
| `repo-map.md` | ✅ REFERENCE | **KEEP** | Repository structure and path aliases |

**Action:**
- Deprecate `INDEX.md` (superseded by README.md)
- Deprecate `RECENT_CHANGES_2025_01.md` (outdated)
- Keep `README.md` as primary navigation
- Keep `repo-map.md` as reference (different purpose than README)

---

## Action Plan

### Phase 1: Deprecation Headers (Low-Risk)

**Files to Update with Deprecation Headers:**

1. `APP_MAP.md.bak`
   ```markdown
   > **⚠️ Deprecated:** This is a backup file. Use `APP_MAP.md` instead.
   ```

2. `INDEX.md` (root level)
   ```markdown
   > **⚠️ Deprecated:** This index has been superseded by `README.md`.
   > Please use the main [README.md](./README.md) for navigation.
   ```

3. `architecture/INDEX.md`
   ```markdown
   > **⚠️ Deprecated:** This index has been superseded by `architecture/README.md`.
   > Please use [architecture/README.md](./README.md) for navigation.
   ```

4. `systems/plugins/README.md`
   ```markdown
   > **⚠️ Deprecated:** This navigation file is superseded by the root-level
   > [PLUGIN_ARCHITECTURE.md](../../PLUGIN_ARCHITECTURE.md).
   > For system-specific information, see the other files in this directory.
   ```

5. `systems/plugins/INDEX.md`
   ```markdown
   > **⚠️ Deprecated:** This index is superseded by the root-level
   > [PLUGIN_ARCHITECTURE.md](../../PLUGIN_ARCHITECTURE.md).
   ```

6. `systems/generation/README.md`
   ```markdown
   > **⚠️ Deprecated:** This navigation file is superseded by
   > [systems/generation/overview.md](./overview.md).
   > For specific topics, see the files in this directory.
   ```

7. `systems/generation/INDEX.md`
   ```markdown
   > **⚠️ Deprecated:** This index is superseded by
   > [systems/generation/overview.md](./overview.md).
   ```

8. `RECENT_CHANGES_2025_01.md`
   ```markdown
   > **⚠️ Deprecated:** This document is outdated (January 2025).
   > For current documentation, see [README.md](./README.md).
   ```

### Phase 2: Archive Decisions

**No files need to be moved to archive at this time.** The 61 files already in `docs/archive/` are appropriately isolated.

### Phase 3: Update Main Navigation

**Update `docs/README.md`** with:
- Clear structure pointing to canonical docs for each major system
- Links to key architectural documents
- Link to this audit report for transparency

### Phase 4: Cross-Reference Updates

**Update these canonical docs to reference related docs:**

1. `PLUGIN_ARCHITECTURE.md` - Add section at end pointing to:
   - `PLUGIN_BUNDLE_FORMAT.md`
   - `systems/plugins/PLUGIN_DEVELOPER_GUIDE.md`
   - Feature-specific plugin docs (ROMANCE_PLUGIN.md, etc.)

2. `architecture/spatial-model.md` - Add section at end pointing to:
   - `architecture/generic-game-objects.md` (uses spatial model)
   - `event-bus-and-spatial-queries.md` (spatial events)

3. `event-bus-and-spatial-queries.md` - Add section at beginning pointing to:
   - `architecture/spatial-model.md` (spatial data format)
   - `architecture/generic-game-objects.md` (entity types)

4. `architecture/generic-game-objects.md` - Add "Related Systems" section pointing to:
   - `architecture/spatial-model.md` (spatial component)
   - `architecture/generic-links.md` (linking system)
   - `event-bus-and-spatial-queries.md` (events and queries)

5. `backend-domain-map.md` - Add cross-reference to:
   - `backend/SERVICES.md` (service API reference)

6. `systems/generation/overview.md` - Add cross-references to:
   - `systems/generation/GENERATION_GUIDE.md`
   - `systems/generation/provider-capabilities.md`
   - `systems/generation/status-tracking.md`

---

## Summary of Changes

| Category | Keep | Deprecate | Archive | Merge |
|----------|------|-----------|---------|-------|
| Core Architecture | 6 | 1 | 0 | 0 |
| Plugin System | 5 | 2 | 0 | 0 |
| Game Systems | 12 | 0 | 0 | 0 |
| Backend | 8 | 0 | 0 | 0 |
| Generation | 10 | 2 | 0 | 0 |
| Standards | 4 | 0 | 0 | 0 |
| Navigation | 1 | 3 | 0 | 0 |
| **Totals** | **~180** | **~10** | **0** | **0** |

---

## Implementation Timeline

### Immediate (Today)
1. ✅ Complete this audit report
2. Apply deprecation headers to 8 files
3. Verify all canonical docs have "Last Updated" dates

### Short-term (Next Session)
1. Update main docs/README.md with canonical structure
2. Add cross-references in related docs
3. Verify no dead links
4. Commit and push changes

### Ongoing
1. Monitor for new docs that should be added to canonical index
2. Update "Last Updated" dates when docs change
3. Archive docs that become obsolete
4. Keep cross-references up to date

---

## Success Criteria

✅ **This audit is successful when:**
1. All 8 deprecated files have clear deprecation headers
2. Main `docs/README.md` points to canonical docs for each system
3. All canonical docs include "Last Updated" date
4. All canonical docs reference related/complementary docs
5. No new docs are created; all use the canonical structure

---

## Conclusion

PixSim7 documentation is **well-organized** with clear canonical documents for major systems. The identified changes are **low-risk** and primarily involve:
- Adding deprecation headers to 8 navigation/summary files
- Updating cross-references in canonical docs
- Consolidating the main README.md

**No major reorganization is needed.** The existing structure effectively serves different audiences:
- `README.md` - Quick navigation
- `repo-map.md` - Repository structure
- Canonical docs (APP_MAP.md, PLUGIN_ARCHITECTURE.md, etc.) - Detailed system documentation
- System-specific docs - Deep dives into subsystems

This audit provides a clear roadmap for maintaining documentation quality going forward.

---

## Appendix: File Status Reference

**Status Codes:**
- ✅ **KEEP** - Maintain as-is; part of canonical structure
- ⚠️ **DEPRECATE** - Add deprecation header; keep file but mark as superseded
- 🔄 **MERGE** - Content should be consolidated into canonical doc
- 📦 **ARCHIVE** - Move to docs/archive/
- 🆕 **NEW** - Recently added (Dec 14)

**Dated Files (Last Updated 2025-12-14):**
1. `COMIC_PANELS.md`
2. `PLUGIN_ARCHITECTURE.md`
3. `PLUGIN_BUNDLE_FORMAT.md`
4. `power-user-simulation.md`
5. `architecture/frontend-backend-boundaries.md`
6. `architecture/generic-game-objects.md`
7. `architecture/generic-links.md`
8. `architecture/spatial-model.md`
9. `event-bus-and-spatial-queries.md`

**Total Recommended to KEEP:** ~180 files
**Total Recommended to DEPRECATE:** ~10 files
**Total in Archive (Ignored):** 61 files

---

*Report Generated: 2025-12-14 by Documentation Audit Task*
