## 82 – PixSim7-Native Prompt Parser & Ontology Bridge (Replace prompt-dsl Dependency)

**Goal:** Replace the current `prompt_dsl` dependency in PixSim7 with a small, native parser module and a clear ontology bridge. Keep the functionality we actually use today (parse prompt → `{role, text}` blocks + tags) while positioning the parser to evolve around a PixSim7-defined ontology and ActionBlocks, not around the prompt-dsl framework.

---

### Context

Current state:

- PixSim7 uses `prompt_dsl` only for:
  - `PromptParser` (with the built-in `simple` engine),
  - `LogicalComponent` and `ComponentType`,
  - then immediately maps those to PixSim7 blocks in `prompt_dsl_adapter.py`:

    ```py
    {
      "role": "character" | "action" | "setting" | "mood" | "romance" | "other",
      "text": "...",
      "component_type": "character.identity"  # optional
    }
    ```

- PixSim7 **does not** use prompt-dsl’s:
  - SQLModel persistence (`dsl_prompts`, `dsl_components`, `PromptPersistence`),
  - REST API router (`/api/dsl/*`),
  - version control, component library, AST, macros, query API.

- PixSim7 already has its own canonical prompt + block systems:
  - `PromptFamily` / `PromptVersion` for versioned prompts.
  - `ActionBlockDB` (ActionBlocks) for reusable blocks with tags and compatibility.

This task makes parsing a **PixSim7-native concern** while keeping a clean adapter boundary and preparing for a future ontology.

---

### Task A – Introduce a Minimal PixSim7 Parser Module

**Files (backend):**

- Add: `pixsim7/backend/main/services/prompt_parser/__init__.py`
- Add: `pixsim7/backend/main/services/prompt_parser/simple.py`

**Design goals:**

- No external dependencies beyond standard library + Pydantic/typing.
- Deterministic, lightweight, and testable.
- Focus on the subset we actually use:
  - Split prompt text into blocks.
  - Classify each block into a coarse `role` (`character`, `action`, `setting`, `mood`, `romance`, `other`).
  - Provide enough metadata for Prompt Lab and ActionBlocks integration.

**Proposed types (Python):**

```py
# pixsim7/backend/main/services/prompt_parser/simple.py
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel


class ParsedRole(str, Enum):
    CHARACTER = "character"
    ACTION = "action"
    SETTING = "setting"
    MOOD = "mood"
    ROMANCE = "romance"
    OTHER = "other"


class ParsedBlock(BaseModel):
    role: ParsedRole
    text: str
    start_pos: int
    end_pos: int
    sentence_index: int
    metadata: dict = {}


class ParsedPrompt(BaseModel):
    text: str
    blocks: List[ParsedBlock]
```

**Parser behavior (`SimplePromptParser`):**

- Implement a `SimplePromptParser` class with:

  ```py
  class SimplePromptParser:
      async def parse(self, text: str) -> ParsedPrompt: ...
  ```

- Rules (first pass, intentionally simple but a bit better than current prompt-dsl `SimpleParser`):
  - Sentence splitting:
    - Similar to `prompt_dsl.engines.simple_parser.SimpleParser._split_sentences`:
      - Split by `.?!` with basic regex.
      - Track `start_pos`, `end_pos`, and `sentence_index`.
  - Classification (heuristics only):
    - If sentence mentions known character keywords (e.g., “werewolf”, “vampire”, “woman”, “man”, “minotaur”), mark as `CHARACTER` **and** `ACTION` if verbs like “enters”, “walks”, “leans”, “kisses” appear (prefer `ACTION` but record hints in `metadata`).
    - If camera words appear (“camera”, “shot”, “frame”, “close-up”, “POV”), mark as `OTHER` with `metadata["camera"] = True` (later mapped to `other` role, but metadata kept).
    - If setting words appear (“forest”, “castle”, “street”, “bedroom”), mark as `SETTING`.
    - If emotional words appear (“afraid”, “anxious”, “teasing”, “tender”), mark as `MOOD`.
    - If romance/sexual words appear (configurable list), mark as `ROMANCE`.
    - Fallback: `ACTION` if verbs, else `OTHER`.
  - Store raw hints in `metadata` (e.g. `{"has_verb": True, "has_camera_word": True}`) for future ontology mapping.

This parser replaces direct use of `PromptParser(simple)` in PixSim7.

---

### Task B – Replace prompt-dsl Usage in prompt_dsl_adapter

**File:** `pixsim7/backend/main/services/prompt_dsl_adapter.py`

**Goal:** Stop importing `prompt_dsl` in this file; instead, use the new `SimplePromptParser` while keeping the external API shape the same (so Prompt Lab and dev tools don’t break).

**Changes:**

- Remove imports from `prompt_dsl`:

  ```py
  - from prompt_dsl import PromptParser, LogicalComponent, ComponentType
  + from pixsim7.backend.main.services.prompt_parser.simple import SimplePromptParser, ParsedRole
  ```

- Replace `_map_component_type_to_role(component_type: ComponentType) -> str` with a simple mapping from `ParsedRole` to role string (or remove it entirely and use `ParsedBlock.role.value` directly).

- Update `parse_prompt_to_blocks(text: str, model_id: Optional[str] = None)`:

  - Ignore `model_id` for now (or accept it but only support `"native:simple"` as a no-op).
  - Instantiate and use `SimplePromptParser`:

    ```py
    parser = SimplePromptParser()
    result = await parser.parse(text)
    ```

  - Build `blocks` from `result.blocks`:

    ```py
    blocks = [
      {
        "role": block.role.value,
        "text": block.text,
        # Optionally include classification hints from metadata
      }
      for block in result.blocks
    ]
    ```

- Keep `_derive_tags_from_blocks` and `analyze_prompt` signatures the same so Prompt Lab and dev_prompt_inspector continue to work unchanged.

**Note:** Do not remove `prompt_dsl_adapter` itself; it becomes the stable bridge between the native parser and the rest of PixSim7.

---

### Task C – Introduce a Minimal Ontology Stub for Roles & Tags

> This is not “Ontology v1” yet; it’s a small step that keeps the parser ready for it.

**File:** `pixsim7/backend/main/services/prompt_parser/ontology.py` (new)

**Goal:** Centralize role names and basic keyword lists in one place so future ontology work can expand here without touching the parser everywhere.

**Contents (example):**

```py
ROLE_KEYWORDS = {
    "character": ["werewolf", "vampire", "minotaur", "woman", "man", "person", "character"],
    "action": ["enters", "walks", "moves", "approaches", "touches", "leans", "kisses"],
    "setting": ["forest", "castle", "street", "bedroom", "park", "bar", "lounge"],
    "mood": ["afraid", "anxious", "teasing", "tender", "eager"],
    "romance": ["kiss", "embrace", "romance", "lover"],
    "camera": ["camera", "frame", "shot", "close-up", "pov"],
}
```

- `SimplePromptParser` reads from this module to classify sentences.
- Later, Ontology v1 can replace this with a typed model and richer structure; parser code doesn’t need to change much.

---

### Task D – Remove prompt-dsl Dependency from PixSim7 (Backend)

**Goal:** Once Task B is complete and tests/dev tools are green, remove the `prompt_dsl` dependency and imports from PixSim7’s backend.

**Steps:**

- Search for `prompt_dsl` imports in PixSim7:

  - `pixsim7/backend/main/services/prompt_dsl_adapter.py` (already updated in Task B).
  - Any remaining references (if any) should be removed or adapted to use the native parser.

- Update backend dependencies:
  - Remove `prompt_dsl` from any `requirements.txt` or environment docs in PixSim7 (the separate `pixsim-prompt-dsl` repo can remain for experimentation if desired, but PixSim7 won’t depend on it).

**Note:** Do not touch ActionBlocks or AI Hub in this task; they will later consume ontology tags and parser output via adapters, not prompt-dsl types.

---

### Task E – Frontend: Keep Prompt Lab & Dev Tools Working

**Goal:** Ensure that all dev UIs (Prompt Lab, Prompt Inspector, DevPromptImporter, GenerationDevPanel) continue to work with the new parser without any API changes.

Because `prompt_dsl_adapter.analyze_prompt` keeps returning:

```json
{
  "prompt": "...",
  "blocks": [
    { "role": "character", "text": "...", "component_type": "..."? }
  ],
  "tags": ["has:character", "tone:soft", ...]
}
```

no frontend changes should be required for:

- `PromptInspectorDev` route.
- `DevPromptImporter` (it only cares about tags/analysis stored in `provider_hints`).
- Prompt Lab Analyze / Library tabs (they call `/dev/prompt-inspector/analyze-prompt` and `/dev/prompt-library/versions/{id}`).

**Validation:** Manually test:

- `/dev/prompt-inspector` for prompts from existing generations.
- `/dev/prompt-lab` Analyze tab for arbitrary text.
- `/dev/prompt-importer` for imported prompts (analysis stored in `prompt_analysis` still looks correct).

---

### Out of Scope (for this Task)

- Implementing Ontology v1 (full, rich ontology; that's a separate task).
- Integrating parser output directly with ActionBlocks (still via existing adapters).
- AI model catalog integration (Task 80); this task assumes we are not merging that branch yet.

---

### Acceptance Checklist

- [ ] A new native parser module (`prompt_parser.simple.SimplePromptParser`) exists, with:
  - [ ] `ParsedPrompt` and `ParsedBlock` models.
  - [ ] Basic sentence splitting and role classification based on shared keywords.
- [ ] `prompt_dsl_adapter.parse_prompt_to_blocks` and `analyze_prompt`:
  - [ ] Use the native parser instead of `prompt_dsl.PromptParser`.
  - [ ] Keep the external API shape unchanged (`{"blocks": [...]}` + tags).
- [ ] All imports of `prompt_dsl` are removed from PixSim7 backend.
- [ ] Dev UIs (Prompt Inspector, Prompt Lab Analyze/Library, DevPromptImporter, GenerationDevPanel) work without code changes.
- [ ] No changes were made to ActionBlocks, PromptVersion, or game systems in this task.

