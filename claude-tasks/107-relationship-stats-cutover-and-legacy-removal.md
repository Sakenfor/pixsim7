**Task: Relationship → Abstract Stat System Cutover (Forward-Only)**

> **For Agents (How to use this file)**
> - This task is a **forward-only migration**: stop using legacy relationship code and move everything to the abstract stat system.
> - **Do not preserve backward compatibility** beyond what the new stat system already provides (auto-migration is allowed to be one-way).
> - Treat this as the canonical plan for **removing `GameSession.relationships` and relationship-specific helpers** in favor of `GameSession.stats["relationships"]` and `WorldStatsConfig`.
> - Keep changes tightly scoped to relationships and related metrics; do not redesign the stat engine itself.

---

## Context

Current state after the stats rework:

- Abstract stat system is implemented and in use:
  - `pixsim7/backend/main/domain/stats/schemas.py` (axes/tiers/levels + `WorldStatsConfig`)
  - `pixsim7/backend/main/domain/stats/engine.py` (`StatEngine` for clamping, tiers, levels, normalization)
  - `pixsim7/backend/main/services/game/stat_service.py` (`StatService` for world-aware session stats + caching)
  - `pixsim7/backend/main/domain/stats/mixins.py` (`HasStats` / `HasStatsWithMetadata` for entity-owned stats)
  - `pixsim7/backend/main/services/game/npc_stat_service.py` (`NPCStatService` using base+override+modifiers)
- Relationship stat definition is already modeled as a first-class `StatDefinition`:
  - `get_default_relationship_definition()` in `pixsim7/backend/main/domain/stats/migration.py`
  - `migrate_world_meta_to_stats_config()` converts `relationship_schemas`/`intimacy_schema` → `WorldStatsConfig`
  - `migrate_session_relationships_to_stats()` converts `GameSession.relationships` → `GameSession.stats["relationships"]`
- `GameSession.stats` is live, but legacy relationship paths are still heavily used:
  - `GameSession.relationships` field (deprecated but still present) in `pixsim7/backend/main/domain/game/models.py`
  - Legacy helpers in `pixsim7/backend/main/domain/narrative/relationships.py`
  - Relationship preview API + metrics wired to legacy schemas:
    - `pixsim7/backend/main/api/v1/game_relationship_preview.py`
    - `pixsim7/backend/main/domain/metrics/relationship_evaluators.py`
  - Session/gameplay logic that reads/writes `session.relationships`:
    - `pixsim7/backend/main/domain/game/interaction_execution.py` (`apply_relationship_deltas`)
    - Narrative runtime, generation/social context, dialogue APIs, stealth API
  - Frontend/editor code that expects `session.relationships`:
    - `apps/main/src/components/game/RelationshipDashboard.tsx`
    - `apps/main/src/components/intimacy/*` (gate visualizer, state editor)
    - `apps/main/src/lib/game/relationshipHelpers.ts` / `relationshipComputation.ts`
    - `apps/main/src/lib/core/mockCore.ts`, `SessionStateViewer.tsx`, plugins that surface `session.relationships`

The goal of this task: **finish the transition** so that relationships are just another stat definition (`"relationships"`) living under `GameSession.stats`, with no remaining dependency on legacy relationship code or fields.

---

## Goals

- Make `GameSession.stats["relationships"]` the **only** authoritative storage for relationship axes/tiers/levels.
- Remove or replace all usage of:
  - `GameSession.relationships`
  - `pixsim7.backend.main.domain.narrative.relationships.*`
  - Relationship-specific preview API and metrics that rely on legacy schemas.
- Ensure worlds use `meta.stats_config.definitions["relationships"]` (or `get_default_relationship_definition`) instead of `relationship_schemas` / `intimacy_schema`.
- Update frontend/editor tooling to read/write relationship data through the **stat-based shape** (axes + computed tier/level IDs), not legacy fields (`tierId`, `intimacyLevelId`).
- Keep the **abstract stat system generic**: relationships are a preset/config, not special-case logic.

Out of scope:

- Redesigning stat computation or schemas.
- New relationship mechanics; this is a migration/cleanup, not a feature expansion.

---

## Phase Checklist (High-Level)

- [x] **Phase 1 – Make Relationship Stats Canonical in Session/World Models**
- [x] **Phase 2 – Replace Legacy Relationship Logic in Backend Services** ✅ **COMPLETE**
- [x] **Phase 3 – Replace Relationship Preview API with Stat-Based Preview** ✅ **COMPLETE**
- [x] **Phase 4 – Migrate Frontend/Editor to Use Stat-Based Relationships**
- [ ] **Phase 5 – Remove Legacy Relationship Fields, Helpers, and Docs**

Each phase should be implemented via small, reviewable PRs and validated with existing tests + targeted new tests where needed.

---

## Phase 1 – Make Relationship Stats Canonical in Session/World Models

**Goal:** Treat `stats["relationships"]` and `meta.stats_config.definitions["relationships"]` as the only supported storage for relationship data.

**Steps:**

- Update `GameSession` usage so that:
  - All new relationship writes go to `session.stats["relationships"]` in code (not `session.relationships`).
  - `session.relationships` is only present for the duration of the migration, then removed (Phase 5).
- Ensure world configuration always has a relationship stat definition:
  - For worlds missing `meta.stats_config.definitions["relationships"]`, either:
    - Auto-initialize via `get_default_relationship_definition()`; or
    - Fail clearly with a validation error when relationship operations are attempted.
- Confirm `StatService` covers the canonical flow:
  - `StatService.normalize_session_stats(session, "relationships")` normalizes all relationship data.
  - `StatService.normalize_all_session_stats` includes `"relationships"` when present.

**Key files:**

- `pixsim7/backend/main/domain/game/models.py` (`GameSession`, `GameWorld`)
- `pixsim7/backend/main/domain/stats/migration.py`
- `pixsim7/backend/main/services/game/stat_service.py`

---

## Phase 2 – Replace Legacy Relationship Logic in Backend Services

**Goal:** Stop using legacy relationship helpers and JSON paths in gameplay/session services; instead use stat definitions + `StatEngine`/`StatService`.

**Status: IMPLEMENTED** (via generic StatDelta + apply_stat_deltas routing)

**Implementation Summary:**

- ✅ Introduced generic `StatDelta` model in `pixsim7/backend/main/domain/game/npc_interactions.py`:
  - Generic representation for stat changes across any stat package
  - Validates entity_type and required fields (e.g., `npc_id` for NPC-scoped stats)
  - Extensible for future stat packages beyond relationships
- ✅ Implemented `apply_stat_deltas` in `pixsim7/backend/main/domain/game/interaction_execution.py`:
  - Routes stat changes through the abstract stat system using `StatEngine`
  - Resolves stat definitions from `WorldStatsConfig` or default definitions
  - Applies deltas incrementally and clamps values using `StatEngine.clamp_stat_values`
  - Replaces hardcoded 0-100 clamping with definition-based ranges
- ✅ Refactored `apply_relationship_deltas` to be a thin compatibility wrapper:
  - Converts `RelationshipDelta` → `StatDelta` targeting "core.relationships"
  - Delegates to `apply_stat_deltas` for stat computation
  - Preserves timestamp behavior (`lastInteractionAt`) for backward compatibility
- ✅ Exported `StatDelta` and `apply_stat_deltas` from `pixsim7.backend.game` public API
- ✅ Added comprehensive test coverage in `tests/test_stat_deltas.py`:
  - Tests for `apply_stat_deltas` with clamping, multiple NPCs, validation
  - Tests for `apply_relationship_deltas` delegation and backward compatibility
  - Confirms stat definition ranges are used instead of hardcoded 0-100

**Additional Cleanup (completed):**

- ✅ Updated `pixsim7/backend/main/domain/brain/engine.py`:
  - Removed legacy fallback to `session.relationships`
  - Now uses canonical `session.stats["relationships"]` path
  - Maintains backward compatibility with `session.flags.npcs[...].stats` for migration period
- ✅ Verified all services already use stat-based relationships:
  - `game_session_service.py` - Uses `StatService` for normalization
  - `social_context_builder.py` - No direct `session.relationships` usage
  - No remaining calls to legacy relationship helpers found
- ✅ Legacy helpers already removed:
  - `compute_relationship_tier`, `compute_intimacy_level`, `extract_relationship_values` - No usages found
  - `domain/narrative/relationships.py` - File does not exist

**Phase 2 Status: ✅ FULLY COMPLETE**

All backend services now use the stat-based relationship system exclusively. The only remaining references to `session.relationships` are in:
- Documentation files (intentional for migration guidance)
- Frontend/editor code (to be addressed in Phase 4)

**Key files:**

- `pixsim7/backend/main/domain/game/interaction_execution.py`
- `pixsim7/backend/main/services/game/game_session_service.py`
- `pixsim7/backend/main/domain/narrative/relationships.py` (to be deleted in Phase 5)
- `pixsim7/backend/main/services/generation/social_context_builder.py`
- `pixsim7/backend/main/api/v1/dialogue.py`
- `pixsim7/backend/main/plugins/game_dialogue/manifest.py`
- Any other callers found via `rg "session.relationships"`

---

## Phase 3 – Replace Relationship Preview API with Stat-Based Preview

**Goal:** Expose a generic stat preview API that works for relationships (and other stat types) using `WorldStatsConfig` + `StatEngine`, then remove the relationship-specific preview API.

**Status: ✅ COMPLETE** (generic stat preview API already implemented)

**Implementation Summary:**

- ✅ **Generic Stat Preview Endpoint** - Fully implemented at `POST /api/v1/stats/preview-entity-stats`:
  - Loads `GameWorld.meta.stats_config` with auto-migration from legacy schemas
  - Falls back to `get_default_relationship_definition()` for relationships
  - Accepts `{ "world_id": int, "stat_definition_id": str, "values": { axis_name: float } }` payload
  - Returns normalized output using `StatEngine.normalize_entity_stats` (clamped axes + `*TierId` + `levelId`)
  - Works with any stat type: relationships, skills, reputation, etc.
  - Registered as `stat_preview` plugin with prefix `/api/v1/stats`

- ✅ **Comprehensive Test Coverage** - Added `tests/test_stat_preview_api.py`:
  - Tests basic preview with clamping
  - Tests tier computation across value ranges
  - Tests multi-axis level computation
  - Tests fallback to default definitions
  - Tests error handling (world not found, invalid stat type, invalid requests)
  - Tests edge cases (partial values, empty values)

- ✅ **Legacy Cleanup**:
  - Removed empty `pixsim7/backend/main/routes/game_relationship_preview/` stub directory
  - No relationship-specific preview API files found (already removed or never implemented)
  - `domain/metrics/relationship_evaluators.py` does not exist

**Note:** The `game_reputation_preview` and `game_npc_mood_preview` APIs are NOT duplicates - they compute higher-level derived values from multiple stat packages and serve different purposes.

**Phase 3 Status: ✅ FULLY COMPLETE**

All relationship preview functionality now routes through the generic stat preview API. No relationship-specific preview code remains.

**Key files:**

- `pixsim7/backend/main/api/v1/stat_preview.py` - Generic stat preview endpoint
- `pixsim7/backend/main/routes/stat_preview/manifest.py` - Plugin registration
- `tests/test_stat_preview_api.py` - Comprehensive test suite

---

## Phase 4 – Migrate Frontend/Editor to Use Stat-Based Relationships

**Goal:** Frontend and tooling no longer depend on `session.relationships` or legacy fields (`tierId`, `intimacyLevelId`); they operate on the stat-based structure and/or the new stat preview API.

**Steps:**

- Update session DTOs and adapters so that relationship UIs receive data from `session.stats["relationships"]`:
  - Keep the shape close to the backend stat format (axes + `*TierId` + `levelId`).
- Refactor relationship-focused components and helpers to work with the stat-based structure:
  - `apps/main/src/components/game/RelationshipDashboard.tsx`
  - `apps/main/src/components/intimacy/*` (gate visualizer, state editor)
  - `apps/main/src/lib/game/relationshipHelpers.ts`
  - `apps/main/src/lib/game/relationshipComputation.ts`
  - `apps/main/src/components/panels/dev/SessionStateViewer.tsx`
  - `apps/main/src/lib/core/mockCore.ts` and any plugins that inspect `session.relationships`.
- Update any frontend preview flows to call the new stat preview API rather than relationship-specific endpoints.

**Key files:**

- `apps/main/src/components/game/RelationshipDashboard.tsx`
- `apps/main/src/components/intimacy/*`
- `apps/main/src/lib/game/relationshipHelpers.ts`
- `apps/main/src/lib/game/relationshipComputation.ts`
- `apps/main/src/lib/core/mockCore.ts`
- `apps/main/src/components/panels/dev/SessionStateViewer.tsx`
- Game-core wrappers for preview APIs (if present)

---

## Phase 5 – Remove Legacy Relationship Fields, Helpers, and Docs

**Goal:** Delete leftover relationship-specific fields and modules now that all call sites use the abstract stat system.

**Steps:**

- Remove `GameSession.relationships` from the model and DB migrations once:
  - All runtime code reads/writes `stats["relationships"]`.
  - Any historical data has been migrated (one-time script or on-demand migration via `StatService`).
- Remove legacy relationship helpers and schemas that are no longer used:
  - `pixsim7/backend/main/domain/narrative/relationships.py`
  - Relationship-specific bits of `pixsim7/backend/main/domain/game/schemas/relationship.py` if now redundant.
  - Any remaining imports of `compute_relationship_tier` / `compute_intimacy_level`.
- Clean up documentation:
  - Update `docs/RELATIONSHIPS_AND_ARCS.md` to describe the stat-based relationship model (axes/tiers/levels, `"relationships"` stat definition).
  - Update `RELATIONSHIP_MIGRATION_GUIDE.md` and `ABSTRACT_STAT_SYSTEM.md` to reflect that the migration is **complete** and legacy fields are gone.
  - Link this task from `claude-tasks/TASK_STATUS_UPDATE_NEEDED.md` with a short progress note.

**Key files:**

- `pixsim7/backend/main/domain/game/models.py`
- `pixsim7/backend/main/domain/narrative/relationships.py`
- `pixsim7/backend/main/domain/game/schemas/relationship.py`
- `docs/RELATIONSHIPS_AND_ARCS.md`
- `RELATIONSHIP_MIGRATION_GUIDE.md`
- `ABSTRACT_STAT_SYSTEM.md`

---

## Validation & Notes

- Add/extend tests around:
  - Relationship stat normalization via `StatService` and `StatEngine` (tiers + levels).
  - Interaction execution applying deltas into `stats["relationships"]` with correct clamping and derived fields.
  - New stat preview API behavior for `"relationships"` (matches expected legacy behavior where applicable).
- When updating call sites, prefer **small, mechanical changes** (replace `session.relationships[...]` with helpers operating on `stats["relationships"]`) to keep the migration easy to review.

Once all phases are done, the codebase should treat relationships as **just another stat definition**, with no special-case relationship code or legacy fields remaining.

