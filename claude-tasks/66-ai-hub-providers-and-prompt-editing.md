## 66 – AI Hub (LLM Providers) & Prompt Editing

**Goal:** Add a minimal “AI hub” inside PixSim7 for prompt editing, reusing the existing provider/account system but keeping LLM vs video providers clearly separated. Support AI-assisted prompt edits and record model + input + output per edit.

---

### Constraints

- Do **not**:
  - Change existing video generation behavior.
  - Call LLMs directly from the frontend.
  - Couple LLM logic to `pixsim-prompt-dsl` (DSL stays parser-only).
- Reuse the existing provider/accounts infrastructure where possible.

---

### Task A – Extend Provider Metadata for LLMs

**Backend files (high level):**
- Provider/domain metadata (where providers are defined).
- Provider/account-related types (no need to change DB schema initially, if you can store `kind` in config/manifest).

**Requirements:**
- Introduce a provider “kind” or capabilities flag:

```ts
// Conceptual
type ProviderKind = 'video' | 'llm' | 'both';
```

- Ensure each provider manifest/config declares:
  - `kind: 'video'` (Pixverse, Sora, etc.),
  - `kind: 'llm'` (OpenAI LLM, Anthropic LLM, local LLM),
  - or `kind: 'both'` if needed later.
- Keep account storage unified:
  - Continue to use existing `ProviderAccount` records for both video and LLM providers.

---

### Task B – LLM Provider Registry & AI Hub Service

**Backend files:**
- Add: `pixsim7/backend/main/services/llm/registry.py` (or similar).
- Add: `pixsim7/backend/main/services/llm/ai_hub_service.py`.
- Add: `pixsim7/backend/main/api/v1/ai.py` (new router).

**LlmProviderRegistry:**
- Similar to video provider registry, but with an LLM interface, e.g.:

```py
class LlmProvider(Protocol):
    provider_id: str
    async def edit_prompt(self, *, model_id: str, prompt_before: str, context: dict | None = None) -> str: ...
```

- Register LLM providers for:
  - `openai-llm`, `anthropic-llm`, `local-llm` (adapters can be stubs initially).

**AI Hub service + API:**
- Add a small service with a single public method:

```py
async def edit_prompt(
    user: User,
    provider_id: str | None,
    model_id: str,
    prompt_before: str,
    context: dict | None = None,
    generation_id: int | None = None,
) -> AiInteraction:
    ...
```

- Add API endpoint: `POST /api/v1/ai/prompt-edit`:
  - Input:
    - `provider_id` (optional, default LLM provider),
    - `model_id` (required),
    - `prompt_before` (required),
    - `context` (optional, JSON),
    - `generation_id` (optional, to link to a snapshot).
  - Output:

```json
{
  "prompt_after": "string",
  "model_id": "openai:gpt-4.1-mini",
  "provider_id": "openai-llm",
  "interaction_id": 123
}
```

---

### Task C – AI Interaction Logging

**Backend files:**
- Add: `pixsim7/backend/main/domain/ai_interaction.py` (SQLModel).
- Add Alembic migration to create `ai_interactions` table.

**AiInteraction model (minimal):**
- Fields:
  - `id: int` (PK),
  - `user_id: int` (FK users),
  - `generation_id: int | None` (FK generations),
  - `provider_id: str`,
  - `model_id: str`,
  - `prompt_before: str`,
  - `prompt_after: str`,
  - `created_at: datetime`.
- In `ai_hub_service.edit_prompt`:
  - After successful LLM call, persist an `AiInteraction` row.
  - Return the row (or its ID) to the API.

**Optional (not required for this task):**
- Later, attach `ai_interaction_id` to `Generation` (e.g. in a JSON metadata field or separate FK) when creating a new snapshot from an AI-edited prompt.

---

### Task D – Minimal Frontend “Edit with AI” Hook & Button (Dev Only)

**Files:**
- Add: `apps/main/src/hooks/usePromptAiEdit.ts`.
- Update: `apps/main/src/components/dev/GenerationDevPanel.tsx` (or another dev prompt surface).

**Hook API (conceptual):**

```ts
interface UsePromptAiEditOptions {
  generationId?: number;
  providerId?: string;
  modelId: string;
  promptBefore: string;
  context?: Record<string, any>;
}

interface PromptAiEditState {
  loading: boolean;
  error: string | null;
  promptAfter: string | null;
  interactionId: number | null;
}
```

- Hook:
  - Exposes a `runEdit()` function that calls `POST /api/v1/ai/prompt-edit`.
  - Manages `{loading, error, promptAfter, interactionId}`.

**Dev UI (first integration point):**
- In `GenerationDevPanel`’s right-hand details:
  - Under the prompt source / prompt inspector section, add:
    - A “Edit with AI (Dev)” button.
    - When clicked:
      - Calls `runEdit()` with `generationId` and `promptBefore` from that generation.
      - Displays `promptAfter` in a small side-by-side or below, with:
        - Buttons: “Use this prompt” (copies to clipboard or shows in a read-only field) and “Dismiss”.
- No automatic generation is triggered in this task; it’s an assisted editor only.

---

### Acceptance Checklist

- [x] Providers can declare `kind: 'video' | 'llm'`, and LLM providers are registered in a dedicated `LlmProviderRegistry`.
- [x] `POST /api/v1/ai/prompt-edit` accepts a prompt and returns a suggested edited prompt, plus metadata.
- [x] Each successful AI edit is persisted in `ai_interactions` with `prompt_before`, `prompt_after`, `model_id`, and `provider_id`.
- [x] A dev-only "Edit with AI" button exists for a generation, calling the new API and showing `promptAfter` without changing any existing generation flows.

---

## ✅ Implementation Complete (2025-11-25)

### Summary

AI Hub feature has been successfully implemented with the following components:

**Backend:**
- ✅ Provider metadata extended with `kind` field (`ProviderKind.VIDEO | LLM | BOTH`)
- ✅ Shared `ProviderManifest` schema (`shared/schemas/provider_schemas.py`)
- ✅ LLM provider registry (`services/llm/registry.py`)
- ✅ LLM provider adapters for OpenAI, Anthropic, and local LLMs (`services/llm/adapters.py`)
- ✅ Provider manifests for all LLM providers (`providers/openai_llm`, `anthropic_llm`, `local_llm`)
- ✅ AI Hub service (`services/llm/ai_hub_service.py`)
- ✅ API endpoint `POST /api/v1/ai/prompt-edit` (`api/v1/ai.py`)
- ✅ Route plugin for AI API (`routes/ai/`)
- ✅ `AiInteraction` domain model (`domain/ai_interaction.py`)
- ✅ Alembic migration for `ai_interactions` table (migration: `20251125_0000_create_ai_interactions.py`)

**Frontend:**
- ✅ `usePromptAiEdit` hook (`hooks/usePromptAiEdit.ts`)
- ✅ "Edit with AI (Dev)" button in GenerationDevPanel
- ✅ AI-edited prompt display with copy-to-clipboard functionality

**Documentation:**
- ✅ AiHubService added to `docs/backend/SERVICES.md`
- ✅ AI Hub feature added to main `README.md`

### Testing Instructions

1. **Run database migration:**
   ```bash
   alembic upgrade head
   ```

2. **Set API keys (environment variables):**
   ```bash
   export OPENAI_API_KEY=sk-...
   export ANTHROPIC_API_KEY=sk-ant-...
   ```

3. **Start the backend:**
   ```bash
   python -m pixsim7.backend.main.main
   ```

4. **Test the API:**
   ```bash
   curl -X POST http://localhost:8001/api/v1/ai/prompt-edit \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <your-token>" \
     -d '{
       "model_id": "gpt-4",
       "prompt_before": "A sunset",
       "context": {"style": "cinematic"}
     }'
   ```

5. **Test the UI:**
   - Navigate to the Generation Dev Panel
   - Select a generation with a prompt
   - Click "Edit with AI (Dev)" button
   - View AI-refined prompt and copy to clipboard

### Notes

- LLM providers are auto-discovered at startup like video providers
- Provider registry now handles both video and LLM providers based on `kind`
- All AI interactions are logged to the `ai_interactions` table for audit
- The UI integration is dev-only and doesn't trigger automatic generation

