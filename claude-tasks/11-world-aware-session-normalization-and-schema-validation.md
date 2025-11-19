**Task: World-Aware Session Normalization & Schema Validation (Multi‑Phase)**

**Context**
- Relationship tiers and intimacy levels are computed and stored in `GameSession.relationships["npc:X"].tierId` / `intimacyLevelId`.
- Per‑world relationship schemas live in `GameWorld.meta`:
  - `relationship_schemas`
  - `intimacy_schema`
- `_normalize_session_relationships()` in `GameSessionService` currently:
  - Uses **empty** `relationship_schemas` / `intimacy_schema` (hardcoded defaults only).
  - Has a TODO to fetch world metadata.
- As a result, **custom world schemas are not used** when normalizing sessions, which limits the value of per‑world relationship scales.
- There is no validation of schema shape in `GameWorld.meta`, so invalid configs can silently break computation.

This task makes session normalization world‑aware and adds schema validation, so relationship behavior truly reflects per‑world configuration and fails fast on bad schemas.

> **For agents:** This task touches backend models and services. It may require a migration for `GameSession`. Coordinate with any in‑flight schema changes and keep the transition backward‑compatible where possible.

### Phase Checklist

- [ ] **Phase 1 – Design Session ↔ World Relationship**
- [ ] **Phase 2 – Implement `world_id` on `GameSession` (or Equivalent Link)**
- [ ] **Phase 3 – Make `_normalize_session_relationships` World-Aware**
- [ ] **Phase 4 – Add World Meta Schema Validation**
- [ ] **Phase 5 – (Optional) Cache Invalidation on Schema Changes**
- [ ] **Phase 6 – Distinguish “No Data” vs “Not Normalized” in Game-Core**
- [ ] **Phase 7 – Type-Safe Tier/Intimacy IDs in Types**
- [ ] **Phase 8 – Additional Integration Tests (Session + Preview API)**
- [ ] **Phase 9 – Metric Registry Wiring (Optional)**
- [ ] **Phase 10 – Documentation Updates**

---

### Phase 1 – Design Session ↔ World Relationship

**Goal**  
Decide how to link `GameSession` to a `GameWorld` so normalization can load the correct schemas.

**Scope**
- Design and decision; no code changes yet.

**Key Steps**
1. Clarify session kinds (based on existing docs and flags):
   - Scene‑centric sessions (`sessionKind: "scene"`).
   - World/life‑sim sessions (`sessionKind: "world"`).
2. Decide the canonical link:
   - **Option A:** Add `world_id: int | null` field on `GameSession` (most explicit).
   - **Option B:** Derive world from flags (e.g. `flags.world.id`) for world sessions and treat scene sessions as “no world schema” (less explicit).
3. Document the chosen approach in this file and ensure it does not conflict with existing session flags or world state APIs.

---

### Phase 2 – Implement `world_id` on `GameSession` (or Equivalent Link)

**Goal**  
Add a robust link from `GameSession` to `GameWorld` according to the design from Phase 1.

**Scope**
- Backend models and migrations; API DTOs if needed.

**Key Steps**
1. If using `world_id`:
   - Add `world_id: Optional[int] = Field(default=None, foreign_key="game_worlds.id", index=True)` to `GameSession` in `domain/game/models.py`.
   - Create and run an Alembic migration adding the column (nullable for backward compatibility).
2. Decide how `world_id` is set:
   - On `create_session`, accept an optional `world_id` parameter (or derive from scene/flags).
   - On world‑session creation paths (e.g. life‑sim tools), require `world_id` explicitly.
3. Update any DTOs (`GameSessionDTO`) and API endpoints as needed to carry `world_id` where appropriate.

---

### Phase 3 – Make `_normalize_session_relationships` World-Aware

**Goal**  
Use the correct world schemas when computing `tierId` and `intimacyLevelId` during session normalization.

**Scope**
- `GameSessionService._normalize_session_relationships` and associated helpers.

**Key Steps**
1. In `_normalize_session_relationships`:
   - If the session has a `world_id`:
     - Load world meta with a minimal query (e.g. `select(GameWorld.id, GameWorld.meta)`).
     - Extract `relationship_schemas` and `intimacy_schema` from `world.meta` (with safe defaults).
   - If no `world_id`:
     - Decide policy: either use hardcoded defaults or skip schema‑based normalization.
2. Replace the current hardcoded empty schemas with world‑aware values:
   ```py
   if session.world_id:
       relationship_schemas = world.meta.get("relationship_schemas", {}) if world.meta else {}
       intimacy_schema = world.meta.get("intimacy_schema") if world.meta else None
   else:
       relationship_schemas = {}
       intimacy_schema = None
   ```
3. Keep Redis caching behavior but ensure it now reflects world‑specific schemas.
4. Add unit tests for `_normalize_session_relationships` that:
   - Use a session linked to a world with custom schemas.
   - Assert that normalized `tierId`/`intimacyLevelId` reflect those schemas, not the defaults.

---

### Phase 4 – Add World Meta Schema Validation

**Goal**  
Validate `GameWorld.meta.relationship_schemas` and `intimacy_schema` at write time to avoid silent breakage.

**Scope**
- Backend world meta handling; no frontend changes.

**Key Steps**
1. Create Pydantic models in a new module (e.g. `pixsim7_backend/domain/game/schemas.py`) to validate schemas, e.g.:
   - `RelationshipTierSchema` (id, min, max).
   - `IntimacyLevelSchema` (id, minAffinity, minTrust, minChemistry, maxTension).
   - `WorldMetaSchemas` aggregating those structures.
2. On GameWorld create/update (where meta is changed):
   - Attempt to validate `world.meta` (or just the schemas portion) against `WorldMetaSchemas`.
   - If validation fails, raise an appropriate HTTP 400 or service error.
3. Optionally, add a small admin/dev endpoint to validate all existing worlds and report schema problems.

---

### Phase 5 – (Optional) Cache Invalidation on Schema Changes

**Goal**  
Ensure normalized relationships are not stale when world schemas change.

**Scope**
- Cache layer behavior; optional but recommended.

**Key Steps**
1. When updating `GameWorld.meta.relationship_schemas` / `intimacy_schema`:
   - Identify sessions linked to that `world_id` (requires `world_id` on `GameSession`).
   - Invalidate their cached relationship entries in Redis (`session:{id}:relationships`).
2. Implement this either:
   - Inside the world update path (e.g. in a `GameWorldService`), or
   - Via a small helper that is called after schema updates.
3. Document that cache invalidation occurs on schema changes and that normalization will recompute on next session update/advance.

---

### Phase 6 – Distinguish “No Data” vs “Not Normalized” in Game-Core

**Goal**  
Expose whether a relationship has been normalized by backend vs simply having no data, to improve debugging and tooling.

**Scope**
- `NpcRelationshipState` and related helpers in game-core.

**Key Steps**
1. Extend `NpcRelationshipState` in `packages/game-core/src/core/types.ts` with an `isNormalized: boolean` field, e.g.:
   ```ts
   export interface NpcRelationshipState {
     affinity: number;
     trust: number;
     chemistry: number;
     tension: number;
     flags: string[];
     tierId?: string | null;
     intimacyLevelId?: string | null;
     isNormalized: boolean;
     raw?: Record<string, any>;
   }
   ```
2. In `getNpcRelationshipState`:
   - Set `isNormalized` to `true` if either `tierId` or `intimacyLevelId` is present in `raw`.
   - Set `isNormalized` to `false` otherwise (even if TS fallback is still used internally).
3. Allow callers (e.g. debug panels) to warn when `isNormalized === false`, so designers know they’re seeing fallback values.

---

### Phase 7 – Type-Safe Tier/Intimacy IDs in Types

**Goal**  
Improve type safety and clarity around `tierId` and `intimacyLevelId` while still allowing world‑specific custom IDs.

**Scope**
- `@pixsim7/types` and game-core usage.

**Key Steps**
1. In `packages/types/src/game.ts`, define default enums/union types, e.g.:
   ```ts
   export type DefaultRelationshipTier =
     | 'stranger'
     | 'acquaintance'
     | 'friend'
     | 'close_friend'
     | 'lover';

   export type DefaultIntimacyLevel =
     | 'platonic'
     | 'light_flirt'
     | 'deep_flirt'
     | 'intimate'
     | 'very_intimate';

   export type RelationshipTierId = DefaultRelationshipTier | string;
   export type IntimacyLevelId = DefaultIntimacyLevel | string;
   ```
2. Update `NpcRelationshipState` and any DTOs to use `RelationshipTierId` and `IntimacyLevelId` instead of plain `string`.
3. Ensure this change is backwards‑compatible (worlds can still define custom IDs; the union just documents the common ones).

---

### Phase 8 – Additional Integration Tests (Session + Preview API)

**Goal**  
Extend integration tests to cover world‑aware normalization and ensure it matches preview behavior.

**Scope**
- Backend tests only.

**Key Steps**
1. Add integration tests that:
   - Create a `GameWorld` with custom schemas.
   - Create a `GameSession` linked to that world with specific relationship values.
   - Call session update/advance and assert that normalized `tierId`/`intimacyLevelId` match both:
     - The configured schemas.
     - The values returned by the preview API for the same inputs.
2. Ensure tests cover:
   - Default schema behavior.
   - At least one non‑default schema key if supported.

---

### Phase 9 – Metric Registry Wiring (Optional)

**Goal**  
Start using the generic `MetricRegistry` for relationship preview, or at least prove the pattern for future metrics.

**Scope**
- Metric registry and preview endpoints.

**Key Steps**
1. Register relationship evaluators with the global metric registry in `domain/metrics/__init__.py` or route startup:
   ```py
   registry = get_metric_registry()
   registry.register(MetricType.RELATIONSHIP_TIER, evaluate_relationship_tier)
   registry.register(MetricType.RELATIONSHIP_INTIMACY, evaluate_relationship_intimacy)
   ```
2. In preview endpoints, optionally fetch evaluators via the registry instead of calling them directly.
3. This step is optional and can be deferred if keeping relationship preview endpoints simple is preferred; the main goal is to ensure the registry is either used or consciously left for future metrics.

---

### Phase 10 – Documentation Updates

**Goal**  
Update docs so world authors and tool developers understand how world schemas are used and validated.

**Scope**
- `RELATIONSHIPS_AND_ARCS.md`, `SYSTEM_OVERVIEW.md`, and possibly a new `WORLD_SCHEMAS.md` section.

**Key Steps**
1. Document:
   - Where relationship/intimacy schemas live (`GameWorld.meta.*`).
   - How they are validated.
   - How sessions link to worlds and how normalization uses these schemas.
2. Add a short “Schema Troubleshooting” section explaining:
   - What happens when schemas are invalid (validation errors).
   - How to safely evolve schemas over time.
3. Cross‑link this task from Task 07 (preview API) and Task 08 (social metrics) so future work on metrics and relationships is aware of world‑aware normalization and schema validation.

