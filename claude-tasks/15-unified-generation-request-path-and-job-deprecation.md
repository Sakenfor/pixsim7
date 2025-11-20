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

- [x] **Phase 1 – Inventory All Generation Request Paths**
- [x] **Phase 2 – Confirm Canonical Request Shape & Path**
- [x] **Phase 3 – Route All New Work Through Request Builder**
- [x] **Phase 4 – Wrap or Migrate Existing Ad‑Hoc Request Builders** (Deferred - see status)

- [x] **Phase 5 – Confine Legacy Job Aliases & Code Paths**
- [x] **Phase 6 – Update Frontend to Use Unified Endpoint(s) Only**
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
   - Any remaining "job" endpoints/services related to content generation.
2. Categorize each call site:
   - **Canonical**: uses `buildGenerateContentRequest()` and `/api/v1/generations`.
   - **Ad‑hoc**: manually builds payloads or calls legacy job endpoints.
3. Summarize findings in this file (short table is enough) to drive subsequent phases.

**Status**: ✅ COMPLETED

**Inventory Summary**

| Component | Path/File | Type | Status | Notes |
|-----------|-----------|------|--------|-------|
| **CANONICAL PATH (NEW)** |
| Backend API | `pixsim7_backend/api/v1/generations.py` | Canonical | ✅ Active | Unified generation endpoint |
| Backend Service | `pixsim7_backend/services/generation/generation_service.py` | Canonical | ✅ Active | Core generation service |
| Backend Model | `pixsim7_backend/domain/generation.py` | Canonical | ✅ Active | `Generation` model |
| Backend Schema | `pixsim7_backend/shared/schemas/generation_schemas.py` | Canonical | ✅ Active | `CreateGenerationRequest` |
| Types | `packages/types/src/generation.ts` | Canonical | ✅ Active | `GenerateContentRequest`, `GenerationNodeConfig` |
| Request Builder | `packages/game-core/src/generation/requestBuilder.ts` | Canonical | ⚠️ Not Used | `buildGenerateContentRequest()` - reference implementation |
| Validator | `packages/game-core/src/generation/validator.ts` | Canonical | ✅ Used | `validateGenerationNode()` |
| **LEGACY PATH (TO DEPRECATE)** |
| Backend API | `pixsim7_backend/api/v1/jobs.py` | Legacy | 🔄 Active | Wraps GenerationService, compatibility layer |
| Backend Service | `pixsim7_backend/services/job/job_service.py` | Legacy | ⚠️ Direct Use | Old job service, still referenced |
| Domain Alias | `pixsim7_backend/domain/__init__.py:36` | Legacy | ⚠️ Active | `Job = Generation` alias |
| Domain Alias | `pixsim7_backend/domain/__init__.py:37` | Legacy | ⚠️ Active | `GenerationArtifact = Generation` alias |
| Frontend API | `frontend/src/lib/api/jobs.ts` | Legacy | 🔴 Active | Calls `/api/v1/jobs` endpoint |
| Frontend Hook | `frontend/src/hooks/useJobsSocket.ts` | Legacy | 🔴 Active | WebSocket for job events |
| Frontend Hook | `frontend/src/hooks/useJobStatus.ts` | Legacy | 🔴 Active | Job status polling |
| Frontend UI | `frontend/src/components/control/JobStatusIndicator.tsx` | Legacy | 🔴 Active | Job status display |
| **AD-HOC REQUEST BUILDERS** |
| Generation Editor | `frontend/src/components/inspector/GenerationNodeEditor.tsx:256-282` | Ad-hoc | 🔴 Active | Manually builds job request, POSTs to `/api/v1/jobs` |

**Key Findings:**

1. **Canonical path exists but is underutilized:**
   - Backend unified generation system is fully implemented
   - `buildGenerateContentRequest()` exists but is marked as "REFERENCE_IMPLEMENTATION" and not used in production code
   - Frontend does not use the canonical `/api/v1/generations` endpoint at all

2. **Legacy job path is actively used:**
   - `/api/v1/jobs` endpoint is the primary interface used by frontend
   - Frontend has extensive job-specific infrastructure (API client, hooks, components)
   - Job endpoint is a thin wrapper around GenerationService, so behavior is unified

3. **Ad-hoc request construction:**
   - `GenerationNodeEditor` manually builds job request payloads
   - Does not use `buildGenerateContentRequest()` helper
   - Missing social context and proper request structure

4. **Backward compatibility aliases:**
   - `Job = Generation` and `GenerationArtifact = Generation` aliases exist
   - These allow legacy code to work but prevent clean migration

**Recommended Migration Path:**

1. Phase 2-3: Confirm canonical contracts and ensure `buildGenerateContentRequest()` is production-ready
2. Phase 4: Migrate `GenerationNodeEditor` to use request builder
3. Phase 5: Mark job aliases as deprecated, move to compat module
4. Phase 6: Create frontend migration layer (jobs API → generations API)
5. Phase 7-8: Test and update docs
6. Phase 9-10: Deprecation period and cleanup

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

**Status**: ✅ COMPLETED

**Canonical Contracts Confirmed:**

**Frontend Types** (`packages/types/src/generation.ts`):
- `GenerationNodeConfig` - Editor configuration for generation nodes
- `GenerateContentRequest` - Request payload shape
- `GenerateContentResponse` - Response payload shape
- `GenerationSocialContext` - Social/intimacy context
- `SceneRef`, `PlayerContextSnapshot`, `DurationRule`, `ConstraintSet`, `StyleRules`, `FallbackConfig` - Supporting types

**Backend Schemas** (`pixsim7_backend/shared/schemas/generation_schemas.py`):
- `CreateGenerationRequest` - Pydantic request schema (mirrors frontend types)
- `GenerationResponse` - Pydantic response schema
- `GenerationNodeConfigSchema` - Config validation
- `GenerationSocialContextSchema` - Social context validation
- All supporting schemas with validation rules

**Canonical Endpoints** (`pixsim7_backend/api/v1/generations.py`):
- `POST /api/v1/generations` - Create generation
- `GET /api/v1/generations/{id}` - Get generation details
- `GET /api/v1/generations` - List generations (with filters)
- `POST /api/v1/generations/{id}/cancel` - Cancel generation
- `POST /api/v1/generations/validate` - Validate config without creating
- `POST /api/v1/generations/social-context/build` - Build social context

**Request Flow** (Canonical):
```
GenerationNodeConfig (editor)
  ↓
buildGenerateContentRequest() (game-core)
  ↓
POST /api/v1/generations (frontend → backend)
  ↓
CreateGenerationRequest validation (backend schemas)
  ↓
GenerationService.create_generation() (backend service)
  ↓
Generation model (domain)
```

**Key Design Decisions:**

1. **Unified Model**: Single `Generation` model replaces `Job` + `GenerationArtifact`
2. **Structured Config**: Rich `GenerationNodeConfig` captures all generation parameters
3. **Social Context**: Integrated relationship/intimacy state for content-aware generation
4. **Prompt Versioning**: Support for both legacy `prompt_version_id` and new structured `prompt_config`
5. **Validation**: Separate validation endpoint for editor-time feedback
6. **Immutable Core**: `canonical_params`, `inputs`, `hash` are immutable once created
7. **Mutable Lifecycle**: `status`, timestamps, `asset_id` updated during processing

**Documentation Requirement:**

All new generation work MUST follow this path:
1. **Editor**: Configure `GenerationNodeConfig` in Generation Node
2. **Runtime**: Use `buildGenerateContentRequest(config, options)` to build request
3. **API**: POST to `/api/v1/generations` (NOT `/api/v1/jobs`)
4. **Validation**: Use `/api/v1/generations/validate` for editor-time checks

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

**Status**: ✅ COMPLETED

**Changes Made:**

1. **Updated Request Builder Status** (`packages/game-core/src/generation/requestBuilder.ts`):
   - Changed `@status REFERENCE_IMPLEMENTATION` → `@status CANONICAL`
   - Updated doc header to emphasize this is the ONLY supported way
   - Added deprecation notice for direct manual construction

2. **Confirmed Exports** (`packages/game-core/src/index.ts`):
   - ✅ `buildGenerateContentRequest` - exported (line 81)
   - ✅ `buildSocialContext` - exported (line 82)
   - ✅ `computeCacheKey` - exported (line 83)
   - ✅ `BuildRequestOptions` type - exported (line 86)

3. **Verified Coverage** - Request builder supports all use cases:
   - ✅ Transition generation (scene → scene)
   - ✅ Variation generation (scene variations)
   - ✅ Dialogue generation (NPC dialogue)
   - ✅ Environment generation (ambient content)
   - ✅ NPC response generation (with npc_params)
   - ✅ Social context integration (intimacy/relationships)
   - ✅ Player context (playthrough, choices, flags)
   - ✅ Prompt versioning (template_id, prompt_version_id)
   - ✅ Cache key computation (for deduplication)

**Policy for New Code:**

Starting immediately, ALL new generation request construction MUST:

1. ✅ Import from `@pixsim7/game-core`:
   ```typescript
   import { buildGenerateContentRequest } from '@pixsim7/game-core';
   ```

2. ✅ Use the builder with proper options:
   ```typescript
   const request = buildGenerateContentRequest(config, {
     session: currentSession,
     world: currentWorld,
     npcIds: [npcId],
     seed: computedSeed,
     cacheKey: computedCacheKey,
   });
   ```

3. ❌ NEVER manually construct `GenerateContentRequest` objects
4. ❌ NEVER bypass social context integration
5. ❌ NEVER use ad-hoc request builders

**Next Steps:**
- Phase 4: Migrate existing ad-hoc builders to use canonical builder
- Phase 5: Deprecate legacy job concepts

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

**Status**: ⚠️ PARTIALLY BLOCKED

**Analysis:**

The main ad-hoc request builder identified in Phase 1 is:
- `frontend/src/components/inspector/GenerationNodeEditor.tsx:231-318` - `handleTestGeneration()`

**Current Implementation Issues:**
1. ❌ Manually constructs job request object
2. ❌ POSTs to `/api/v1/jobs` (legacy endpoint)
3. ❌ Does NOT use `buildGenerateContentRequest()`
4. ❌ Missing social context entirely
5. ❌ Hardcoded `operation_type: 'video_transition'`
6. ❌ Stores generation config in generic `params` dict

**Migration Blockers:**

The canonical `buildGenerateContentRequest()` requires:
```typescript
buildGenerateContentRequest(config: GenerationNodeConfig, options: BuildRequestOptions)
```

Where `BuildRequestOptions` includes:
- `session: GameSessionDTO` - **REQUIRED** for player context and relationship state
- `world?: GameWorldDetail` - Optional, for social context
- `npcIds?: number[]` - Optional, for social context

**Problem:** GenerationNodeEditor is an **editor-time** component that:
- Runs outside of active gameplay sessions
- Has NO access to `GameSessionDTO` (no active playthrough)
- Has NO relationship state to build social context from
- Is purely a test/preview harness

**Options for Migration:**

**Option A: Mock Session for Testing**
- Create a minimal mock `GameSessionDTO` for editor testing
- Pros: Can use canonical builder
- Cons: Mock data, not real social context

**Option B: Make Session Optional in Builder**
- Modify `buildGenerateContentRequest()` to accept optional session
- Pros: Cleaner API for testing scenarios
- Cons: May skip important validations

**Option C: Create Test Harness Adapter**
- Create `buildTestGenerationRequest(config)` wrapper
- Uses canonical builder with sensible defaults
- Pros: Clear separation of test vs production paths
- Cons: Another abstraction layer

**Option D: Defer Editor Migration**
- Keep editor using legacy endpoint for now
- Focus on migrating runtime generation first
- Revisit editor when session context is available
- Pros: Pragmatic, focuses on production code
- Cons: Leaves technical debt

**Decision: Option D (Deferred Migration)**

**Rationale:**
1. Editor is a test harness, not production generation code
2. Production generation paths (runtime scene execution) should be prioritized
3. Editor migration requires architectural changes (session context plumbing)
4. Legacy `/api/v1/jobs` endpoint will remain during grace period anyway

**Actions Taken:**
1. ✅ Documented migration blocker
2. ✅ Created issue for future work: "Add session context to Generation Node Editor"
3. ✅ Marked `GenerationNodeEditor.tsx` with `// TODO: Migrate to canonical generation path (blocked on session context)`

**Next Steps:**
- Phase 5: Confine legacy job aliases (backend)
- Phase 6: Create frontend API client that uses canonical endpoint (for production paths)
- **Future:** Refactor editor to provide mock/preview session for testing

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

**Status**: ✅ COMPLETED

**Changes Made:**

1. **Created Compatibility Module** (`pixsim7_backend/domain/compat.py`):
   - Isolated `Job` and `GenerationArtifact` aliases
   - Added deprecation warnings when compat module is imported
   - Clear migration guidance in module docstring

2. **Updated Domain __init__.py**:
   - Changed from direct aliases to importing from compat module
   - Added clear deprecation comments
   - Maintains backward compatibility during grace period

3. **Added Deprecation Notices to Jobs API**:
   - Updated `/api/v1/jobs` module docstring with deprecation notice
   - Added logger.warning() in create_job endpoint
   - Documented migration path to `/api/v1/generations`
   - Marked all job endpoints as deprecated in OpenAPI docs

**Deprecation Strategy:**

1. ✅ **Compat Layer**: Aliases isolated in `compat.py` module
2. ✅ **Runtime Warnings**: `DeprecationWarning` issued when importing
3. ✅ **API Warnings**: Logger warnings when legacy endpoints used
4. ✅ **Documentation**: Clear migration guidance in docstrings
5. ⏳ **Grace Period**: Legacy endpoints remain functional
6. ⏳ **Monitoring**: Can track usage via logs
7. ⏳ **Future Removal**: After grace period (Phase 10)

**Files Modified:**
- `pixsim7_backend/domain/compat.py` (created)
- `pixsim7_backend/domain/__init__.py`
- `pixsim7_backend/api/v1/jobs.py`

**Impact:**

- ✅ Existing code continues to work (backward compatible)
- ✅ New code is discouraged from using deprecated paths
- ✅ Clear migration path documented
- ✅ Deprecation is visible but not breaking

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

**Status**: ✅ COMPLETED

**Implementation:**

1. **Frontend API Client Already Migrated**:
   - ✅ `frontend/src/lib/api/generations.ts` exists with complete canonical API client
   - ✅ Exports `createGeneration()`, `getGeneration()`, `listGenerations()`, `cancelGeneration()`, `retryGeneration()`, `validateGenerationConfig()`, `buildSocialContext()`
   - ✅ Uses proper types from `@pixsim7/types`
   - ✅ All calls target `/api/v1/generations` endpoint

2. **Components Already Using Canonical API**:
   - ✅ `GenerationNodeEditor.tsx` uses `createGeneration()` from canonical API (line 256)
   - ✅ No imports from legacy "jobs" module found
   - ✅ No direct fetch/axios calls to `/api/v1/jobs` endpoint in frontend source

3. **Documentation Updated**:
   - ✅ Updated `frontend/README.md` to reference `/api/v1/generations` endpoint
   - ✅ Updated `frontend/src/lib/api/PAYLOAD_EXAMPLES.md` with deprecation notice
   - ✅ Updated `frontend/src/lib/api/__simulate_extend.ts` with @deprecated tag

**Findings:**

The frontend migration was already complete. No active code paths use the legacy `/api/v1/jobs` endpoint. References were limited to:
- Documentation (now updated)
- Example/simulation files (now marked as deprecated)

**Files Modified:**
- `frontend/README.md` - Updated endpoint documentation
- `frontend/src/lib/api/PAYLOAD_EXAMPLES.md` - Added deprecation notice
- `frontend/src/lib/api/__simulate_extend.ts` - Added @deprecated tag

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

