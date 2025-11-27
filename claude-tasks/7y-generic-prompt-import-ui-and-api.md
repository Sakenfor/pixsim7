## 7y – Generic Prompt Import API & Dev UI (Prompt-DSL Backed)

**Goal:** Build a small, source-agnostic prompt import flow that uses the `PromptImportSpec` / `prepare_import_payloads` helpers and existing prompts API to create `PromptFamily` + `PromptVersion` records from arbitrary prompt text. This should *not* be tied specifically to pixprompts; it must work for any prompt source (manual, files, external).

This task assumes Task 7x (Generic Prompt Analysis & Import Pipeline) is already implemented:
- `pixsim7/backend/main/services/prompt_dsl_adapter.py` provides `analyze_prompt(text)`.
- `pixsim7/backend/main/services/prompt_import.py` provides:
  - `PromptSource`
  - `PromptImportSpec`
  - `prepare_import_payloads(...)`

---

### Constraints

- Do **not**:
  - Change database schemas or add new tables.
  - Expose `prompt-dsl` types or enums directly via API.
  - Special-case `pixprompts` paths or repo layouts.
- Use only:
  - Existing prompts API/services (`PromptVersionService`, `CreatePromptFamilyRequest`, `CreatePromptVersionRequest`, etc.).
  - The helpers from Task 7x.

---

### Task A – Backend Dev Endpoint: Generic Prompt Import

**File:** `pixsim7/backend/main/api/v1/dev_prompt_import.py` (new)

**Goal:** Provide a dev-only endpoint that:
- Accepts raw prompt text + minimal metadata.
- Uses `PromptImportSpec` / `prepare_import_payloads(...)`.
- Creates a `PromptFamily` + initial `PromptVersion` via existing services.

**Endpoint:**

- `POST /api/v1/dev/prompt-import`

  - Request body model (define locally for this dev router):

    ```python
    from pydantic import BaseModel
    from typing import Optional, List, Dict, Any
    from pixsim7.backend.main.services.prompt_import import PromptSource


    class PromptImportRequest(BaseModel):
        family_title: str
        prompt_text: str

        # Optional convenience fields
        family_slug: Optional[str] = None
        prompt_type: str = "visual"
        category: Optional[str] = None
        explicit_family_tags: Optional[List[str]] = None
        explicit_version_tags: Optional[List[str]] = None

        source: PromptSource = PromptSource.MANUAL
        source_reference: Optional[str] = None   # e.g. file path, external ID

        family_metadata: Optional[Dict[str, Any]] = None
        version_metadata: Optional[Dict[str, Any]] = None
    ```

  - Behavior:

    1. Validate `family_title` and `prompt_text` are non-empty; otherwise `400`.
    2. Construct a `PromptImportSpec`:

       ```python
       spec = PromptImportSpec(
           family_title=request.family_title,
           prompt_text=request.prompt_text,
           source=request.source,
           family_slug=request.family_slug,
           prompt_type=request.prompt_type,
           category=request.category,
           family_tags=request.explicit_family_tags or [],
           version_tags=request.explicit_version_tags or [],
           family_metadata=request.family_metadata or {},
           version_metadata=request.version_metadata or {},
           source_reference=request.source_reference,
       )
       ```

    3. Call `prepare_import_payloads(spec)` to get:
       - `family_req: CreatePromptFamilyRequest`
       - `version_req: CreatePromptVersionRequest`

    4. Use `PromptVersionService` (as in `prompts/families.py`) to:
       - Create a `PromptFamily` (if needed).
       - Create an initial `PromptVersion` for that family.

       You can follow the patterns from `create_family` and `create_version` in `pixsim7/backend/main/api/v1/prompts/families.py`:

       ```python
       service = PromptVersionService(db)

       family = await service.create_family(
           title=family_req.title,
           prompt_type=family_req.prompt_type,
           slug=family_req.slug,
           description=family_req.description,
           category=family_req.category,
           tags=family_req.tags,
           game_world_id=family_req.game_world_id,
           npc_id=family_req.npc_id,
           scene_id=family_req.scene_id,
           action_concept_id=family_req.action_concept_id,
           created_by=user.email,
       )

       version = await service.create_version(
           family_id=family.id,
           prompt_text=version_req.prompt_text,
           commit_message=version_req.commit_message,
           author=version_req.author or user.email,
           parent_version_id=version_req.parent_version_id,
           variables=version_req.variables,
           provider_hints=version_req.provider_hints,
           tags=version_req.tags,
       )
       ```

    5. Response JSON:

       ```json
       {
         "family": {
           "id": "...",
           "slug": "...",
           "title": "...",
           "prompt_type": "visual",
           "category": null,
           "tags": ["..."],
           "is_active": true,
           "version_count": 1
         },
         "version": {
           "id": "...",
           "family_id": "...",
           "version_number": 1,
           "prompt_text": "...",
           "commit_message": null,
           "author": "user@example.com",
           "generation_count": 0,
           "successful_assets": 0,
           "tags": ["..."],
           "created_at": "..."
         }
       }
       ```

       You can reuse `PromptFamilyResponse` and `PromptVersionResponse` to shape these.

- Mount the router similarly to `dev_prompt_inspector`:
  - Import and include it in `pixsim7/backend/main/api/v1/__init__.py` or wherever dev routers are registered.

**Notes:**

- This endpoint is intentionally dev-only; keep it under a `/dev/*` prefix and reuse existing auth (current user).
- Do not add any `prompt-dsl` types to the response; everything goes through the existing schemas and `provider_hints`.

---

### Task B – Dev Prompt Importer UI (Optional, but Recommended)

**Files:**
- `apps/main/src/routes/DevPromptImporter.tsx` (new)
- `apps/main/src/App.tsx` (wire route)

**Goal:** Provide a small dev-only form where you can paste prompt text and metadata, send it to `/api/v1/dev/prompt-import`, and see the created family/version.

**Route:**

- Path: `/dev/prompt-importer`
- Access: same dev/protected pattern used for `/dev/prompt-inspector` and other dev tools.

**UI Behavior (minimal):**

- Form inputs:
  - `family_title` (text input, required).
  - `prompt_text` (textarea, required).
  - Optional fields:
    - `family_slug`
    - `prompt_type` (select: `visual`, `narrative`, `hybrid`)
    - `category` (text)
    - `explicit_family_tags` (comma-separated string, split into array)
    - `explicit_version_tags` (comma-separated string)
    - `source` (select: `manual`, `file_import`, `external`, `other`)
    - `source_reference` (text, e.g. filename or external ID)
  - A “Import Prompt” button that:
    - Calls `POST /api/v1/dev/prompt-import` with the above fields mapped into `PromptImportRequest`.

- Response view:
  - On success, display:
    - Family summary: id, slug, title, prompt_type, tags.
    - Version summary: id, version_number, tags, created_at.
    - Optionally, a collapsible block showing `version.provider_hints.prompt_analysis` (if returned via a follow-up GET on the version).
  - On error, display error message from API.

**Implementation Notes:**

- Use the existing API client patterns (like other dev routes) for calling the endpoint.
- This UI should be clearly labeled as **Dev / Experimental**.
- No persistence of form fields is required (simple local state is fine).

---

### Task C – (Future) CLI / Scripted Import (Planning Only)

> **Do not implement in this task**; this is guidance for a future task.

Once Tasks A and B are complete, a future task can:

- Add a small CLI or script under `scripts/` (e.g. `scripts/import_prompts.py`) that:
  - Reads prompt sources (files, JSON, etc.) from disk.
  - For each prompt, builds a `PromptImportSpec`.
  - Calls `prepare_import_payloads(...)`.
  - Uses either:
    - Direct DB access via `PromptVersionService`, or
    - HTTP calls to `/api/v1/dev/prompt-import`.
- This script should remain **source-agnostic**:
  - It may support a `--source` flag and `--source-reference`, but it must not bake in pixprompts-specific assumptions into shared libraries.

---

### Acceptance Checklist

- [ ] `POST /api/v1/dev/prompt-import`:
  - [ ] Accepts `PromptImportRequest` with at least `family_title` and `prompt_text`.
  - [ ] Uses `PromptImportSpec` + `prepare_import_payloads(...)` to derive tags and provider hints.
  - [ ] Creates a `PromptFamily` and initial `PromptVersion` via `PromptVersionService`.
  - [ ] Returns `{ family, version }` shaped with `PromptFamilyResponse` / `PromptVersionResponse`.
- [ ] No DB schema changes or new tables were added.
- [ ] No `prompt-dsl` types or enums appear in any public API response.
- [ ] (If Task B implemented) `/dev/prompt-importer`:
  - [ ] Allows pasting arbitrary prompt text and importing it via the dev endpoint.
  - [ ] Displays basic family/version info on success.

