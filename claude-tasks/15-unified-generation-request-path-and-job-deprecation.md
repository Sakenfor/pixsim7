**Task: Unified Generation Request Path & Legacy Job Deprecation (Multi‑Phase)**

> **For Agents (How to use this file)**
> - This file is a **roadmap/status document** for consolidating generation paths; it’s not the primary specification.
> - Read these first for authoritative behavior and data shapes:  
>   - `docs/DYNAMIC_GENERATION_FOUNDATION.md` – generation system design  
>   - `docs/GENERATION_PIPELINE_REFACTOR_PLAN.md` – backend migration plan  
>   - `docs/INTIMACY_AND_GENERATION.md` – social context and ratings.
> - Treat `packages/types/src/generation.ts`, `packages/game-core/src/generation/*`, and backend `GenerationService` + `/api/v1/generations` as the **canonical** path for new work.
> - Use this task to remove/confine legacy “job” paths and ad‑hoc request building.

---

## Context

The unified generation model and pipeline are largely in place:

- Backend:
  - `pixsim7_backend/domain/generation.py` defines the unified `Generation`/`GenerationArtifact` model with canonical params and hashing.
  - `pixsim7_backend/services/generation/generation_service.py` orchestrates provider calls.
  - New endpoints in `pixsim7_backend/api/v1/generations.py` (and corresponding route plugin) expose `/api/v1/generations/*`.
  - Migrations have created `generations` tables and updated foreign keys.
- Frontend / Types:
  - `packages/types/src/generation.ts` defines `GenerationNodeConfig`, `GenerateContentRequest/Response`, `GenerationSocialContext`.
  - `packages/game-core/src/generation/requestBuilder.ts` builds requests from `GenerationNodeConfig`.
  - `packages/game-core/src/generation/validator.ts` validates configs and social context.

However, some **legacy “job” concepts and ad‑hoc request paths** still exist:

- Backward‑compatibility aliases:
  - `Job = Generation`, `GenerationArtifact = Generation` in some domain modules.
- Historical job service code and docs that refer to “jobs” instead of “generations”.
- Older frontend flows that assemble `GenerateContentRequest` directly, bypassing `buildGenerateContentRequest()` and/or omitting `social_context`, `prompt_config`, or consistent cache keys.

This task consolidates everything onto **one generation request path** and deprecates the legacy job APIs and patterns.

---

## Phase Checklist

- [ ] **Phase 1 – Inventory All Generation Request Paths**
- [ ] **Phase 2 – Confirm Canonical Request Shape & Path**
- [ ] **Phase 3 – Route All New Work Through Request Builder**
- [ ] **Phase 4 – Wrap or Migrate Existing Ad‑Hoc Request Builders**
- [ ] **Phase 5 – Confine Legacy Job Aliases & Code Paths**
- [ ] **Phase 6 – Update Frontend to Use Unified Endpoint(s) Only**
- [ ] **Phase 7 – Tests & Backward Compatibility Checks**
- [ ] **Phase 8 – Clean Up Docs (Jobs → Generations)**
- [ ] **Phase 9 – Deprecation Notice & Grace Period**
- [ ] **Phase 10 – Final Removal of Dead Code (Optional)**

---

### Phase 1 – Inventory All Generation Request Paths

**Goal**  
Get a clear list of everywhere `GenerateContentRequest`‑like payloads are constructed and sent.

**Scope**
- Backend + frontend + game-core.

**Key Steps**
1. Search codebase for:
   - `GenerateContentRequest` usage (TS/types and doc references).
   - Backend endpoints that accept generation‑like payloads.
   - Any remaining “job” endpoints/services related to content generation.
2. Categorize each call site:
   - **Canonical**: uses `buildGenerateContentRequest()` and `/api/v1/generations`.
   - **Ad‑hoc**: manually builds payloads or calls legacy job endpoints.
3. Summarize findings in this file (short table is enough) to drive subsequent phases.

---

### Phase 2 – Confirm Canonical Request Shape & Path

**Goal**  
Define the single canonical request shape and API path for generation.

**Scope**
- Clarification/confirmation; minimal code changes.

**Key Steps**
1. Confirm the canonical contract:
   - `GenerateContentRequest` in `packages/types/src/generation.ts`.
   - Backend request schemas in `pixsim7_backend/shared/schemas/generation_schemas.py`.
2. Confirm canonical entrypoint:
   - `POST /api/v1/generations` (and any related validation endpoints).
3. Document in this file and/or `DYNAMIC_GENERATION_FOUNDATION.md` that **new work must use**:
   - `GenerationNodeConfig` → `buildGenerateContentRequest()` → `/api/v1/generations`.

---

### Phase 3 – Route All New Work Through Request Builder

**Goal**  
Ensure all new generation features use `buildGenerateContentRequest()` as their request assembly path.

**Scope**
- Frontend/game-core only; policy for future code.

**Key Steps**
1. In `packages/game-core/src/generation/requestBuilder.ts`:
   - Confirm it can cover all needed use cases (e.g. NPC response, transitions, variations).
2. In docs and comments:
   - Make it explicit that this builder is the **only supported way** to construct `GenerateContentRequest` from editor/graph nodes.
3. Ensure exports from `@pixsim7/game-core` surface `buildGenerateContentRequest` clearly for frontend consumption.

---

### Phase 4 – Wrap or Migrate Existing Ad‑Hoc Request Builders

**Goal**  
Gradually migrate any existing ad‑hoc request construction code to the canonical builder.

**Scope**
- Frontend + any orchestration code that still builds payloads by hand.

**Key Steps**
1. For each ad‑hoc builder identified in Phase 1:
   - Replace its internal implementation with a call to `buildGenerateContentRequest()` (or a thin adapter).
   - Ensure any extra fields (e.g. debug flags) are either:
     - Modeled properly in `GenerationNodeConfig` / request types, or
     - Removed/migrated to better places.
2. Where direct `fetch`/`axios` calls to legacy endpoints exist:
   - Switch them to call the unified `/api/v1/generations` endpoint with the canonical request object.
3. Keep old symbols as thin adapters for a while, but document them as deprecated.

---

### Phase 5 – Confine Legacy Job Aliases & Code Paths

**Goal**  
Limit “job” concepts to compatibility shims and prevent new usages.

**Scope**
- Backend domain and services.

**Key Steps**
1. Locate aliases and legacy code:
   - Any `Job = Generation`, `GenerationArtifact = Generation` aliases.
   - Old job service modules (`job_service.py`) that are no longer used.
2. Move/annotate these as:
   - Internal compat shims (e.g. inside a `compat` module), or
   - Clearly deprecated with comments and/or `DeprecationWarning` usage.
3. Ensure no **new** call sites reference `Job`/`GenerationArtifact` directly; they should use `Generation` concepts instead.

---

### Phase 6 – Update Frontend to Use Unified Endpoint(s) Only

**Goal**  
Ensure the frontend only targets the unified generation endpoint(s), not legacy jobs.

**Scope**
- Frontend networking / API client modules.

**Key Steps**
1. Identify any custom API clients in `frontend/src/lib/api` or modules that:
   - POST to old job endpoints.
   - Expect legacy job responses.
2. Replace those with:
   - API client methods that call `/api/v1/generations` (and optional `/validate` endpoints).
   - The standardized `GenerateContentRequest/Response` types from `@pixsim7/types`.
3. Update any test fixtures or mocks to use the new endpoints and response shapes.

---

### Phase 7 – Tests & Backward Compatibility Checks

**Goal**  
Verify that migration to the unified path doesn’t break existing behavior and that no code still depends on legacy paths unknowingly.

**Scope**
- Backend + frontend/game-core tests.

**Key Steps**
1. Add or update backend tests for:
   - `GenerationService` behavior via `/api/v1/generations`.
   - Any remaining compat shims (to ensure they still map correctly during the grace period).
2. Add or update frontend tests for:
   - Generation node editor → request builder → API calls → response handling.
3. Grep for legacy job endpoint URLs or job service usage and ensure none remain in active code paths.

---

### Phase 8 – Clean Up Docs (Jobs → Generations)

**Goal**  
Align documentation with the unified generation model and remove confusing “job” terminology where it’s no longer accurate.

**Scope**
- Docs only.

**Key Steps**
1. Update:
   - `docs/GENERATION_PIPELINE_REFACTOR_PLAN.md` to reflect the completed migration and current state.
   - `docs/DYNAMIC_GENERATION_FOUNDATION.md` and `docs/INTIMACY_AND_GENERATION.md` to reference `Generation`/`GenerationService` exclusively.
2. Add a short note in any remaining doc that mentions jobs, clarifying that:
   - The term now refers to historical design; the live system uses `Generation` everywhere.

---

### Phase 9 – Deprecation Notice & Grace Period

**Goal**  
Provide a clear path for any external tools or plugins that might still hit legacy job APIs (if any exist).

**Scope**
- Optional, depending on whether legacy endpoints are still exposed.

**Key Steps**
1. If any legacy job endpoints remain public:
   - Add deprecation warnings in responses (e.g. `X-Deprecated` headers or structured warnings).
   - Document the replacement endpoints and request shapes.
2. Decide on a reasonable grace period (e.g. 1–2 versions) before full removal.

---

### Phase 10 – Final Removal of Dead Code (Optional)

**Goal**  
Remove truly unused legacy job code after a safe grace period, if desired.

**Scope**
- Backend code cleanup only.

**Key Steps**
1. Once confident that:
   - All active code uses the unified path.
   - No external dependencies rely on job endpoints.
2. Remove:
   - Legacy job service modules.
   - Aliases that are no longer referenced.
   - Deprecated docs that describe job behaviors.
3. Update this file’s checklist and notes to reflect that the system is fully unified.

---

**Related Docs & Files**

- Docs:  
  - `docs/DYNAMIC_GENERATION_FOUNDATION.md` – generation system overview  
  - `docs/GENERATION_PIPELINE_REFACTOR_PLAN.md` – migration details  
  - `docs/INTIMACY_AND_GENERATION.md` – social context and ratings
- Backend:  
  - `pixsim7_backend/domain/generation.py`  
  - `pixsim7_backend/services/generation/generation_service.py`  
  - `pixsim7_backend/api/v1/generations.py`  
  - `pixsim7_backend/shared/schemas/generation_schemas.py`  
  - Legacy job service modules / aliases (to be confined)
- Game-core / Types:  
  - `packages/types/src/generation.ts`  
  - `packages/game-core/src/generation/requestBuilder.ts`  
  - `packages/game-core/src/generation/validator.ts`  
  - `frontend/src/components/inspector/GenerationNodeEditor.tsx` and any generation orchestration code

