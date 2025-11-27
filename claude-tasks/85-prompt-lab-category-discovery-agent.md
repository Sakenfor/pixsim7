## 85 – Prompt Lab Category Discovery Agent (Ontology & Pack Suggestions)

**Goal:** Add a dev-only feature in Prompt Lab that uses AI Hub to analyze prompts and suggest ontology-aligned “categories” (ontology IDs, Semantic Pack entries, and candidate ActionBlocks) when the existing parser/ontology can’t express certain semantics cleanly. The agent does not mutate ontology or packs directly; it proposes changes that you can review and promote into packs/ontology manually.

---

### Context

Already in place:

- **Parser & ontology:**
  - `SimplePromptParser` (`services/prompt_parser/simple.py`) classifies sentences into roles and enriches `ParsedBlock.metadata` with `ontology_ids` via `Ontology.match_keywords()`.
  - `ontology.yaml` / `ontology.py` define core/domain ontology IDs and relationships.

- **Semantic Packs:**
  - `SemanticPackDB` + schemas and `semantic_packs` API for pack manifest CRUD and export.
  - `ParserHintProvider` to merge `parser_hints` from packs into hints for the parser.

- **AI Hub:**
  - `AiHubService` and `/api/v1/ai/prompt-edit` / `/api/v1/ai/providers` endpoints.
  - AI model catalog (Task 80) with `AiModelRegistry` and `ai_model_defaults` for prompt editing models.

- **Prompt Lab:**
  - `/dev/prompt-lab` route with Analyze, Import, Library, and Graph views.
  - Uses `analyze_prompt` and dev prompt library endpoints.

Missing:

- A “category discovery” surface that:
  - Shows where the parser/ontology coverage is thin for a given prompt.
  - Asks an AI agent to propose:
    - New or refined ontology IDs (or tags to use from the domain section),
    - Semantic pack entries (parser hints + pack metadata),
    - Candidate ActionBlocks (blocks + tags) for reuse.
  - Lets you review and optionally turn those proposals into:
    - Draft Semantic Packs,
    - New ActionBlocks,
    - Ontology/domain extensions (via follow-up tasks).

This task is about wiring up that flow in a dev-only Prompt Lab tab and AI Hub-backed backend endpoints.

---

### Task A – Backend: Category Discovery Endpoint (Dev-Only)

**File:** `pixsim7/backend/main/api/v1/dev_prompt_categories.py` (new)

**Goal:** Provide a dev-only endpoint that:

- Takes a prompt (and optional context) from Prompt Lab.
- Runs core analysis (parser + ontology) to see what’s already covered.
- Calls AI Hub to propose category/ontology/pack suggestions.
- Returns a structured suggestion payload.

**Request schema (Pydantic):**

```py
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class PromptCategoryDiscoveryRequest(BaseModel):
    prompt_text: str = Field(..., min_length=1)
    # Optional context for better suggestions
    world_id: Optional[str] = None
    pack_ids: Optional[List[str]] = None
    # Optional hint whether this is a "family" seed or a one-off prompt
    use_case: Optional[str] = Field(
        default=None,
        description="Optional hint: 'family-seed', 'one-off', etc."
    )
```

**Response schema (Pydantic):**

```py
class SuggestedOntologyId(BaseModel):
    id: str
    label: str
    description: Optional[str] = None
    kind: str  # e.g. "action", "state", "part", "manner", "agency"
    confidence: float


class SuggestedPackEntry(BaseModel):
    pack_id: str
    pack_label: str
    parser_hints: Dict[str, List[str]]  # candidate hints for this pack
    notes: Optional[str] = None


class SuggestedActionBlock(BaseModel):
    block_id: str
    prompt: str
    tags: Dict[str, Any]
    notes: Optional[str] = None


class PromptCategoryDiscoveryResponse(BaseModel):
    prompt_text: str
    parser_roles: List[Dict[str, Any]]      # summary of roles/blocks from SimplePromptParser
    existing_ontology_ids: List[str]        # union of ontology_ids already found
    suggestions: Dict[str, Any]             # raw AI suggestion payload (for debugging)
    suggested_ontology_ids: List[SuggestedOntologyId]
    suggested_packs: List[SuggestedPackEntry]
    suggested_action_blocks: List[SuggestedActionBlock]
```

**Endpoint:**

- `POST /api/v1/dev/prompt-categories/discover`

  - Steps:
    1. Run `analyze_prompt(prompt_text)` via the existing adapter:
       - Extract `blocks`, roles, and `ontology_ids` (from `ParsedBlock.metadata`) into a summary.
    2. Build an AI Hub prompt for a prompt‑editing model (e.g., default `prompt_edit` model):
       - Include:
         - Original `prompt_text`,
         - Summarized roles and ontology IDs,
         - Any active packs/world IDs if provided.
       - Ask the model to respond in a *strict JSON format* that matches your `PromptCategoryDiscoveryResponse` nested schemas (or a simpler intermediate schema you parse into those).
    3. Use `AiHubService.edit_prompt` or a new AI Hub method (e.g. `run_analysis`) with a special “system prompt” that instructs the model to act as a category/ontology advisor:
       - It should *not* rewrite the prompt; it should only output JSON suggestions.
    4. Parse the AI response JSON into:
       - `SuggestedOntologyId` entries (for any new or refined IDs),
       - `SuggestedPackEntry` entries (candidate `pack_id`, parser_hints),
       - `SuggestedActionBlock` entries (candidate blocks with tags).
    5. Build and return `PromptCategoryDiscoveryResponse`.

**Important constraints:**

- The endpoint is **dev-only** (under `/dev/*` and uses existing auth).
- It never mutates ontology or Semantic Packs/ActionBlocks.
- It logs the raw AI suggestions and any parsing errors to help refine prompts later.

---

### Task B – AI Hub Integration (Category Mode)

**Files:**

- `pixsim7/backend/main/services/llm/ai_hub_service.py`
- `pixsim7/backend/main/api/v1/ai.py` (optional, if you expose a dedicated route)

**Goal:** Add a small method to `AiHubService` for category discovery that wraps `edit_prompt` or uses a dedicated “analysis” model prompt.

**Suggested method (service-level, not necessarily public API):**

```py
class AiHubService:
    async def suggest_prompt_categories(
        self,
        user: User,
        model_id: Optional[str],
        prompt_text: str,
        analysis_context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Call an LLM model to suggest ontology IDs, semantic pack entries,
        and candidate ActionBlocks for a given prompt and context.

        Returns raw JSON-like dict that dev_prompt_categories.py will parse
        into typed suggestions.
        """
        ...
```

**Implementation notes:**

- You can either:
  - Extend `POST /api/v1/ai/prompt-edit` with a `mode: "analyze"` option and handle it in service, or
  - Keep this as an internal service call from `dev_prompt_categories.py` that uses `llm_registry` directly.
- The LLM prompt should be carefully crafted to:
  - Respect existing ontology structure (core vs domain),
  - Prefer reusing existing IDs where possible,
  - Offer new IDs only when necessary,
  - Respond with strict JSON (no free-form prose in the data part).

---

### Task C – Prompt Lab “Category Suggestions” Tab

**File:** `apps/main/src/routes/PromptLabDev.tsx`

**Goal:** Add a tab or panel in Prompt Lab that lets you:

- Select a prompt (from Analyze or Library view) or paste a new one.
- Run the category discovery endpoint.
- Review and compare suggestions with current parser/ontology coverage.

**UI Behavior:**

- New tab: **Categories** (next to Analyze / Import / Library / Models / Graph).
- Controls:
  - A textarea for `prompt_text` (prefilled from the currently selected prompt in Analyze/Library if available).
  - Optional selectors:
    - `world_id` (if worlds are present; can be a simple text input for now),
    - `pack_ids` (multi-select of existing Semantic Packs, or simple comma-separated input).
  - Button: “Analyze Categories (AI)”. Calls `POST /api/v1/dev/prompt-categories/discover`.
- Results:
  - Show parser summary:
    - Roles found, `ontology_ids` found (chips).
  - Proposed ontology IDs:
    - List `SuggestedOntologyId` entries with kind, label, description, confidence.
  - Proposed pack entries:
    - List `SuggestedPackEntry` entries (pack_id, label, hints summary).
  - Proposed ActionBlocks:
    - List `SuggestedActionBlock` entries with block_id, text, tag chips.
  - Raw JSON (collapsible) for deeper debugging.

No “Apply” buttons yet; this is purely for inspection in this task.

---

### Task D – (Optional) Draft Pack & ActionBlock Helpers

> This is optional but makes the tool more immediately useful. If scope feels too large, document how you’d do it but don’t implement yet.

**Goal:** Add small helpers to turn AI suggestions into draft objects you can later refine:

- Backend helper(s):
  - A function that takes `SuggestedPackEntry` and builds a draft `SemanticPackDB` instance (with `status="draft"`) but does not persist it.
  - A function that takes `SuggestedActionBlock` and builds an `ActionBlockDB` instance (not persisted).

You can surface these as:

- A dev-only “preview payload” in the response (e.g., pre-built dicts you could POST to `semantic_packs` or `action_blocks` APIs later), or
- Just code-level helpers documented in `SEMANTIC_PACKS_IMPLEMENTATION.md` for future use.

No actual creation endpoints are needed in this task; you keep full control over when/if you persist anything.

---

### Task E – Safety & Logging

**Goal:** Ensure the agent’s suggestions are easy to debug and don’t silently corrupt semantics.

**Requirements:**

- Log, at debug level, for each call:
  - `prompt_text` length (not full text unless in debug, to avoid noisy logs),
  - ontology IDs already present,
  - model_id/provider used,
  - counts of suggested ontology IDs, pack entries, and ActionBlocks.
- On parsing errors of the AI’s JSON output:
  - Return a 500 with a clear error message for dev use,
  - Include the raw AI output in the log (not in the API response) for inspection.

---

### Acceptance Checklist

- [ ] `POST /api/v1/dev/prompt-categories/discover` is implemented:
  - [ ] Accepts `PromptCategoryDiscoveryRequest` with `prompt_text` and optional `world_id`/`pack_ids`.
  - [ ] Runs core parser/ontology analysis and calls an LLM via `AiHubService` to get suggestions.
  - [ ] Returns structured `PromptCategoryDiscoveryResponse` with parser summary, existing IDs, and AI suggestions.
- [ ] `AiHubService` has a helper for category discovery that uses the AI model catalog (e.g. default `prompt_edit` model) in a controlled way.
- [ ] Prompt Lab has a **Categories** panel/tab that:
  - [ ] Prefills prompt text from the current selection where possible.
  - [ ] Calls the dev endpoint and displays parser coverage and AI suggestions.
  - [ ] Does not mutate ontology/packs/ActionBlocks (read-only suggestions only in this task).
- [ ] Logging is in place for dev debugging, and JSON parsing failures are handled gracefully with clear errors.

