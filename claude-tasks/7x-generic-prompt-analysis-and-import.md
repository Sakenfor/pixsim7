## 7x – Generic Prompt Analysis & Import Pipeline (Prompt-DSL Backed)

**Goal:** Provide a generic, source-agnostic pipeline for analyzing and importing prompts into PixSim7 using `prompt-dsl`, without tying anything specifically to `pixprompts`, and building on Task 64’s adapter/inspector work.

---

### Context

- Task 64 added a minimal `prompt_dsl_adapter.parse_prompt_to_blocks(text)` and a dev inspector UI for stored prompts.
- This task generalizes that work so *any* prompt source (manual UI, folders of `.txt` files, external systems) can:
  - Be analyzed through `prompt-dsl`.
  - Get a consistent `{prompt, blocks, tags}` structure.
  - Be normalized into existing `PromptFamily` / `PromptVersion` models via a simple import spec.
- **No new DB schemas** and **no `prompt-dsl` types** should leak across the API boundary.

---

### Task A – Extend Prompt DSL Adapter with Generic Analysis

**File:** `pixsim7/backend/main/services/prompt_dsl_adapter.py`

**Requirements:**

- Keep the existing `parse_prompt_to_blocks(text: str)` function as-is from Task 64.
- Add a small tag-derivation helper and a high-level analysis function:

```python
from typing import Dict, Any, List, Set

# ...existing imports + parse_prompt_to_blocks + _map_component_type_to_role...


def _derive_tags_from_blocks(blocks: List[Dict[str, Any]]) -> List[str]:
    """
    Very small, generic tag derivation based only on PixSim7-shaped blocks.

    - Role tags: "has:character", "has:action", etc.
    - Simple intensity/mood hints based on keywords (safe to evolve later).
    """
    role_tags: Set[str] = set()
    keyword_tags: Set[str] = set()

    for block in blocks:
        role = block.get("role")
        text = (block.get("text") or "").lower()

        if role:
            role_tags.add(f"has:{role}")

        # Extremely conservative starter keywords; extend later as needed
        if any(word in text for word in ("gentle", "soft", "tender")):
            keyword_tags.add("tone:soft")
        if any(word in text for word in ("intense", "harsh", "rough", "violent")):
            keyword_tags.add("tone:intense")
        if any(word in text for word in ("pov", "first-person", "viewpoint")):
            keyword_tags.add("camera:pov")
        if any(word in text for word in ("close-up", "close up", "tight framing")):
            keyword_tags.add("camera:closeup")

    # Order is not semantically important, but stable ordering is nice
    return sorted(role_tags) + sorted(keyword_tags)


async def analyze_prompt(text: str) -> Dict[str, Any]:
    """
    Generic, source-agnostic prompt analysis.

    Pure function, no DB access, no source assumptions.
    Returns PixSim7-shaped JSON only.

    Args:
        text: Raw prompt text from any source (UI, files, external systems).

    Returns:
        {
          "prompt": "<original text>",
          "blocks": [...],  # from parse_prompt_to_blocks(...)
          "tags": ["has:character", "tone:soft", ...]
        }
    """
    blocks_result = await parse_prompt_to_blocks(text)
    blocks: List[Dict[str, Any]] = blocks_result.get("blocks", [])
    tags = _derive_tags_from_blocks(blocks)

    return {
        "prompt": text,
        "blocks": blocks,
        "tags": tags,
    }
```

**Notes:**

- This function is intentionally conservative; it can be extended later with richer tagging logic.
- It must remain **pure** (no DB calls, no external services, no LLMs).

---

### Task B – Add Source-Agnostic Prompt Import Helper

**File:** `pixsim7/backend/main/services/prompt_import.py` (new)

**Goal:** Provide a minimal “import spec” and helper that any future importer (pixprompts, manual paste UI, external systems) can use to produce `CreatePromptFamilyRequest` and `CreatePromptVersionRequest` payloads, without each importer having to know about `prompt-dsl`.

**Requirements:**

- Define a lightweight `PromptSource` enum:

```python
from enum import Enum


class PromptSource(str, Enum):
    MANUAL = "manual"
    FILE_IMPORT = "file_import"
    EXTERNAL = "external"
    OTHER = "other"
```

- Define a simple `PromptImportSpec` class (plain Python class, not Pydantic) with:
  - `family_title: str`
  - `prompt_text: str`
  - `source: PromptSource = PromptSource.MANUAL`
  - Optional: `family_slug: Optional[str]`
  - Optional: `prompt_type: str = "visual"`
  - Optional: `category: Optional[str]`
  - Optional: `family_tags: Optional[List[str]]`
  - Optional: `version_tags: Optional[List[str]]`
  - Optional: `family_metadata: Optional[Dict[str, Any]]`
  - Optional: `version_metadata: Optional[Dict[str, Any]]`
  - Optional: `source_reference: Optional[str]` (e.g., a file path or external ID)

- Implement:

```python
from typing import List, Dict, Any, Optional, Tuple

from ..api.v1.prompts.schemas import (
    CreatePromptFamilyRequest,
    CreatePromptVersionRequest,
)
from .prompt_dsl_adapter import analyze_prompt


class PromptImportSpec:
    """
    Minimal, source-agnostic import specification.

    This does NOT touch the database; it only prepares
    CreatePromptFamilyRequest/CreatePromptVersionRequest payloads.
    """

    def __init__(
        self,
        family_title: str,
        prompt_text: str,
        source: PromptSource = PromptSource.MANUAL,
        family_slug: Optional[str] = None,
        prompt_type: str = "visual",
        category: Optional[str] = None,
        family_tags: Optional[List[str]] = None,
        version_tags: Optional[List[str]] = None,
        family_metadata: Optional[Dict[str, Any]] = None,
        version_metadata: Optional[Dict[str, Any]] = None,
        source_reference: Optional[str] = None,
    ) -> None:
        self.family_title = family_title
        self.family_slug = family_slug
        self.prompt_text = prompt_text
        self.prompt_type = prompt_type
        self.category = category

        self.source = source
        self.source_reference = source_reference

        self.family_tags = family_tags or []
        self.version_tags = version_tags or []
        self.family_metadata = family_metadata or {}
        self.version_metadata = version_metadata or {}


async def prepare_import_payloads(
    spec: PromptImportSpec,
) -> Tuple[CreatePromptFamilyRequest, CreatePromptVersionRequest]:
    """
    Pure helper: takes an import spec, runs prompt analysis, and returns
    ready-to-use Pydantic request models for the existing prompts API.

    No DB writes happen here.
    """
    analysis = await analyze_prompt(spec.prompt_text)
    auto_tags: List[str] = analysis.get("tags", [])

    # Family tags: explicit + auto tags (deduplicated)
    family_tags = sorted(set(spec.family_tags + auto_tags))

    # Version tags: explicit + auto tags (deduplicated)
    version_tags = sorted(set(spec.version_tags + auto_tags))

    family = CreatePromptFamilyRequest(
        title=spec.family_title,
        prompt_type=spec.prompt_type,
        slug=spec.family_slug,
        description=None,
        category=spec.category,
        tags=family_tags,
        game_world_id=None,
        npc_id=None,
        scene_id=None,
        action_concept_id=None,
    )

    provider_hints: Dict[str, Any] = dict(spec.version_metadata)
    provider_hints.setdefault("prompt_analysis", analysis)
    provider_hints.setdefault("source", spec.source.value)
    if spec.source_reference:
        provider_hints.setdefault("source_reference", spec.source_reference)

    version = CreatePromptVersionRequest(
        prompt_text=spec.prompt_text,
        commit_message=None,
        author=None,
        parent_version_id=None,
        variables={},
        provider_hints=provider_hints,
        tags=version_tags,
    )

    return family, version
```

**Notes:**

- This helper must:
  - Not talk to the database directly.
  - Not assume any specific source (no hard-coded `pixprompts` logic).
  - Use only existing schemas from `pixsim7/backend/main/api/v1/prompts/schemas.py`.
- Higher-level jobs or routes (future tasks) can:
  - Construct `PromptImportSpec` from any source.
  - Call `prepare_import_payloads(spec)`.
  - Use the resulting request models with existing prompts APIs/repositories to persist data.

---

### Task C – Dev Endpoint to Inspect Arbitrary Prompt Text (Optional, Nice-to-Have)

**File:** `pixsim7/backend/main/api/v1/prompts/dev_routes.py` (new or extend an existing dev router)

**Goal:** Provide a simple dev-only endpoint to quickly see what `analyze_prompt` returns for arbitrary prompt text, without needing an asset/job.

**Endpoint:**

- `POST /api/v1/dev/analyze-prompt`

  - Request body:

    ```json
    { "prompt_text": "..." }
    ```

  - Behavior:
    - If `prompt_text` is empty or missing, return `400`.
    - Call `analyze_prompt(prompt_text)`.

  - Response:

    ```json
    {
      "prompt": "...",
      "blocks": [ /* exactly as from parse_prompt_to_blocks(...) */ ],
      "tags": [ "has:character", "tone:soft", "camera:pov", ... ]
    }
    ```

- This endpoint must:
  - Do no DB writes.
  - Not expose any `prompt-dsl` classes or enums directly (only plain JSON).
  - Be wired similarly to the dev prompt inspector from Task 64 (dev-only surface).

---

### Constraints

- Do **not**:
  - Change or add database tables or columns.
  - Expose `prompt-dsl` types/enums in API responses.
  - Call LLMs from this task.
- Keep `prompt-dsl` usage completely behind:
  - `prompt_dsl_adapter.py`
  - `prompt_import.py`

---

### Acceptance Checklist

- [ ] `analyze_prompt(text)` returns `{prompt, blocks, tags}` for arbitrary prompt text with no DB access.
- [ ] `prepare_import_payloads(spec)` can be called from any importer (manual UI, file-based, external) without modification.
- [ ] No DB schema changes or new tables were added.
- [ ] No `prompt-dsl` types or enums appear in any public API response.
- [ ] (If Task C implemented) `POST /api/v1/dev/analyze-prompt` accepts raw text and returns `{prompt, blocks, tags}`.

