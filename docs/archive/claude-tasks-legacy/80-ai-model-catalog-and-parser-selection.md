## 80 – AI Model Catalog & Parser Selection (Shared Between AI Hub & Prompt Lab)

**Goal:** Introduce a single AI model catalog that describes all “AI-ish” capabilities (prompt editing, parsing, tagging, etc.), and use it both for AI Hub (LLM providers) and Prompt Lab (prompt parsing/analysis). Keep the existing provider registries as low-level plumbing and add a higher-level `AiModelRegistry` and dev UI for selecting models/engines.

---

### Context

Already implemented:

- **Provider/AI Hub layer:**
  - `ProviderKind` (`video | llm | both`) and provider manifests (`provider_schemas.py`).
  - Video provider registry (`services/provider/registry.py`) for generation providers.
  - LLM provider registry (`services/llm/registry.py`) and `AiHubService` (`services/llm/ai_hub_service.py`).
  - AI Hub API (`api/v1/ai.py`) and “Edit with AI” frontend hook/button.

- **Prompt parsing/analysis layer:**
  - `prompt_dsl_adapter.parse_prompt_to_blocks(text)` and `analyze_prompt(text)` using the native `SimplePromptParser` (`prompt_parser.simple`) behind the adapter.
  - Prompt Lab (`/dev/prompt-lab`) with Analyze / Import / Library tabs, using `analyze_prompt` and the dev prompt library APIs.

Missing:

- A **single place** to describe “models/engines” and their capabilities:
  - LLM models for prompt editing (`prompt_edit`).
  - Parsing/analysis engines (`prompt_parse`), including deterministic (`prompt-dsl`) and optional AI-based parsing.
- A way for Prompt Lab and AI Hub to **refer to the same model definitions** instead of having separate ad-hoc dropdowns.

This task adds an `AiModelRegistry` and a small dev UI to configure default models per capability.

---

### Design Overview

**Key idea:** Keep the **existing provider registries** (video, LLM) as transport-level details, and introduce a new `AiModelRegistry` that sits above them and is what the UI picks from.

- `AiModel` entries describe **capabilities and IDs**, not HTTP/SDK details.
- Some models are:
  - **Remote LLM models:** e.g., `"openai:gpt-4.1-mini"`, `"anthropic:claude-3.5"`, backed by `llm_registry` providers.
  - **Local parsing engines:** e.g., `"parser:native-simple"`, `"parser:native-strict"`, backed by PixSim7's native parser configuration.
- Capabilities drive usage:
  - `prompt_edit` → AI Hub / `/api/v1/ai/prompt-edit`.
  - `prompt_parse` → Prompt Lab / `prompt_dsl_adapter` (or AI-assisted parser).

---

### Task A – Backend: AiModelRegistry & Model Definitions

**Files:**

- Add: `pixsim7/backend/main/services/ai_model/registry.py`
- Add: `pixsim7/backend/main/shared/schemas/ai_model_schemas.py`

**AiModel schema (conceptual):**

```py
# pixsim7/backend/main/shared/schemas/ai_model_schemas.py
from enum import Enum
from pydantic import BaseModel
from typing import List, Literal, Optional


class AiModelKind(str, Enum):
    LLM = "llm"       # Remote LLM text model
    PARSER = "parser" # Parsing/analysis engine
    BOTH = "both"     # Supports both roles


class AiModelCapability(str, Enum):
    PROMPT_EDIT = "prompt_edit"
    PROMPT_PARSE = "prompt_parse"
    TAG_SUGGEST = "tag_suggest"


class AiModel(BaseModel):
    id: str                      # "openai:gpt-4.1-mini", "parser:native-simple", etc.
    label: str                   # Human-readable ("GPT-4.1 Mini", "Native Simple Parser")
    provider_id: Optional[str]   # "openai-llm", "internal-parser", etc.
    kind: AiModelKind
    capabilities: List[AiModelCapability]
    default_for: List[AiModelCapability] = []  # Which capabilities this is default for (optional hint)
    description: Optional[str] = None
```

**AiModelRegistry:**

```py
# pixsim7/backend/main/services/ai_model/registry.py
from typing import Dict, List
from .schemas.ai_model_schemas import AiModel, AiModelCapability


class AiModelRegistry:
    def __init__(self):
        self._models: Dict[str, AiModel] = {}

    def register(self, model: AiModel) -> None:
        self._models[model.id] = model

    def get(self, model_id: str) -> AiModel:
        return self._models[model_id]

    def list_all(self) -> List[AiModel]:
        return list(self._models.values())

    def list_by_capability(self, capability: AiModelCapability) -> List[AiModel]:
        return [m for m in self._models.values() if capability in m.capabilities]

    def clear(self) -> None:
        self._models.clear()


ai_model_registry = AiModelRegistry()
```

**Initialization:**

- Add a small initializer (e.g., `pixsim7/backend/main/services/ai_model/bootstrap.py`) that is called at startup (e.g. from main app init):
  - Registers at least:
    - `AiModel(id="parser:native-simple", label="Native Simple Parser", provider_id="internal-parser", kind=AiModelKind.PARSER, capabilities=[AiModelCapability.PROMPT_PARSE], default_for=[AiModelCapability.PROMPT_PARSE])`
    - (Optional) additional parser variants if needed (e.g., `"parser:native-strict"`).
    - A couple of LLM models (for prompt editing):
      - `"openai:gpt-4.1-mini"` → provider `"openai-llm"`, capabilities `[PROMPT_EDIT, TAG_SUGGEST]`.
      - `"anthropic:claude-3.5"` → provider `"anthropic-llm"`, capabilities `[PROMPT_EDIT]`.

**Important:** AiModelRegistry **does not** directly call providers; it only stores metadata and points at provider IDs or internal engines.

---

### Task B – Backend: Dev API for AI Models & Defaults

**File:** `pixsim7/backend/main/api/v1/dev_ai_models.py` (new)

**Goal:** Dev-only API for listing AI models and setting default models per capability (prompt_edit, prompt_parse).

**Endpoints:**

1. `GET /api/v1/dev/ai-models`

   - Returns all models from `ai_model_registry.list_all()` as JSON.
   - Shape can mirror `AiModel` schema.

2. `GET /api/v1/dev/ai-models/defaults`

   - Returns current defaults per capability, e.g.:

     ```json
     {
       "prompt_edit": "openai:gpt-4.1-mini",
       "prompt_parse": "prompt-dsl:simple"
     }
     ```

   - For this task, it’s acceptable to store defaults in a simple in-memory module-level dict, or (better) in a generic `settings`/`config` table if available. Keep it **dev-only** and simple.

3. `POST /api/v1/dev/ai-models/defaults`

   - Body:

     ```json
     {
       "prompt_edit": "anthropic:claude-3.5",
       "prompt_parse": "prompt-dsl:simple"
     }
     ```

   - Updates the defaults mapping after validating that the model IDs exist and support the given capability.
   - Returns the updated defaults.

**Mounting:**

- Add a route plugin similar to `dev_prompt_library` / `dev_prompt_import`:
  - `pixsim7/backend/main/routes/dev_ai_models/manifest.py`
  - Prefix: `/api/v1`
  - `tags: ["dev", "ai", "models"]`

---

### Task C – Wire AiModelRegistry into AI Hub & Prompt Parsing

**Goal:** Use the catalog to resolve “which model/engine to use” for:

- AI Hub prompt editing (`/api/v1/ai/prompt-edit`).
- Prompt parsing in Prompt Lab (`prompt_dsl_adapter` / Prompt Lab Analyze tab).

**For AI Hub (`ai.py` / `AiHubService`):**

- When `provider_id` is omitted in `PromptEditRequest`:
  - Instead of hardcoding `"openai-llm"`, look up the default `prompt_edit` model from the new defaults API/config.
  - Resolve its `provider_id` and pass that to `llm_registry.get(provider_id)` as today.
  - If the client explicitly passes a `model_id`, you can optionally respect that by looking it up in `AiModelRegistry` and ignoring/defaulting `provider_id`.

**For Prompt Parsing (`prompt_dsl_adapter`):**

- Currently, `parse_prompt_to_blocks` always uses `PromptParser` with `engine='simple'`.
- Update adapter to accept an optional `model_id` or `engine_id`, or internally read the default `prompt_parse` model (via a small helper function that queries defaults).
- For now, only support:
  - `prompt-dsl:simple` → existing `PromptParser(engine='simple')` path.
- Later, additional models can be added:
  - `prompt-dsl:strict` → stricter engine or configuration.
  - `ai:tagging-model` → call AI Hub with a tagging prompt and map results into blocks/tags.

**Important:** In this task, it’s enough to **read** the default `prompt_parse` model ID and use it to decide which local engine to call. No AI-based parsing is required yet; that can be a follow-up.

---

### Task D – Frontend: “Models & Engines” Tab in Prompt Lab

**File:** `apps/main/src/routes/PromptLabDev.tsx` (extend existing Prompt Lab)

**Goal:** Add a new tab (or a section) in Prompt Lab for inspecting AI models and setting defaults per capability.

**UI Features:**

- Add a fourth tab called **Models** or **Models & Engines**.
- In this tab:
  - Fetch `GET /api/v1/dev/ai-models` and show a table/list:
    - Columns: ID, Label, Kind, Capabilities, Provider, Description.
  - Fetch `GET /api/v1/dev/ai-models/defaults` and show current defaults:
    - A small card: “Default prompt editor” → dropdown of models with `PROMPT_EDIT` capability.
    - A small card: “Default prompt parser” → dropdown of models with `PROMPT_PARSE` capability.
  - Changing a dropdown sends `POST /api/v1/dev/ai-models/defaults` with the selected ID.

**Integration hints:**

- For Analyze tab:
  - Show which parser model is currently in use (e.g., “Using `prompt-dsl:simple`”) near the Analyze button.
  - Optionally link to the Models tab (“Change parser model…”).

- For AI Hub (optional in this task):
  - You can add a note in the “Edit with AI” dev surface indicating which model is default, but full AI Hub UI integration can remain separate.

---

### Acceptance Checklist

- [ ] `AiModel` schema and `AiModelRegistry` are implemented and initialized with at least:
  - [ ] One deterministic parser model (`parser:native-simple`) with `PROMPT_PARSE` capability.
  - [ ] At least one LLM model (`openai:gpt-4.1-mini` or similar) with `PROMPT_EDIT` capability.
- [ ] Dev API:
  - [ ] `GET /api/v1/dev/ai-models` lists all models.
  - [ ] `GET /api/v1/dev/ai-models/defaults` returns default IDs per capability.
  - [ ] `POST /api/v1/dev/ai-models/defaults` updates defaults with validation.
- [ ] AI Hub:
  - [ ] Uses the model catalog/defaults for choosing provider/model when none is explicitly specified (no behavior change when defaults match current behavior).
- [ ] Prompt parsing:
  - [ ] `prompt_dsl_adapter` reads the default `prompt_parse` model ID and uses the native `SimplePromptParser` configuration corresponding to that model (e.g. `parser:native-simple`).
  - [ ] No AI-based parsing is required yet; deterministic path still works.
- [ ] Prompt Lab UI:
  - [ ] New Models tab shows all AI models and current defaults.
  - [ ] Defaults can be changed via dropdowns and persisted via the dev API.
  - [ ] Analyze tab displays which parser model is currently in effect (informational).

---

### Note on Defaults Storage

- The `AiModelRegistry` itself is in-memory and code-defined (like provider manifests); it only describes what models/engines exist and their capabilities.
- The **chosen defaults** for each capability (e.g., default `prompt_edit` and `prompt_parse` models) should be stored in a small database table (e.g. `ai_model_defaults`), not in memory or JSON files:
  - Minimum columns: `id`, `scope_type` (`global` | `user` | `workspace`), `scope_id` (nullable for global), `capability` (`prompt_edit`, `prompt_parse`, ...), `model_id`, timestamps.
  - For this task, it is sufficient to implement a single global default per capability.
- The dev defaults API in Task B should read/write this table, and callers (AI Hub, prompt parsing) should:
  - Query the table for the relevant capability/scope.
  - Fall back to hardcoded code defaults when no row exists.
