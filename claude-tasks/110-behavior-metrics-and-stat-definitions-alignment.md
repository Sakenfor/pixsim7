**Task: Behavior Metrics & Stat Definitions Alignment (World-Aware Conditions)**

> **For Agents (How to use this file)**
> - This task focuses on aligning **behavior system metrics** with the abstract stat system and stat packages.
> - Goal: avoid reintroducing hard-coded relationship assumptions (like direct `"affinity"` metrics) in behavior conditions.
> - Keep this independent from Task 107 (relationship storage) and Task 109 (intimacy gating); this is specifically about **behavior conditions & metrics**.

---

## Context & Motivation

The behavior system (docs and JSON examples) uses metrics like `"affinity"` directly in conditions, e.g.:

- `docs/behavior_system/README.md`
- `docs/behavior_system/example_visual_novel.json`
- `docs/behavior_system/example_2d_life_sim.json`

Patterns include:

- Conditions such as `{ "type": "relationship_gt", "npcIdOrRole": "npc:5", "metric": "affinity", "threshold": 50 }`.

This is conceptually fine but subtly couples behavior conditions to **specific relationship axes** that only exist when the relationship system is present. Now that we have:

- A generic stat system (`StatDefinition` / `StatEngine` / `WorldStatsConfig`).
- A stat package concept (`stat/package_registry.py` + `relationships_package.py`).

We should make behavior conditions **explicitly reference stat definitions and axes where appropriate**, so that:

- Worlds can plug in different stat packages or rename axes without rewriting behavior code.
- Conditions know **which stat definition** they are talking about (e.g., `"relationships"` vs `"mood"` vs `"stealth"`).

---

## Goals

- Introduce a clear way for behavior conditions to reference stat-based metrics:
  - E.g., `{ "type": "stat_axis_gt", "statDefinition": "relationships", "axis": "affinity", "threshold": 50 }`.
- Keep existing behavior examples working by providing defaults/mappings for legacy fields:
  - E.g., `relationship_gt` can internally map to `stat_axis_gt` on `"relationships"`.
- Avoid changing runtime behavior for worlds that use the default relationship package.
- Do not change the abstract stat engine itself; only how behavior interprets conditions.

Out of scope:

- Full overhaul of the behavior system or adding a new DSL; this is about conditions/metrics mapping.

---

## Phase Checklist

- [x] **Phase 1 – Audit Behavior Metrics & Relationship-Tied Conditions**
- [x] **Phase 2 – Design Stat-Aware Behavior Metric Schema**
- [x] **Phase 3 – Implement Stat-Aware Condition Evaluators**
- [x] **Phase 4 – Migrate Behavior Examples & Docs to New Schema**
- [x] **Phase 5 – Validate Backwards Behavior & Document Patterns**

---

## Phase 1 – Audit Behavior Metrics & Relationship-Tied Conditions

**Goal:** Identify where behavior conditions depend on relationship-specific metrics or assume particular axes like `affinity`.

**Status:** ✅ COMPLETED

**Findings:**

### Backend Implementation
- **File:** `pixsim7/backend/main/domain/behavior/conditions.py:159-182`
- **Condition Types:** `relationship_gt`, `relationship_lt`
- **Issue:** These evaluators directly access `context["relationships"][npc_id][metric]` without awareness of the stat system
- **Implementation:** Hard-coded to read from the legacy relationships dict, no integration with `StatDefinition`

### Documentation Examples
- **File:** `docs/behavior_system/README.md:169`
  - Example condition: `{ "type": "relationship_gt", "npcIdOrRole": "npc:5", "metric": "affinity", "threshold": 50 }`

- **File:** `docs/behavior_system/example_visual_novel.json`
  - Lines 44-48: `relationship_gt` with affinity >= 20
  - Lines 82-93: `relationship_gt` with affinity >= 40 and trust >= 30
  - Lines 128-134: `relationship_gt` with affinity >= 50
  - Lines 168-178: `relationship_gt` with affinity >= 60 and chemistry >= 50
  - Lines 278-282: `relationship_lt` with affinity < 40
  - Lines 307-317: `relationship_gt`/`relationship_lt` for affinity range 40-70
  - Lines 345-350: `relationship_gt` with affinity >= 70
  - Multiple `relationshipChanges` effects with affinity, trust, chemistry, tension

- **File:** `docs/behavior_system/example_2d_life_sim.json`
  - Lines 78-82: `relationshipChanges` with affinity and trust

**Observations:**
- All relationship conditions assume the existence of a specific set of axes (affinity, trust, chemistry, tension)
- No mechanism to reference other stat definitions (e.g., mood, skills, stealth)
- The stat system already has a `relationships` StatDefinition with these axes, but behavior conditions don't use it

---

## Phase 2 – Design Stat-Aware Behavior Metric Schema

**Goal:** Define how behavior conditions should reference stats in a way that's consistent with stat packages and world config.

**Status:** ✅ COMPLETED

### Design Overview

#### 1. Generic Stat-Based Conditions

New condition types that reference stat definitions explicitly:

```json
// Greater than comparison
{
  "type": "stat_axis_gt",
  "statDefinition": "relationships",
  "npcIdOrRole": "npc:5",
  "axis": "affinity",
  "threshold": 50
}

// Less than comparison
{
  "type": "stat_axis_lt",
  "statDefinition": "mood",
  "axis": "stress",
  "threshold": 30
}

// Range comparison
{
  "type": "stat_axis_between",
  "statDefinition": "skills",
  "axis": "strength",
  "min": 40,
  "max": 80
}
```

**Fields:**
- `statDefinition` (required): Which stat definition to query (e.g., "relationships", "mood", "skills")
- `npcIdOrRole` (optional): For relational stats (like relationships), the target NPC. Omit for entity-owned stats (like mood, skills)
- `axis` (required): The axis name within the stat definition
- `threshold` / `min` / `max`: Comparison values

#### 2. Legacy Relationship Conditions (Backwards Compatible)

Existing `relationship_gt` and `relationship_lt` are reimplemented as convenience wrappers:

```json
{
  "type": "relationship_gt",
  "npcIdOrRole": "npc:5",
  "metric": "affinity",  // or "axis"
  "threshold": 50
}
```

**Mapping:**
- `relationship_gt` → `stat_axis_gt` with `statDefinition="relationships"`
- `relationship_lt` → `stat_axis_lt` with `statDefinition="relationships"`
- `metric` field → `axis` field (both supported for backwards compatibility)
- Default axis is `"affinity"` if omitted

#### 3. Context Integration

The condition evaluators will:
1. Look up the `StatDefinition` from `world.meta.stats_config.definitions[statDefinition]`
2. For relational stats (with `npcIdOrRole`), read from `session.stats[statDefinition][npcIdOrRole][axis]`
3. For entity stats (without `npcIdOrRole`), read from `npc.stats[statDefinition][axis]`
4. Fall back to the legacy `relationships` dict if stat system data isn't available (migration support)

#### 4. Evaluation Context Schema

The context passed to condition evaluators will include:

```python
context = {
    "npc": GameNPC,              # The NPC entity
    "world": GameWorld,          # The world (for stat definitions)
    "session": GameSession,      # The session (for session-level stats)
    "flags": dict,               # Session flags
    "relationships": dict,       # Legacy relationships (deprecated)
    "world_time": int,           # Current world time
    "npc_state": dict,           # NPC session state
    "npc_stats": dict,           # NPC entity stats (new)
}
```

### Benefits

1. **Flexible:** Can reference any stat definition, not just relationships
2. **Package-aware:** Works with stat packages and custom stat definitions
3. **Backwards compatible:** Legacy conditions still work via wrapper implementation
4. **Explicit:** Clear which stat system is being referenced
5. **Migration-friendly:** Falls back to legacy data when stat system isn't configured

---

## Phase 3 – Implement Stat-Aware Condition Evaluators

**Goal:** Implement or extend backend behavior condition evaluators to understand the new stat-aware schema.

**Status:** ✅ COMPLETED

**Implementation Details:**

### New Evaluators Added (pixsim7/backend/main/domain/behavior/conditions.py)

1. **`_get_stat_value()` helper function**
   - Retrieves stat values from the stat system with multi-level fallback:
     1. Try session-level stats: `session.stats[statDefinition][npcIdOrRole][axis]`
     2. Try entity-owned stats: `npc_stats[statDefinition][axis]`
     3. Fall back to legacy relationships dict for backwards compatibility
   - Supports both relational stats (with `npcIdOrRole`) and entity stats (without)

2. **`_eval_stat_axis_gt()`** - Lines 211-240
   - Generic stat comparison: value > threshold
   - Works with any stat definition (relationships, mood, skills, etc.)

3. **`_eval_stat_axis_lt()`** - Lines 243-269
   - Generic stat comparison: value < threshold

4. **`_eval_stat_axis_between()`** - Lines 272-300
   - Generic stat range check: min <= value <= max

### Legacy Compatibility

**Refactored legacy evaluators** to delegate to stat-aware ones:

- **`_eval_relationship_gt()`** - Lines 308-337
  - Now a thin wrapper around `stat_axis_gt` with `statDefinition="relationships"`
  - Supports both "metric" (legacy) and "axis" (new) field names
  - Fully backwards compatible with existing behavior configs

- **`_eval_relationship_lt()`** - Lines 340-369
  - Similar wrapper for less-than comparisons

### Registration

All new condition types registered in `_register_builtin_conditions()`:
- `stat_axis_gt`
- `stat_axis_lt`
- `stat_axis_between`
- `relationship_gt` (legacy, delegated)
- `relationship_lt` (legacy, delegated)

**Benefits:**
- Zero breaking changes - all existing configs work unchanged
- New stat-aware conditions available immediately
- Supports any stat definition from stat packages
- Clean separation between stat system integration and legacy support

---

## Phase 4 – Migrate Behavior Examples & Docs to New Schema

**Goal:** Update behavior system documentation and JSON examples to prefer the stat-aware schema.

**Status:** ✅ COMPLETED

**Changes Made:**

### Documentation Updates (docs/behavior_system/README.md)

1. **Updated Condition DSL section (lines 163-241)**
   - Added stat-based conditions at the top as recommended approach
   - Documented all three new condition types: `stat_axis_gt`, `stat_axis_lt`, `stat_axis_between`
   - Added new "Stat-Based Condition Types" subsection with detailed examples
   - Explained benefits: flexible, package-aware, supports any stat definition
   - Documented legacy relationship conditions as convenience wrappers
   - Showed equivalence between legacy and new formats

2. **Updated Common Patterns section (lines 588-623)**
   - "Relationship-Gated Activities" now shows both stat-aware (recommended) and legacy formats
   - Clear indication that both approaches are supported

### Example File Updates

1. **example_visual_novel.json**
   - Added `_note` field explaining stat-aware conditions are available
   - Kept existing examples unchanged (backwards compatible)
   - Note clarifies both formats are fully supported

2. **example_2d_life_sim.json**
   - Added similar `_note` field
   - Existing examples remain functional

**Approach:**
- Maintained full backwards compatibility - no breaking changes to examples
- Added educational notes to guide users toward stat-aware conditions
- Documentation shows both old and new patterns side-by-side
- Legacy examples are still valid and illustrative

---

## Phase 5 – Validate Backwards Behavior & Document Patterns

**Goal:** Ensure that worlds using the default relationships behave exactly as before, and that developers understand how to use stat-based behavior metrics.

**Status:** ✅ COMPLETED

**Test Coverage:**

Created comprehensive test suite in `tests/test_behavior_stat_conditions.py` with 14 test cases:

### Stat-Aware Condition Tests
1. ✅ `test_stat_axis_gt_with_session_stats` - Verifies session-level stats (relationships)
2. ✅ `test_stat_axis_gt_with_entity_stats` - Verifies entity-owned stats (mood, skills)
3. ✅ `test_stat_axis_gt_fallback_to_legacy` - Verifies fallback to legacy relationships dict
4. ✅ `test_stat_axis_lt` - Verifies less-than comparisons
5. ✅ `test_stat_axis_between` - Verifies range checks with boundary conditions

### Legacy Compatibility Tests
6. ✅ `test_relationship_gt_backwards_compatible` - Legacy format with 'metric' field
7. ✅ `test_relationship_gt_supports_axis_field` - New format with 'axis' field
8. ✅ `test_relationship_gt_defaults_to_affinity` - Default axis behavior
9. ✅ `test_relationship_lt_backwards_compatible` - Legacy less-than conditions

### Equivalence Tests
10. ✅ `test_legacy_and_stat_aware_are_equivalent` - Proves identical results
11. ✅ `test_missing_stat_returns_default` - Nonexistent NPC handling
12. ✅ `test_missing_axis_returns_default` - Nonexistent axis handling

### Helper Function Tests
13. ✅ `test_get_stat_value_priority_order` - Verifies lookup priority (session → entity → legacy → default)
14. ✅ `test_get_stat_value_entity_stats` - Entity stat retrieval

**Test Results:**
```
14 passed, 1 warning in 2.26s
```

All tests pass, confirming:
- New stat-aware conditions work correctly for any stat definition
- Legacy relationship conditions maintain full backwards compatibility
- Both produce identical results for equivalent inputs
- Edge cases are handled properly (missing stats, missing axes, boundary conditions)
- Fallback mechanisms work as designed

**Documentation:**
- Behavior system README updated with stat-aware condition patterns
- Examples show both recommended (stat-aware) and legacy approaches
- Clear guidance on when to use each format
- Benefits clearly explained (flexibility, package-awareness, backwards compatibility)

---

## Notes

- This task complements Task 107 (relationship stats cutover) and Task 109 (intimacy gating). Together, they move:
  - Storage/normalization → `stats["relationships"]` (Task 107).
  - Intimacy/content gating thresholds → stat-aware config (Task 109).
  - Behavior conditions → stat-aware metrics (this task).
- When implementing, keep the behavior evaluators and schemas generic enough to support non-relationship stat packages (e.g., `"mood"`, `"stealth"`, `"combat"`) without extra refactors.

