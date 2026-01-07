# Root-Level Documentation Redundancy Report

**Date:** 2025-12-14
**Focus:** 118 markdown files in `/docs/` root directory
**Status:** Supplementary audit - identifies content overlaps and consolidation opportunities

---

## Executive Summary

Analysis of 118 root-level docs identified **3 HIGH-priority** content redundancies and **1 MEDIUM-priority** concern requiring consolidation:

- 🔴 **HIGH**: ACTION_ENGINE_SESSION_RESUME duplicates ACTION_ENGINE_USAGE
- 🔴 **HIGH**: Three NARRATIVE_* files (SPEC, SCHEMA, USAGE) should consolidate into one
- 🟠 **MEDIUM**: NARRATIVE_RUNTIME potentially supersedes older prompt engine docs
- 🟡 **MEDIUM**: CONTROL_CUBES vs CUBE_SYSTEM_V2_PLUGIN need clearer separation

---

## HIGH-PRIORITY REDUNDANCIES

### 1. ACTION_ENGINE_SESSION_RESUME.md ⚠️ DEPRECATE

**Files:**
- `ACTION_ENGINE_SESSION_RESUME.md` (to deprecate)
- `ACTION_ENGINE_USAGE.md` (canonical)

**Problem:**
Both files document the same Action Engine system. SESSION_RESUME (lines 1-25) provides a "Current State Summary" describing identical components and API endpoints that are fully covered in ACTION_ENGINE_USAGE (lines 3-27).

**Content Duplication:**
- Same endpoint references: `/api/v1/game/dialogue/actions/select`, `/api/v1/game/dialogue/actions/next`
- Same component descriptions (Narrative Prompt Engine, Action Prompt Engine)
- SESSION_RESUME is essentially a session notes document, not a standalone reference

**Recommendation:**
✅ **DEPRECATE ACTION_ENGINE_SESSION_RESUME.md**
- Keep ACTION_ENGINE_USAGE.md as canonical reference
- Move any unique "next session" tasks to a separate task tracking file
- Archive SESSION_RESUME.md

**Action:**
Apply deprecation header:
```markdown
> ⚠️ **Deprecated**: This session notes document has been superseded by [`ACTION_ENGINE_USAGE.md`](./ACTION_ENGINE_USAGE.md).
> Use the main ACTION_ENGINE_USAGE.md for all API reference and examples.
```

---

### 2. NARRATIVE_PROMPT_ENGINE_SPEC.md + NARRATIVE_PROMPT_SCHEMA.md + NARRATIVE_ENGINE_USAGE.md 🔴 CONSOLIDATE

**Files:**
- `NARRATIVE_PROMPT_ENGINE_SPEC.md` (design goals)
- `NARRATIVE_PROMPT_SCHEMA.md` (JSON schema)
- `NARRATIVE_ENGINE_USAGE.md` (API usage)

**Problem:**
All three documents describe the **same narrative prompt engine system** from overlapping angles:

- **NARRATIVE_PROMPT_ENGINE_SPEC** (lines 1-80): High-level design goals, context, "unified system" description
- **NARRATIVE_PROMPT_SCHEMA** (lines 1-40): JSON schema structure (variables, conditions, stages)
- **NARRATIVE_ENGINE_USAGE** (lines 1-50): API endpoints and usage examples

**Content Duplication:**
Same concepts documented in multiple places:
- "prompt programs" (mentioned in all three)
- "stages" (in SPEC and SCHEMA)
- "variables and conditions" (in SPEC and SCHEMA)
- API endpoints (in SPEC description and USAGE)

**Recommendation:**
✅ **CONSOLIDATE into single: NARRATIVE_ENGINE_SPECIFICATION.md**

Structure:
```markdown
# Narrative Engine Specification

## 1. Overview & Goals
(from NARRATIVE_PROMPT_ENGINE_SPEC)
- Unified dialogue, choices, action blocks, scene transitions
- Design principles and motivation

## 2. Prompt Program Schema
(from NARRATIVE_PROMPT_SCHEMA)
- JSON schema with examples
- Field definitions: stages, variables, conditions

## 3. API Reference & Usage
(from NARRATIVE_ENGINE_USAGE)
- Available endpoints
- Request/response examples
- Error handling

## 4. Examples
(expanded from all three documents)
- Complete end-to-end example
- Common patterns
```

**Keep as separate "Quick Start" guide:**
- Keep `NARRATIVE_ENGINE_USAGE.md` as a simplified quick-start (just the API examples)

**Action:**
1. Create new `NARRATIVE_ENGINE_SPECIFICATION.md` consolidating all three
2. Reduce `NARRATIVE_ENGINE_USAGE.md` to quick-start guide with link to spec
3. Deprecate `NARRATIVE_PROMPT_ENGINE_SPEC.md` and `NARRATIVE_PROMPT_SCHEMA.md`

---

### 3. NARRATIVE_RUNTIME.md vs NARRATIVE_PROMPT_ENGINE_SPEC.md 🟠 CLARIFY RELATIONSHIP

**Files:**
- `NARRATIVE_RUNTIME.md` (unified runtime system)
- `NARRATIVE_PROMPT_ENGINE_SPEC.md` (prompt engine spec)
- `NARRATIVE_RUNTIME_MIGRATION.md` (migration guide)

**Problem:**
NARRATIVE_RUNTIME (line 3) claims to be a "unified system" for dialogue, choices, action blocks, and scene transitions. NARRATIVE_PROMPT_ENGINE_SPEC appears to be an older design focused only on prompts.

**Question:** Does NARRATIVE_RUNTIME supersede the prompt engine docs?

**Investigation Needed:**
Check if NARRATIVE_PROMPT_ENGINE_SPEC is:
- A legacy component still referenced elsewhere, OR
- Completely superseded by NARRATIVE_RUNTIME

Look at NARRATIVE_RUNTIME_MIGRATION.md (lines 9-44) for migration path details.

**Recommendation (Pending Investigation):**
- If RUNTIME fully replaces PROMPT_ENGINE_SPEC: **DEPRECATE NARRATIVE_PROMPT_ENGINE_SPEC.md** with note
- If PROMPT_ENGINE_SPEC describes a specific still-used component: Add clarification note to both docs

**Suggested Deprecation Header (if superseded):**
```markdown
> ⚠️ **Deprecated**: This is an older design document.
> For the current unified narrative system, see [`NARRATIVE_RUNTIME.md`](./NARRATIVE_RUNTIME.md).
> For migration guide, see [`NARRATIVE_RUNTIME_MIGRATION.md`](./NARRATIVE_RUNTIME_MIGRATION.md).
```

---

## MEDIUM-PRIORITY CONCERNS

### 4. CONTROL_CUBES.md vs CUBE_SYSTEM_V2_PLUGIN.md 🟡 SEPARATE CONCERNS

**Files:**
- `CONTROL_CUBES.md` (user features, UI interaction)
- `CUBE_SYSTEM_V2_PLUGIN.md` (plugin architecture, lifecycle)

**Problem:**
Both documents describe the 3D cube control interface, but they should have different focuses:

**What's overlapping:**
- CONTROL_CUBES (lines 1-149): Full cube system including features, architecture, panels, state management, CSS transforms
- CUBE_SYSTEM_V2_PLUGIN (lines 1-150): Plugin implementation with overlap on features and architecture (lines 70-150)

**What's the distinction:**
- CONTROL_CUBES should focus on **user-facing features** (features, modes, keyboard shortcuts, dynamic actions)
- CUBE_SYSTEM_V2_PLUGIN should focus on **plugin architecture** (manifest, lifecycle hooks, rendering internals)

**Problem:** Internal implementation details (CSS 3D transforms, Zustand store) are in CONTROL_CUBES but shouldn't be user-facing documentation.

**Recommendation:**
✅ **KEEP BOTH but clarify scope:**

**CONTROL_CUBES.md should cover:**
- What are cube controls?
- What can users do with them?
- Features and interaction model
- Keyboard shortcuts and modes
- Examples of cube usage

**CUBE_SYSTEM_V2_PLUGIN.md should cover:**
- Plugin architecture and manifest
- Lifecycle hooks (mount, unmount)
- Rendering and state management (implementation details)
- How to extend the cube system
- API for custom cube formations

**Action:**
1. Remove internal implementation details (CSS 3D, Zustand store code) from CONTROL_CUBES
2. Move technical implementation details to CUBE_SYSTEM_V2_PLUGIN
3. Add cross-references: "For implementation details, see CUBE_SYSTEM_V2_PLUGIN.md"

---

## LOW-PRIORITY / COMPLEMENTARY (No Action Needed)

The following file groups are complementary and serve different purposes. Keep all:

### STAT_* Files (Complementary Progression)
- `ABSTRACT_STAT_SYSTEM.md` - Core concept and design
- `STAT_SYSTEM_INTEGRATION_PLAN.md` - How to integrate
- `ENTITY_STATS_EXAMPLES.md` - Practical examples
**Status:** Concept → Plan → Examples (logical progression) ✅

### INTERACTION_* Files (Different Angles)
- `INTERACTION_AUTHORING_GUIDE.md` - How to create interactions
- `INTERACTION_SYSTEM_REFACTOR.md` - Architecture improvement proposal
- `INTERACTION_SYSTEM_MIGRATION.md` - Migration guide from old system
- `INTERACTION_PLUGIN_MANIFEST.md` - Plugin contract/interface
**Status:** Each serves different purpose ✅

### BACKEND_* Files (Different Concerns)
- `BACKEND_ORGANIZATION.md` - Domain structure
- `BACKEND_MODERNIZATION.md` - Service refactoring
- `BACKEND_STARTUP.md` - Startup mechanics
- `BACKEND_INTERACTION_DISPATCHER.md` - Future proposal
**Status:** Distinct concerns ✅

### PROMPT_* Files (Different Scopes)
- `PROMPT_SYSTEM_REVIEW.md` - Strategic analysis
- `PROMPT_VERSIONING_SYSTEM.md` - Implementation of versioning
- `PROMPTS_GIT_FEATURES.md` - Git integration details
**Status:** Strategic vs tactical vs technical ✅

### NPC_* Files (Different Systems)
- `NPC_INTERACTIVE_ZONES_DESIGN.md` - Zone system design
- `NPC_ZONE_TRACKING_SYSTEM.md` - Advanced tracking features
- `NPC_RESPONSE_GRAPH_DESIGN.md` - Node-based response system
- `NPC_RESPONSE_USAGE.md` - Usage guide
- `NPC_RESPONSE_VIDEO_INTEGRATION.md` - Video integration
**Status:** Different aspects of NPC system ✅

### CUBE_SYSTEM_DYNAMIC_REGISTRATION.md vs CUBE_SYSTEM_V2_PLUGIN.md
- DYNAMIC_REGISTRATION: Tutorial/how-to
- CUBE_SYSTEM_V2_PLUGIN: Reference documentation
**Status:** Complementary (tutorial + reference) ✅
**Action:** Add cross-references between them

---

## Implementation Roadmap

### Phase 1: High-Priority Deprecations (Implement First)
**Files to deprecate with headers:**

1. ❌ `ACTION_ENGINE_SESSION_RESUME.md` - Duplicate of ACTION_ENGINE_USAGE
2. ⚠️ `NARRATIVE_PROMPT_ENGINE_SPEC.md` - Consolidate into SPECIFICATION
3. ⚠️ `NARRATIVE_PROMPT_SCHEMA.md` - Consolidate into SPECIFICATION

**Action:** Add deprecation headers pointing to canonical docs

### Phase 2: Consolidation (Follow-up)

1. Create `NARRATIVE_ENGINE_SPECIFICATION.md` consolidating three narrative docs
2. Reduce `NARRATIVE_ENGINE_USAGE.md` to quick-start guide
3. Verify `NARRATIVE_RUNTIME.md` relationship (investigate if it supersedes prompt engine docs)

### Phase 3: Scope Clarification (Lower Priority)

1. Refactor `CONTROL_CUBES.md` to focus on user-facing features only
2. Move implementation details to `CUBE_SYSTEM_V2_PLUGIN.md`
3. Add cross-references between CUBE docs

### Phase 4: Cross-References (Low Priority)

1. Add links between CUBE_SYSTEM_DYNAMIC_REGISTRATION.md and CUBE_SYSTEM_V2_PLUGIN.md
2. Verify all "keep" files link to each other appropriately

---

## Summary Table

| File | Status | Action | Priority |
|------|--------|--------|----------|
| `ACTION_ENGINE_SESSION_RESUME.md` | 🔴 DUPLICATE | Deprecate with header | HIGH |
| `NARRATIVE_PROMPT_ENGINE_SPEC.md` | 🔴 CONSOLIDATE | Merge into SPECIFICATION | HIGH |
| `NARRATIVE_PROMPT_SCHEMA.md` | 🔴 CONSOLIDATE | Merge into SPECIFICATION | HIGH |
| `NARRATIVE_ENGINE_USAGE.md` | 🟡 REDUCE | Keep as quick-start guide | HIGH |
| `NARRATIVE_RUNTIME.md` | 🟠 CLARIFY | Verify relationship | MEDIUM |
| `CONTROL_CUBES.md` | 🟡 REFACTOR | Separate user features from internals | MEDIUM |
| `CUBE_SYSTEM_V2_PLUGIN.md` | 🟡 CLARIFY | Move implementation details here | MEDIUM |
| `CUBE_SYSTEM_DYNAMIC_REGISTRATION.md` | ✅ KEEP | Add cross-reference to V2 | LOW |
| All others analyzed | ✅ KEEP | No action needed | LOW |

---

## Estimated Effort

| Phase | Task | Effort | Risk |
|-------|------|--------|------|
| Phase 1 | Add 3 deprecation headers | 5 min | Low |
| Phase 2 | Create NARRATIVE_ENGINE_SPECIFICATION.md, consolidate 3 files | 30 min | Medium |
| Phase 3 | Refactor CONTROL_CUBES + CUBE_SYSTEM_V2_PLUGIN | 45 min | Medium |
| Phase 4 | Add cross-references | 10 min | Low |
| **Total** | | **~90 min** | **Medium** |

---

## Notes

- This audit focuses on **actual content overlap**, not just similar naming
- Most files that appeared to overlap are actually complementary (different angles on the same system)
- The 3 high-priority items are genuine redundancies with significant content duplication
- No files need to be deleted; all deprecations are non-breaking with clear headers
- Narrative documentation needs special attention - three files partially cover the same system

---

*Supplementary audit generated: 2025-12-14*
