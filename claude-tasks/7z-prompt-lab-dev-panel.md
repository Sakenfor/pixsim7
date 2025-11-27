## 7z – Prompt Lab Dev Panel (Analyzer, Importer, Library)

**Goal:** Create a unified “Prompt Lab” dev surface that brings together prompt analysis, import, and library browsing in one place. This should reuse the generic prompt analysis/import pipeline (Tasks 7x and 7y) and existing prompts APIs, without changing DB schemas or core generation behavior.

---

### Context

Already implemented:

- **Task 64:** Minimal Prompt DSL adapter + dev inspector
  - `parse_prompt_to_blocks(text)` in `prompt_dsl_adapter.py`
  - `GET /api/v1/dev/prompt-inspector` and `/dev/prompt-inspector` route
- **Task 7x:** Generic prompt analysis & import pipeline
  - `analyze_prompt(text)` in `prompt_dsl_adapter.py`
  - `PromptImportSpec` + `prepare_import_payloads(...)` in `prompt_import.py`
- **Task 7y:** Generic prompt import API & UI
  - `POST /api/v1/dev/prompt-import` (`dev_prompt_import.py`)
  - `/dev/prompt-importer` (`DevPromptImporter` route)

Missing:

- A single, coherent place to:
  - Analyze arbitrary prompt text and see blocks/tags.
  - Import prompts with live preview of analysis.
  - Browse existing prompt families/versions, including source + analysis info.
  - Inspect imported prompts by `source` / `source_reference`.

This task adds a **Prompt Lab** dev route that stitches these together.

---

### Constraints

- Do **not**:
  - Change or add database tables/columns.
  - Expose any `prompt-dsl` classes/enums directly.
  - Change production flows for generations/providers.
- Reuse:
  - Existing dev endpoints (`dev_prompt_inspector`, `dev_prompt_import`) where possible.
  - Existing prompts endpoints under `/api/v1/prompts`.
- New endpoints should be under `/api/v1/dev/*` and clearly dev-only.

---

### Task A – Backend: Prompt Library Dev Endpoint

**File:** `pixsim7/backend/main/api/v1/dev_prompt_library.py` (new)

**Goal:** Provide a dev-only endpoint to:

- List prompt families/versions with filters.
- Get detailed info (including `provider_hints` and `prompt_analysis`) for a specific version.

**Models:**

- Local Pydantic models (dev-only):

  ```python
  from pydantic import BaseModel
  from typing import List, Optional, Dict, Any
  from uuid import UUID


  class DevPromptFamilySummary(BaseModel):
      id: UUID
      slug: str
      title: str
      prompt_type: str
      category: Optional[str]
      tags: List[str]
      is_active: bool
      version_count: int


  class DevPromptVersionSummary(BaseModel):
      id: UUID
      family_id: UUID
      version_number: int
      author: Optional[str]
      tags: List[str]
      created_at: str


  class DevPromptVersionDetail(BaseModel):
      version: DevPromptVersionSummary
      prompt_text: str
      provider_hints: Dict[str, Any]
      prompt_analysis: Optional[Dict[str, Any]]
  ```

**Router:**

- `router = APIRouter(prefix="/dev/prompt-library", tags=["dev"])`

**Endpoints:**

1. `GET /api/v1/dev/prompt-library/families`

   - Query params (all optional):
     - `prompt_type: str | None`
     - `category: str | None`
     - `tag: str | None` (single tag filter)
     - `limit: int = 50`
     - `offset: int = 0`
   - Behavior:
     - Uses `PromptVersionService` to list families (reuse logic similar to `/prompts/families`).
     - Computes `version_count` via `list_versions(family_id, limit=...)`.
     - If `tag` is provided, filter families whose `tags` include that tag.
   - Response: `List[DevPromptFamilySummary]`

2. `GET /api/v1/dev/prompt-library/families/{family_id}/versions`

   - Path param: `family_id: UUID`
   - Query params (optional):
     - `limit: int = 50`
     - `offset: int = 0`
   - Behavior:
     - Uses `PromptVersionService.list_versions(family_id, ...)`.
   - Response: `List[DevPromptVersionSummary]`

3. `GET /api/v1/dev/prompt-library/versions/{version_id}`

   - Path param: `version_id: UUID`
   - Behavior:
     - Uses `PromptVersionService.get_version(version_id)` to fetch version + `provider_hints`.
     - Builds `DevPromptVersionSummary` + `prompt_text` + `provider_hints`.
     - Extracts `prompt_analysis` from `provider_hints.get("prompt_analysis")` if present.
     - If no `prompt_analysis` is present:
       - Optionally call `analyze_prompt(version.prompt_text)` (from `prompt_dsl_adapter`) and return that value as `prompt_analysis` **without** mutating the DB.
   - Response: `DevPromptVersionDetail`

**Mounting:**

- Import and include this router alongside other dev routers:
  - `pixsim7/backend/main/api/v1/__init__.py`
  - Add a plugin manifest similar to `dev_prompt_import`:
    - `pixsim7/backend/main/routes/dev_prompt_library/manifest.py`

---

### Task B – Frontend: Prompt Lab Dev Route

**Files:**

- `apps/main/src/routes/PromptLabDev.tsx` (new)
- `apps/main/src/App.tsx` (wire route)

**Route:**

- Path: `/dev/prompt-lab`
- Access: `ProtectedRoute` (same as other dev tools).

**Layout:**

- Top-level page with tabs or segmented controls, e.g.:
  - **Analyze** (arbitrary text analysis)
  - **Import** (wraps existing DevPromptImporter UI)
  - **Library** (families/versions browser)
  - **Sources** (source/lineage view, optional in this task)

You can implement this as:

- Internal component-level tabs (e.g. simple stateful `<button>` tab bar).
- Or reuse any existing tab component from `@pixsim7/ui` if available.

---

### Task C – Analyze Tab (Arbitrary Text)

**Goal:** Make a nicer surface around `POST /api/v1/dev/prompt-inspector/analyze-prompt` that lets you type prompt text, see blocks + tags, and optionally copy into the Import tab.

**API:**

- `POST /api/v1/dev/prompt-inspector/analyze-prompt`
  - Body: `{ "prompt_text": "..." }`
  - Response: `{ prompt, blocks, tags }`

**UI Behavior:**

- Left side:
  - Textarea for prompt text.
  - “Analyze” button.
- Right side:
  - Show tags as chips.
  - Reuse `PromptBlocksViewer` (if suitable) to display blocks grouped by `role`.
- Extra:
  - “Send to Import tab” button that:
    - Prefills `DevPromptImporter` form fields (family title + prompt text) when switching to the Import tab.

Implementation detail:

- You can either:
  - Embed the existing `PromptInspectorDev` component inside the Analyze tab, or
  - Reproduce its core behavior with a smaller, Analyze-focused UI.
- Prefer sharing small components (e.g. block list/tags view) to avoid duplication.

---

### Task D – Import Tab (Wrap Existing DevPromptImporter)

**Goal:** Integrate the existing `DevPromptImporter` into Prompt Lab so imports live alongside analysis/library.

**Requirements:**

- Use the existing `DevPromptImporter` component as the core of the Import tab.
- Add an optional prop to `DevPromptImporter`:

  ```ts
  interface DevPromptImporterProps {
    initialFamilyTitle?: string;
    initialPromptText?: string;
  }
  ```

  - On mount, if provided, initialize internal state with these values.

- From the Analyze tab:
  - When the user clicks “Send to Import tab”, populate these props (via shared state in `PromptLabDev`) and switch the active tab.

No API changes are needed for this tab; it already calls `/dev/prompt-import`.

---

### Task E – Library Tab (Families/Versions Browser)

**Goal:** Let users browse existing prompt families/versions, filter by type/tags, and inspect analysis for a given version.

**API:**

- `GET /api/v1/dev/prompt-library/families`
- `GET /api/v1/dev/prompt-library/families/{family_id}/versions`
- `GET /api/v1/dev/prompt-library/versions/{version_id}`

**UI Behavior:**

- Layout suggestion:

  - Left column:
    - Filters:
      - `prompt_type` select (`visual`, `narrative`, `hybrid`, `all`).
      - `category` text input.
      - `tag` text input (filter families by tag).
    - List of families (title, slug, type, tags count, version_count).
    - Selecting a family loads its versions into the middle column.

  - Middle column:
    - List of versions for the selected family:
      - `#version_number`, `author`, `created_at`, tag chips.
    - Selecting a version loads its details into the right column.

  - Right column:
    - Version detail:
      - Prompt text (readonly textarea).
      - Tags.
      - Prompt analysis:
        - Show `prompt_analysis.tags` (if present) as chips.
        - Reuse `PromptBlocksViewer` (or a simplified block list) to show blocks grouped by role.
      - A “Analyze now” button that:
        - Calls `GET /dev/prompt-library/versions/{version_id}` again (which may compute `prompt_analysis` on the fly if missing).

**Implementation Notes:**

- Use the `useApi` hook for these calls.
- Keep pagination simple (limit 50, basic “Load more” or page-less for dev).
- This is dev-only UI; prioritize clarity over perfect styling.

---

### Task F – Sources Tab (Optional in this task, Planning-Friendly)

> This can be partially implemented or stubbed; main goal is to visualize imported prompts by `source` / `source_reference`.

**Goal:** Provide a view grouped by `PromptSource` and `source_reference` (e.g., file path, external ID), using data stored in `version.provider_hints`.

**Approach:**

- Reuse `GET /api/v1/dev/prompt-library/families` + `.../versions` + `.../versions/{id}`:
  - For each version, inspect `provider_hints`:
    - `source`: `"manual" | "file_import" | "external" | "other"`
    - `source_reference`: optional string.
- Group versions by `(source, source_reference)` client-side.
- UI:
  - Left: list of sources (e.g., “file_import: G:/prompts/foo.txt”).
  - Right: versions under that source, similar to the Library tab detail view.

This tab can be a simple read-only view; no new backend API is strictly required beyond the Library endpoints.

---

### Acceptance Checklist

- [ ] Backend:
  - [ ] `dev_prompt_library.py` exists and exposes:
    - [ ] `GET /api/v1/dev/prompt-library/families`
    - [ ] `GET /api/v1/dev/prompt-library/families/{family_id}/versions`
    - [ ] `GET /api/v1/dev/prompt-library/versions/{version_id}`
  - [ ] A plugin manifest for `dev_prompt_library` is registered and enabled.
  - [ ] No DB schema changes; no `prompt-dsl` types are exposed.
- [ ] Frontend:
  - [ ] `/dev/prompt-lab` is wired via `PromptLabDev` behind `ProtectedRoute`.
  - [ ] Analyze tab:
    - [ ] Can analyze arbitrary text via `/dev/prompt-inspector/analyze-prompt`.
    - [ ] Shows blocks + tags and can send content to Import tab.
  - [ ] Import tab:
    - [ ] Wraps `DevPromptImporter` and can receive initial values from Analyze tab.
  - [ ] Library tab:
    - [ ] Lists families with filters.
    - [ ] Shows versions per family.
    - [ ] Shows prompt text + analysis for a selected version.
  - [ ] (Optional) Sources tab groups versions by `source` / `source_reference`.

