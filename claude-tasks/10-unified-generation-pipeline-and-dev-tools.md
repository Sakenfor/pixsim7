**Task: Unified Generation Pipeline & Dev Tooling (Multi‑Phase)**

**Context**
- The project has a unified generation domain in `pixsim7_backend/domain/generation.py` with a modern `Generation`/`GenerationArtifact` model.
- Dynamic generation has a clear design via:
  - `docs/DYNAMIC_GENERATION_FOUNDATION.md`
  - `docs/GENERATION_PIPELINE_REFACTOR_PLAN.md`
  - `docs/PROMPT_VERSIONING_SYSTEM.md`, `NARRATIVE_PROMPT_ENGINE_SPEC.md`, etc.
- Frontend/editor integration is partially implemented via:
  - `packages/types/src/generation.ts` (`GenerationNodeConfig`, `GenerateContentRequest/Response`, `GenerationSocialContext`).
  - Generation node support in the graph editor.
  - `packages/game-core/src/generation/requestBuilder.ts` and `generation/validator.ts`.
- Tasks 07–09 introduce:
  - A metrics/preview system for relationships and social state.
  - Intimacy‑aware `GenerationSocialContext` for embedding relationship context into generation.

We want to **finish and harden** the end‑to‑end generation pipeline:
- From editor/graph → `GenerateContentRequest` → `Generation` record → asset → dev tooling.
- With social/intimacy context, validation, caching, and observability aligned with the design docs.

> **For agents:** Treat this task as the umbrella for “generation pipeline v1.0 reality”. Only move deeper phases to `[x]` when you verify the implementation against the referenced docs and code.

### Phase Checklist

- [x] **Phase 1 – Confirm Migration to Unified `Generation` Model**  
  *Core model and service exist (Generation/GenerationArtifact, provider abstraction, GenerationService) – 2025‑11‑19*
- [~] **Phase 2 – Wire Frontend Generation Nodes to Generation Service**  
  *Generation nodes and request builder exist; full `GenerateContentRequest` → backend wiring needs verification*
- [ ] **Phase 3 – Prompt Versioning & `prompt_config` Integration**
- [ ] **Phase 4 – Social Context & Intimacy Integration**
- [ ] **Phase 5 – Validation & Health Panel for Generation Nodes**
- [ ] **Phase 6 – Caching, Determinism & Seed Strategy**
- [ ] **Phase 7 – Telemetry: Cost, Latency, Provider Health**
- [ ] **Phase 8 – Safety & Content Rating Enforcement**
- [ ] **Phase 9 – Regression Harness for Generations**
- [ ] **Phase 10 – Developer Tools & App Map Integration**

---

**CURRENT IMPLEMENTATION STATUS (2025‑11‑19)**

### ✅ Implemented

- **Generation Domain & Model**
  - `pixsim7_backend/domain/generation.py` defines the unified model (Generation/GenerationArtifact) with:
    - `operation_type`, `provider_id`, `inputs`, `canonical_params`
    - `reproducible_hash` (SHA‑256) for deduplication.
    - Status fields and timestamps for orchestration.
  - Alembic migrations in `infrastructure/database/migrations/versions/*` create/update the `generations` tables.

- **Provider Abstraction**
  - Backend provider interface with:
    - An abstract `execute()` method.
    - A `GenerationResult` dataclass/structure.
    - Per‑provider parameter mapping and capabilities.
  - Integration with account management / provider selection.

- **GenerationService**
  - `pixsim7_backend/services/generation/generation_service.py`:
    - Orchestrates provider calls.
    - Creates and updates `Generation`/`GenerationArtifact` records.
    - Handles basic error states and mapping from requests to providers.

- **Frontend Types & Helpers**
  - `packages/types/src/generation.ts`:
    - `GenerationNodeConfig`, `GenerateContentRequest`, `GenerationSocialContext`.
  - `packages/game-core/src/generation/requestBuilder.ts`:
    - `buildGenerateContentRequest` and `computeCacheKey`.
    - Social context integration via `buildGenerationSocialContext`.
  - `packages/game-core/src/generation/validator.ts`:
    - Validates generation node configs and social context against world/user constraints.

### ⏳ Pending / Needs Verification

- Frontend → backend wiring:
  - Confirm that all generation nodes in the editor:
    - Build `GenerateContentRequest` via the request builder.
    - Call the unified generation endpoint (not legacy job endpoints).
    - Result in `Generation`/`GenerationArtifact` records managed by `GenerationService`.
- Prompt versioning / `prompt_config`:
  - Ensure `GenerateContentRequest` carries enough metadata to populate `prompt_config` on `Generation`.
  - Confirm behavior matches `PROMPT_VERSIONING_SYSTEM.md`.
- Social context enforcement:
  - Backend currently accepts `social_context` on `GenerateContentRequest` (per Task 09 design).
  - Enforcement of world/user max content rating, and storage of social context on `Generation`, is still pending.

Use the phases below to track completion of each area.

---

### Phase 1 – Confirm Migration to Unified `Generation` Model

**Goal**  
Ensure all new generation work uses the unified `Generation` model instead of legacy Job/GenerationArtifact paths.

**Scope**
- Backend models and services.

**Key Steps**
1. Audit backend:
   - Confirm where `Generation`/`GenerationArtifact` is used (`domain/generation.py`, `services/generation/generation_service.py`).
   - Identify any places still referencing old job/generation tables or models.
2. Check migrations per `GENERATION_PIPELINE_REFACTOR_PLAN.md`:
   - `generations` tables created and wired to upstream/downstream tables.
   - References from `provider_submissions`, `assets`, etc. updated to use generation IDs.
3. For any remaining legacy paths:
   - Mark them deprecated.
   - Add TODOs or follow‑up tasks to remove/migrate.

---

### Phase 2 – Wire Frontend Generation Nodes to Generation Service

**Goal**  
Make sure Generation Nodes in the editor actually drive requests to the unified generation service and record `Generation` rows.

**Scope**
- Frontend + backend integration; no prompt logic changes yet.

**Key Steps**
1. Confirm `GenerationNodeConfig` and `GenerateContentRequest` in `packages/types/src/generation.ts` are used by:
   - The React Flow node components for generation.
   - Any generation API client in `frontend/src/lib/api` or similar.
2. Update the frontend client to:
   - Call the unified generation endpoint (per `DYNAMIC_GENERATION_FOUNDATION.md` / refactor plan).
   - Ensure requests are mapped to `GenerationService` (unified path).
3. Remove or wrap any usage of older “job” endpoints so new work only hits the unified generation path.

Mark this phase `[x]` when:
- Generation nodes send `GenerateContentRequest` objects that hit the unified generation endpoint.
- You can see corresponding `Generation` records in the database for node executions.

---

### Phase 3 – Prompt Versioning & `prompt_config` Integration

**Goal**  
Use the structured prompt versioning system (`prompt_config`) as the canonical source for generation prompts.

**Scope**
- Backend `Generation` model and services.

**Key Steps**
1. Confirm how `prompt_version_id` and `prompt_config` are used in `Generation`:
   - `prompt_version_id` (legacy direct reference).
   - `prompt_config` (structured config with `versionId`, `familyId`, `autoSelectLatest`, variables).
2. Implement or refine logic in `generation_service` to:
   - Resolve the actual prompt from `prompt_config` (version/family lookups).
   - Avoid depending on ad‑hoc `final_prompt` except for debugging/testing.
3. Ensure `GenerateContentRequest` includes enough information (prompt config IDs, variables) to populate `prompt_config`.
4. Align with `PROMPT_VERSIONING_SYSTEM.md` and `NARRATIVE_PROMPT_ENGINE_SPEC.md` for core use cases.

---

### Phase 4 – Social Context & Intimacy Integration

**Goal**  
Attach relationship/intimacy context (from Task 09) to generation requests and their persisted `Generation` records.

**Scope**
- Social context only; no explicit prompt text changes.

**Key Steps**
1. From Task 09, ensure `GenerationSocialContext` is fully defined in `packages/types/src/generation.ts`.
2. Confirm `buildGenerateContentRequest` in `packages/game-core/src/generation/requestBuilder.ts`:
   - Calls `buildGenerationSocialContext` for relevant nodes.
   - Attaches `social_context` to `GenerateContentRequest`.
3. In the backend generation API/service:
   - Accept `social_context` in request payloads.
   - Store it on `Generation` records (e.g. in a JSON field).
4. Add basic tests:
   - A request with a certain `intimacyBand`/`contentRating` results in a `Generation` record whose `social_context` matches.

---

### Phase 5 – Validation & Health Panel for Generation Nodes

**Goal**  
Surface validation and health information for generation nodes in the editor.

**Scope**
- Validation logic (TS) + dev‑only UI.

**Key Steps**
1. Extend `generation/validator.ts` to:
   - Check for missing or inconsistent fields (strategy, duration, constraints).
   - Validate social context vs world/user constraints (Task 09).
2. Expose validation results in the Generation Node UI:
   - Node badges (OK/warn/error).
   - A validation section in the side panel summarizing issues.
3. (Optional) Add a “Generation Health” view:
   - Aggregates node validation status across a project/world.

---

### Phase 6 – Caching, Determinism & Seed Strategy

**Goal**  
Finalize how caching and determinism work for generations.

**Scope**
- Backend `Generation` hash + cache keys; no user‑facing UI.

**Key Steps**
1. Ensure `Generation.compute_hash` (or equivalent) is used consistently to derive deterministic keys from:
   - `canonical_params`.
   - `inputs`.
2. Align cache key patterns with `DYNAMIC_GENERATION_FOUNDATION.md`:
   - `[type]|[purpose]|[fromSceneId]|[toSceneId]|[strategy]|[seed]|[version]`, etc.
3. Implement or confirm:
   - In‑memory and Redis cache layers.
   - Optional locking/guardrails to prevent stampedes.
4. Document and enforce seed strategies:
   - `playthrough`, `player`, `fixed`, `timestamp`.
   - How they feed into both `canonical_params` and cache keys.

---

### Phase 7 – Telemetry: Cost, Latency, Provider Health

**Goal**  
Capture and surface key metrics for generation: cost, latency, provider health.

**Scope**
- Backend metrics collection + dev tooling.

**Key Steps**
1. Extend `Generation` or associated tables to record:
   - Latency (derivable from timestamps).
   - Token or compute cost metadata (if available).
   - Provider health info when available.
2. Add helper functions/queries to compute:
   - p95 latency per provider/operation type.
   - Error rates and failure patterns.
3. Surface these metrics in a dev panel (Generation Health, App Map, or separate route).

---

### Phase 8 – Safety & Content Rating Enforcement

**Goal**  
Ensure generation requests respect world/user content rating constraints at the generation layer, not just in context building.

**Scope**
- Enforcement logic; no explicit content details.

**Key Steps**
1. At the generation service boundary, inspect `GenerationSocialContext`:
   - Compare `contentRating` with:
     - World `maxContentRating` (from world meta).
     - User `maxContentRating` (from preferences), when available.
2. If a request violates constraints:
   - Clamp the rating and adjust prompts/config accordingly, **or**
   - Reject the request and log a structured error.
3. Log violations and surface them in dev tools so misconfigured nodes/worlds can be fixed early.

---

### Phase 9 – Regression Harness for Generations

**Goal**  
Add tests and fixtures to catch regressions in generation behavior, especially around parameters and social context.

**Scope**
- Test code only; no new features.

**Key Steps**
1. Create fixtures representing:
   - Several `GenerationNodeConfig` examples (simple/complex).
   - Worlds with different generation configs and social contexts.
2. For each fixture:
   - Build `GenerateContentRequest` via the request builder.
   - Create `Generation` records via `generation_service`.
   - Assert:
     - Correct canonical params and hash behavior.
     - Prompt config wiring (version/family/variables).
     - Social context presence and clamping.
3. Use deterministic seeds where needed to make regressions visible via hash changes.

---

### Phase 10 – Developer Tools & App Map Integration

**Goal**  
Expose the generation pipeline in dev tooling so developers can see end‑to‑end flows and debug issues quickly.

**Scope**
- Dev‑facing UI; no runtime gameplay changes.

**Key Steps**
1. Extend `/app-map` or add a dedicated Generation Dev Panel to:
   - List recent `Generation` records (filter by world, provider, status).
   - Show operation type, prompt source, social context, status, timings.
2. Add drill‑down from:
   - Generation Nodes in the graph editor → related `Generation` records.
   - App Map feature listings → generation routes and operations.
3. Document how to use these tools in `APP_MAP.md` or a short dev guide (e.g. “Debugging Generation Pipelines”).

