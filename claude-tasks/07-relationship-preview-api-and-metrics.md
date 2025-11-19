**Task: Relationship Preview API & Metric-Based Derivations (Multi‑Phase)**

**Context**
- Today, relationship tiers and intimacy levels are computed:
  - **Backend (Python)** in `pixsim7_backend/domain/narrative/relationships.py` using world schemas.
  - **Game-core (TS)** in `packages/game-core/src/relationships/computation.ts` as a mirrored fallback.
- Frontend now imports only from game-core, but there is still **duplicated logic** between backend and TS.
- We want:
  - Backend to be the **only authority** for relationship calculations that affect persisted state.
  - A small, **backend‑powered “preview API”** that editors/tools can call to see “what would this tier/intimacy be?”.
  - A **metric‑based pattern** that can later handle other derived social/sim values (e.g. NPC mood, reputation bands) without adding more TS math.

Below are 10 phases for killing the TS fallback logic and introducing a reusable preview API/metric system.

> **For agents:** This task affects both backend and game-core. Keep the layering strict: backend = authority, game-core = typed accessors + preview wrappers, frontend = pure consumer. Update the checklist and add notes (files/PR/date) as phases land.

### Phase Checklist

- [ ] **Phase 1 – Audit Current Relationship Computation & Call Sites**
- [ ] **Phase 2 – Design Preview API & Metric Abstraction**
- [ ] **Phase 3 – Implement Backend Relationship Preview Endpoint(s)**
- [ ] **Phase 4 – Add Game-Core TS Wrappers & Types**
- [ ] **Phase 5 – Migrate Editor/Tooling to Preview API**
- [ ] **Phase 6 – Remove TS Fallback Logic for Relationships**
- [ ] **Phase 7 – Generalize Metric System for Future Social/Sim Derivations**
- [ ] **Phase 8 – Documentation & App Map Updates**
- [ ] **Phase 9 – Regression & Behavior Validation**
- [ ] **Phase 10 – Optional Offline Tooling Strategy**

---

### Phase 1 – Audit Current Relationship Computation & Call Sites

**Goal**  
Get a precise picture of where relationship math lives and how it’s used, to scope the change safely.

**Scope**
- Backend and game-core relationship computations.
- All TS call sites that depend on `compute_relationship_tier` / `compute_intimacy_level`.

**Key Steps**
1. Backend:
   - Confirm current logic in:
     - `pixsim7_backend/domain/narrative/relationships.py`
     - Any services calling `compute_relationship_tier` / `compute_intimacy_level` (e.g. `game_session_service.py`).
   - Note how world schemas are passed (e.g. `relationship_schemas`, `intimacy_schema`).
2. Game-core:
   - Identify all imports of `compute_relationship_tier`, `compute_intimacy_level`, and `extract_relationship_values` in:
     - `packages/game-core/src/relationships/computation.ts`
     - `session/state.ts`, `PixSim7Core`, tests, and any other files.
3. Frontend:
   - Confirm that frontend only calls relationship helpers through game-core (no stray copies).
4. Produce a short summary in this file (or a small dev note) listing:
   - “Authoritative computation: backend functions X/Y.”
   - “TS depends on these functions at call sites A/B for previews/editor only.”

---

### Phase 2 – Design Preview API & Metric Abstraction

**Goal**  
Define a small, extensible API on the backend for relationship previews and future social/sim metrics.

**Scope**
- API shape and JSON payload/response formats.
- A generic “metric” pattern that can support more than relationships later.

**Key Steps**
1. Decide on API structure, e.g. either:
   - Separate endpoints:
     - `POST /api/v1/game/relationships/preview-tier`
     - `POST /api/v1/game/relationships/preview-intimacy`
   - Or a generic endpoint:
     - `POST /api/v1/game/preview` with:
       ```jsonc
       {
         "world_id": 1,
         "metric": "relationship_tier" | "relationship_intimacy",
         "payload": { ... }
       }
       ```
2. For relationships, specify request/response contracts, e.g.:
   - Tier preview:
     ```jsonc
     // Request
     {
       "world_id": 1,
       "affinity": 72.0
     }
     // Response
     {
       "tier_id": "close_friend",
       "schema_key": "default"
     }
     ```
   - Intimacy preview:
     ```jsonc
     {
       "world_id": 1,
       "relationship_values": {
         "affinity": 72.0,
         "trust": 40.0,
         "chemistry": 65.0,
         "tension": 20.0
       }
     }
     ```
3. Define a minimal abstraction for future metrics (e.g. `metric: string`, `payload: object`) so:
   - Relationship preview is the first metric.
   - Future metrics (e.g. `"npc_mood"`, `"reputation_band"`) are easy to add.

---

### Phase 3 – Implement Backend Relationship Preview Endpoint(s)

**Goal**  
Implement the preview API on the backend, reusing existing Python logic and world schemas.

**Scope**
- New read‑only API(s) in the backend.
- No changes to how existing runtime computations work.

**Key Steps**
1. Implement endpoint(s) in the appropriate module, e.g.:
   - `pixsim7_backend/api/v1/game_relationships_preview.py` or within an existing `game` API module.
2. Inside the endpoint:
   - Load `GameWorld` and its `meta.relationship_schemas` / `meta.intimacy_schema` for `world_id`.
   - Call existing functions:
     - `compute_relationship_tier(affinity, relationship_schemas, schema_key)`
     - `compute_intimacy_level(relationship_values, intimacy_schema)`
   - Return JSON using the contracts from Phase 2.
3. Write backend tests to assert:
   - Preview endpoints produce the same result as the existing session‑update logic for a given input + schema.
4. Ensure endpoints do **not** mutate any `GameSession`; they are pure stateless evaluators.

---

### Phase 4 – Add Game-Core TS Wrappers & Types

**Goal**  
Expose typed preview helpers in game-core that call the backend API, replacing local math.

**Scope**
- Only game-core (packages/game-core) and types.
- No frontend logic beyond switching call sites.

**Key Steps**
1. In `@pixsim7/types`, add types for preview responses if needed, e.g.:
   ```ts
   export interface RelationshipTierPreview {
     tierId: string | null;
     schemaKey?: string;
   }

   export interface RelationshipIntimacyPreview {
     intimacyLevelId: string | null;
   }
   ```
2. In `packages/game-core/src/relationships/`, add a small module (e.g. `preview.ts`) that exports:
   ```ts
   export async function previewRelationshipTier(args: {
     worldId: number;
     affinity: number;
   }): Promise<RelationshipTierPreview> { /* calls backend */ }

   export async function previewIntimacyLevel(args: {
     worldId: number;
     affinity: number;
     trust: number;
     chemistry: number;
     tension: number;
   }): Promise<RelationshipIntimacyPreview> { /* calls backend */ }
   ```
3. Wire these through the game-core public API (`packages/game-core/src/index.ts`).
4. Mark existing TS functions `compute_relationship_tier` / `compute_intimacy_level` as deprecated in JSDoc and ensure they are no longer used by new code.

---

### Phase 5 – Migrate Editor/Tooling to Preview API

**Goal**  
Ensure all frontend/editor use cases that need “what would this label be?” use the preview API, not TS math.

**Scope**
- Frontend/editor tools only (scene editor, Relationship dashboards, dev tools).

**Key Steps**
1. Identify UI/editor flows that currently:
   - Call game-core’s `compute_relationship_tier` / `compute_intimacy_level` directly.
   - Or otherwise rely on TS’s fallback math.
2. Replace those calls with:
   - Game-core preview helpers (`previewRelationshipTier`, `previewIntimacyLevel`).
   - Or, where the runtime session already has `tierId`/`intimacyLevelId`, read those from `GameSession.relationships` instead of recomputing.
3. Add minimal UI debouncing where necessary (e.g. sliders) to avoid spamming preview requests.
4. Confirm that **runtime** paths (Game2D, Simulation Playground) do **not** start using preview for canonical state; they should still rely on backend‑computed values in sessions.

---

### Phase 6 – Remove TS Fallback Logic for Relationships

**Goal**  
Eliminate duplicated relationship math from TS so backend is the only place where thresholds are defined.

**Scope**
- `packages/game-core/src/relationships/computation.ts` and any dependent TS tests.

**Key Steps**
1. Once all usages are migrated:
   - Remove or strip down `compute_relationship_tier` and `compute_intimacy_level` from TS.
   - Keep `extract_relationship_values` if still useful (it’s just data extraction, not logic).
2. Update or remove TS tests that assert tier/intimacy logic:
   - Replace them with tests for preview helpers (mock backend responses or run integration tests).
3. Ensure no remaining TS code imports the removed functions.

---

### Phase 7 – Generalize Metric System for Future Social/Sim Derivations

**Goal**  
Turn the relationship preview pattern into a generic “metric preview” system that can support other derived values later.

**Scope**
- Backend preview endpoint(s) and game-core wrappers.

**Key Steps**
1. If not already done, generalize the preview endpoint to accept:
   ```jsonc
   {
     "world_id": 1,
     "metric": "relationship_tier" | "relationship_intimacy" | "npc_mood" | "reputation_band",
     "payload": { ... }
   }
   ```
2. Implement a small metric registry on the backend:
   - Map `metric` strings to evaluator functions and schemas.
3. In game-core, create a generic `previewMetric` helper that:
   - Takes `metric` + payload and returns a typed result (using generics).
4. Keep the relationship preview helpers as thin wrappers around this generic metric preview.

---

### Phase 8 – Documentation & App Map Updates

**Goal**  
Document the new architecture clearly and expose the preview API in dev tooling.

**Scope**
- Docs and App Map.

**Key Steps**
1. Update `docs/RELATIONSHIPS_AND_ARCS.md` to:
   - Emphasize backend as the only authority for tiers/intimacy.
   - Document the preview API as the only way to compute labels for “what‑if” tools.
2. Update `docs/SYSTEM_OVERVIEW.md` and `docs/APP_MAP.md` to:
   - Reference the relationship preview API under game systems.
3. In `06-app-map-and-dev-panel.md` (and the corresponding implementation), consider adding:
   - A small section showing the new preview API under “Capabilities” or “Game Systems”.

---

### Phase 9 – Regression & Behavior Validation

**Goal**  
Ensure the architectural change does not change actual relationship behavior for existing worlds.

**Scope**
- Comparison between “old TS fallback” and “new backend preview” results, for both defaults and custom schemas.

**Key Steps**
1. Create test fixtures with:
   - Default world schemas.
   - At least one world with custom `relationship_schemas` and `intimacy_schema`.
2. For a grid of affinity/trust/chemistry/tension inputs:
   - Compare:
     - Old TS computation (before removal).
     - Backend preview API results.
   - Confirm parity (or document and accept any deliberate differences).
3. For a few existing sessions:
   - Capture current `tierId`/`intimacyLevelId`.
   - Run the preview API offline and confirm it agrees with stored values given the same schemas.

---

### Phase 10 – Optional Offline Tooling Strategy

**Goal**  
Decide how to handle editor tooling when the backend preview API is unavailable (offline or dev issues).

**Scope**
- Optional fallback strategy; keep it simple.

**Key Steps**
1. Decide whether offline preview is required:
   - If **no**: allow preview helpers to fail gracefully (e.g. show “unknown” / “backend unavailable”) and do nothing else.
   - If **yes** for specific workflows: consider keeping a **dev‑only** TS implementation behind a feature flag that is:
     - Clearly marked as “approximate/offline only”.
     - Never used in runtime or tests that care about correctness.
2. Document the chosen policy in `RELATIONSHIPS_AND_ARCS.md` and/or a small `DEV_NOTES.md` section:
   - Make it explicit where approximation is allowed and where it is not.

