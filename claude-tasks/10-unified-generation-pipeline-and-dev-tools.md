**Task: Unified Generation Pipeline & Dev Tooling (Multi‑Phase)**

**Context**
- The project has a unified `Generation` model in `pixsim7_backend/domain/generation.py` that replaces the previous Job + GenerationArtifact split.
- Dynamic generation has a clear design via:
  - `docs/DYNAMIC_GENERATION_FOUNDATION.md`
  - `docs/GENERATION_PIPELINE_REFACTOR_PLAN.md`
  - `docs/PROMPT_VERSIONING_SYSTEM.md`, `NARRATIVE_PROMPT_ENGINE_SPEC.md`, etc.
- Frontend/editor integration is planned/partial via:
  - `packages/types/src/generation.ts` (`GenerationNodeConfig`, `GenerateContentRequest/Response`, etc.).
  - Graph/Node editor docs and components for Generation Nodes.
- Tasks 07–09 introduce:
  - A metrics/preview system for relationships and social state.
  - Intimacy‑aware `GenerationSocialContext` for embedding relationship context into generation.

We want to **finish and harden** the end‑to‑end generation pipeline:
- From editor/graph → `GenerateContentRequest` → `Generation` record → asset → dev tooling.
- With social/intimacy context, validation, caching, and observability aligned with the design docs.

> **For agents:** Treat this task as the umbrella for “generation pipeline v1.0 reality”. Only start deeper phases once earlier ones (and dependent tasks 07–09) are in a good state.

### Phase Checklist

- [ ] **Phase 1 – Confirm Migration to Unified `Generation` Model**
- [ ] **Phase 2 – Wire Frontend Generation Nodes to Generation Service**
- [ ] **Phase 3 – Prompt Versioning & `prompt_config` Integration**
- [ ] **Phase 4 – Social Context & Intimacy Integration**
- [ ] **Phase 5 – Validation & Health Panel for Generation Nodes**
- [ ] **Phase 6 – Caching, Determinism & Seed Strategy**
- [ ] **Phase 7 – Telemetry: Cost, Latency, Provider Health**
- [ ] **Phase 8 – Safety & Content Rating Enforcement**
- [ ] **Phase 9 – Regression Harness for Generations**
- [ ] **Phase 10 – Developer Tools & App Map Integration**

---

### Phase 1 – Confirm Migration to Unified `Generation` Model

**Goal**  
Ensure all new generation work uses the unified `Generation` model instead of legacy Job/GenerationArtifact paths.

**Scope**
- Backend models and services.

**Key Steps**
1. Audit backend:
   - Confirm where `Generation` is used (`pixsim7_backend/domain/generation.py`, `services/generation/generation_service.py`).
   - Identify any places still referencing old job/generation artifact models or tables.
2. Check migrations as per `GENERATION_PIPELINE_REFACTOR_PLAN.md`:
   - `generations` table created.
   - References from `provider_submissions`, `assets`, etc. updated to use `generation_id` / `source_generation_id`.
3. If any legacy code paths remain:
   - Mark them as deprecated and plan removal or migration in this file.

---

### Phase 2 – Wire Frontend Generation Nodes to Generation Service

**Goal**  
Make sure Generation Nodes in the editor actually drive requests to the unified generation service and record `Generation` rows.

**Scope**
- Frontend → backend integration; no prompt logic changes yet.

**Key Steps**
1. Confirm `GenerationNodeConfig` and `GenerateContentRequest` in `packages/types/src/generation.ts` are used by:
   - The React Flow node components for generation.
   - Any existing generation API client in frontend/lib.
2. Update the frontend client to:
   - Call the unified generation endpoint (per `DYNAMIC_GENERATION_FOUNDATION.md` / refactor plan).
   - Ensure requests are mapped to `Generation` creation via `generation_service`.
3. Remove or wrap any usage of older “job” endpoints so new work only hits the unified generation path.

---

### Phase 3 – Prompt Versioning & `prompt_config` Integration

**Goal**  
Use the structured prompt versioning system (prompt versions & `prompt_config`) as the canonical source for generation prompts.

**Scope**
- Backend `Generation` model and services.

**Key Steps**
1. Confirm how `prompt_version_id` and `prompt_config` are used in `Generation`:
   - `prompt_version_id` (legacy direct reference).
   - `prompt_config` (structured config with `versionId`, `familyId`, `autoSelectLatest`, variables).
2. Implement or refine logic in `generation_service` to:
   - Resolve the actual prompt from `prompt_config` (version/family lookups).
   - Avoid relying on `final_prompt` inline except for testing/dev.
3. Ensure `GenerateContentRequest` feeds enough info (prompt config IDs, variables) to populate `prompt_config` on `Generation` records.
4. Align with `PROMPT_VERSIONING_SYSTEM.md` and `NARRATIVE_PROMPT_ENGINE_SPEC.md` (at least for core use cases).

---

### Phase 4 – Social Context & Intimacy Integration

**Goal**  
Attach relationship/intimacy context (from Task 09) to generation requests and their persisted `Generation` records.

**Scope**
- Social context only; no explicit prompt text.

**Key Steps**
1. From Task 09, ensure `GenerationSocialContext` exists in `generation.ts` and is threaded into:
   - `GenerationNodeConfig`.
   - `GenerateContentRequest`.
2. In the generation request path:
   - Call the helper that builds `GenerationSocialContext` (using `tierId`, `intimacyLevelId`, world/user config).
   - Attach this to `GenerateContentRequest`.
3. In `generation_service`:
   - Persist `GenerationSocialContext` as part of `canonical_params` or a dedicated field.
   - Ensure this context is available to the prompt‑building layer and metrics.

---

### Phase 5 – Validation & Health Panel for Generation Nodes

**Goal**  
Implement validation and exploration tooling for Generation Nodes, per the roadmap in `DYNAMIC_GENERATION_FOUNDATION.md`.

**Scope**
- Validation logic (backend or frontend) and dev‑facing panel.

**Key Steps**
1. Implement or finish the validation rules described in `DYNAMIC_GENERATION_FOUNDATION.md`:
   - Duration constraints.
   - Fallback configuration correctness.
   - Strategy viability warnings (e.g. `always` + high‑cost assets).
   - Social/rating constraints from Task 09 (Phase 8).
2. Expose validation results in the Generation Node UI:
   - Node badges (OK/warn/error).
   - A validation tab or section in the side panel summarizing issues.
3. Optionally add a “Generation Health” view (could be part of App Map) aggregating:
   - Node validation statuses.
   - Common configuration problems.

---

### Phase 6 – Caching, Determinism & Seed Strategy

**Goal**  
Finalize how caching and determinism work for generations (as per the design docs).

**Scope**
- Backend `Generation` hash + cache keys; no UI.

**Key Steps**
1. Ensure `Generation.compute_hash` is used consistently to derive deterministic keys from:
   - `canonical_params`.
   - `inputs`.
2. Align the cache key pattern with `DYNAMIC_GENERATION_FOUNDATION.md`:
   - `[type]|[purpose]|[fromSceneId]|[toSceneId]|[strategy]|[seed]|[version]`, etc.
3. Implement or confirm:
   - In‑memory and Redis cache layers.
   - Optional durable storage lockouts to prevent stampedes.
4. Document and enforce seed strategies:
   - `playthrough`, `player`, `fixed`, `timestamp` seeds.
   - How they map into `canonical_params` and hash computation.

---

### Phase 7 – Telemetry: Cost, Latency, Provider Health

**Goal**  
Capture and surface key metrics for generation: cost, latency, provider health.

**Scope**
- Backend fields and dev tooling; no strict product UI.

**Key Steps**
1. Extend `Generation` or associated tables to record:
   - Latency (already derivable from timestamps).
   - Token or compute cost metadata.
   - Provider health info when available.
2. Add basic aggregation queries or helper functions to compute:
   - p95 latency per provider / operation type.
   - Error rates.
3. Surface these metrics in a dev panel (Generation Health, App Map, or separate route).

---

### Phase 8 – Safety & Content Rating Enforcement

**Goal**  
Ensure generation requests respect world/user content rating constraints at the generation layer, not just in context building.

**Scope**
- Enforcement logic; no content details.

**Key Steps**
1. At the generation service boundary, inspect `GenerationSocialContext`:
   - Compare `contentRating` with:
     - World `maxContentRating` (from world meta).
     - User `maxContentRating` (from preferences), when available.
2. If a request violates constraints:
   - Either clamp the rating and adjust prompt config accordingly, or
   - Reject the request and log a structured error.
3. Log violations and surface them in dev tools so misconfigured nodes/worlds can be fixed early.

---

### Phase 9 – Regression Harness for Generations

**Goal**  
Add tests and fixtures to catch regressions in generation behavior, especially around parameters and social context.

**Scope**
- Test code only; no new features.

**Key Steps**
1. Create test fixtures representing:
   - A few representative GenerationNodeConfigs (simple transition, complex variation).
   - Worlds with different generation configs and social contexts.
2. For each fixture:
   - Build `GenerateContentRequest`.
   - Create `Generation` records via `generation_service`.
   - Assert:
     - Correct canonical parameters.
     - Prompt config wiring (version/family/variables).
     - Social context presence and clamping.
3. Include seeds for deterministic runs where appropriate so changes in params can be detected via hash differences.

---

### Phase 10 – Developer Tools & App Map Integration

**Goal**  
Expose the generation pipeline in dev tooling so developers can see end‑to‑end flows and debug issues quickly.

**Scope**
- Dev‑facing UI; no runtime gameplay changes.

**Key Steps**
1. Extend `/app-map` or add a dedicated Generation Dev Panel to:
   - List recent `Generation` records (filter by world, provider, status).
   - Show key fields: operation type, prompt source, social context, status, timings.
2. Add drill‑down from:
   - Generation Nodes in the graph editor → related `Generation` records.
   - App Map feature listings → generation routes and operations.
3. Document how to use these tools in `APP_MAP.md` or a short dev guide (e.g. “Debugging Generation Pipelines”).

