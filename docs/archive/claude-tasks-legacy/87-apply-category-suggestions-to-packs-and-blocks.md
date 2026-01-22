## 87 – Apply Category Suggestions to Packs & Blocks

**Goal:** Build on Task 85 by adding a dev-only flow in Prompt Lab to turn AI category suggestions into **draft Semantic Packs** and **draft ActionBlocks**, wired through the existing APIs. The agent still never mutates ontology or packs directly; this task is about turning accepted suggestions into concrete draft objects you can then edit/publish using your existing tools.

---

### Context

Already implemented:

- **Category discovery (Task 85):**
  - `POST /api/v1/dev/prompt-categories/discover` runs parser + ontology + AI Hub to produce:
    - `suggested_ontology_ids` (potential new IDs/kinds),
    - `suggested_packs` (pack_id, label, parser_hints),
    - `suggested_action_blocks` (block_id, prompt, tags).
  - Prompt Lab **Categories** tab displays these suggestions alongside current parser coverage.

- **Semantic Packs & ActionBlocks:**
  - `SemanticPackDB` + `/api/v1/semantic-packs` for pack manifests.
  - `ActionBlockDB` + `/api/v1/action-blocks` for reusable blocks.

Missing:

- A way to **accept** a suggestion in the UI and have it materialize as:
  - A draft `SemanticPackDB` record (or update to an existing pack), and/or
  - A draft `ActionBlockDB` record.

This task wires that up while keeping the flow dev/authoring-only and reversible.

---

### Task A – Backend Helpers to Build Draft Objects from Suggestions

**Files:**

- `pixsim7/backend/main/services/semantic_packs/utils.py` (new)
- `pixsim7/backend/main/services/action_blocks/utils.py` (new or extend existing)

**Goal:** Convert suggestion objects (as returned by Task 85) into draft DB models or API payloads.

**Helpers (conceptual):**

```py
from pixsim7.backend.main.domain.semantic_pack import SemanticPackDB
from pixsim7.backend.main.domain.action_block import ActionBlockDB
from pixsim7.backend.main.shared.schemas.semantic_pack_schemas import SuggestedPackEntry  # or similar
from pixsim7.backend.main.api.v1.dev_prompt_categories import SuggestedActionBlock


def build_draft_pack_from_suggestion(s: SuggestedPackEntry) -> SemanticPackDB:
    """
    Build a draft SemanticPackDB instance (not persisted) from an AI suggestion.
    Fields:
      - id: s.pack_id
      - version: "0.1.0" (initial)
      - label: s.pack_label
      - parser_hints: s.parser_hints
      - status: "draft"
      - other fields left minimal for later editing.
    """
    ...


def build_draft_action_block_from_suggestion(
    s: SuggestedActionBlock,
) -> ActionBlockDB:
    """
    Build a draft ActionBlockDB instance (not persisted) from an AI suggestion.
    Fields:
      - block_id: s.block_id
      - prompt: s.prompt
      - tags: s.tags (already ontology-aligned where possible)
      - source_type: "ai_suggested"
      - is_composite: False by default
      - other fields (duration, style, etc.) can be set to defaults.
    """
    ...
```

These helpers will be used by new API endpoints in Task B.

---

### Task B – Dev Endpoints to Materialize Draft Packs & Blocks

**File:** `pixsim7/backend/main/api/v1/dev_prompt_categories_apply.py` (new)

**Goal:** Provide dev-only endpoints that:

- Accept one or more suggestions from the UI.
- Build corresponding draft `SemanticPackDB` / `ActionBlockDB` objects.
- Persist them via existing APIs/services.

**Endpoints:**

1. `POST /api/v1/dev/prompt-categories/apply-pack`

   - Body (Pydantic schema):

     ```py
     class ApplyPackSuggestionRequest(BaseModel):
         pack_id: str
         pack_label: str
         parser_hints: Dict[str, List[str]]
         # Optional: link back to the prompt or discovery session
         source_prompt: Optional[str] = None
     ```

   - Behavior:
     - Check if `SemanticPackDB` with `id=pack_id` exists:
       - If yes: merge/extend `parser_hints` (no destructive overwrite), keep `status` as-is.
       - If no: create a new `SemanticPackDB` with `status="draft"` using `build_draft_pack_from_suggestion`.
     - Persist changes and return the resulting `SemanticPackManifest`.

2. `POST /api/v1/dev/prompt-categories/apply-block`

   - Body:

     ```py
     class ApplyBlockSuggestionRequest(BaseModel):
         block_id: str     # suggested string ID
         prompt: str
         tags: Dict[str, Any]
         package_name: Optional[str] = None  # e.g. pack ID, or a suggested package name
         source_prompt: Optional[str] = None
     ```

   - Behavior:
     - Check if an ActionBlock with `block_id` already exists:
       - If yes: return 400 or treat as a no-op (configurable; simplest is 400 with a clear message).
       - If no: build a draft `ActionBlockDB` via `build_draft_action_block_from_suggestion` and persist it.
     - Return the created `ActionBlockDB` (or a trimmed response).

**Scope:**

- Endpoints are under `/dev/*` and use standard auth.
- No bulk apply yet; the UI will call per-suggestion.

---

### Task C – Prompt Lab UI: Apply Suggestions

**File:** `apps/main/src/routes/PromptLabDev.tsx`

**Goal:** In the **Categories** tab, add affordances to apply individual suggestions to packs/blocks.

**Behavior:**

- Under “Suggested Packs” section:
  - Each `SuggestedPackEntry` row gets an “Apply as Draft Pack” button:
    - Calls `POST /api/v1/dev/prompt-categories/apply-pack` with that suggestion.
    - On success, shows a toast and maybe a link like “View pack in Semantic Packs UI” (future).

- Under “Suggested ActionBlocks” section:
  - Each `SuggestedActionBlock` row gets an “Apply as Draft Block” button:
    - Calls `POST /api/v1/dev/prompt-categories/apply-block`.
    - On success, shows a toast and maybe the new `block_id`.

**Notes:**

- Do not add any “Apply all” button yet; keep it per-suggestion and explicit.
- Display backend error messages if a block/pack already exists.

---

### Task D – Safety & Traceability

**Goal:** Make it easy to see which packs/blocks came from AI suggestions and from which prompts.

**Changes:**

- When building draft objects in Helpers (Task A):
  - Set `source_type = "ai_suggested"` (for ActionBlocks).
  - Store a small `extra` or `metadata` field with:
    - `source_prompt_excerpt` (first N chars of prompt),
    - `source_discovery_session_id` (if you have one, or a timestamp).
- Ensure `SemanticPackDB.extra` / `ActionBlockDB` metadata fields are used rather than new columns, to keep schema changes minimal.

**Acceptance:**

- Draft packs/blocks created via this flow are clearly marked as AI-suggested in their metadata.

---

### Non-Goals

- Automatically publishing packs or blocks; everything created here is `draft` and should require manual review/editing.
- Auto-updating ontology; suggested ontology IDs remain only in the discovery response for now.

---

### Acceptance Checklist

- [ ] Helpers exist to build draft `SemanticPackDB` and `ActionBlockDB` objects from category suggestions (without persistence).
- [ ] Dev endpoints under `/api/v1/dev/prompt-categories/apply-pack` and `/apply-block`:
  - [ ] Accept suggestion payloads from Prompt Lab.
  - [ ] Create or update draft packs/blocks via existing models and persist them.
- [ ] Prompt Lab **Categories** tab has “Apply” buttons for:
  - [ ] Suggested packs → create/merge draft Semantic Packs.
  - [ ] Suggested blocks → create draft ActionBlocks.
- [ ] AI-suggested packs/blocks are clearly marked in metadata for later review.
