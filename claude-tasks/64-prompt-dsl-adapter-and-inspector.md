## 64 – Minimal Prompt DSL Adapter & Inspector

**Goal:** Use `pixsim-prompt-dsl` only to *analyze* prompts and show structured blocks in a dev UI. No DB/schema changes. No changes to generation behavior.

---

### Constraints

- Do **not**:
  - Change existing DB models or add new tables.
  - Store DSL types/enums in responses or database.
  - Call LLMs from this task.
- Keep all DSL usage behind a thin adapter in the backend.

---

### Task A – Backend Adapter (Prompt → Blocks)

**Files (PixSim7 repo):**
- Add: `pixsim7/backend/main/services/prompt_dsl_adapter.py`

**Requirements:**
- Import only the **Core v1 API** from `prompt_dsl`:
  - `PromptParser`
  - `LogicalComponent` / `ComponentType` (or equivalent) if needed for mapping.
- Implement:

```python
async def parse_prompt_to_blocks(text: str) -> dict:
    """
    Pure function: text -> {"blocks": [...]}
    Blocks are PIXSIM7-SHAPED JSON, not DSL objects.
    """
```

- Output shape (PixSim7 owned, parser-agnostic):

```json
{
  "blocks": [
    { "role": "character" | "action" | "setting" | "mood" | "romance" | "other",
      "text": "..." }
  ]
}
```

- Add a small mapping from DSL component types → `role`:
  - Character-like components → `"character"`
  - Action/beat components → `"action"`
  - Romance/intimacy beats (if available) → `"romance"`
  - Everything else → `"other"`.
- Adapter **must not** return DSL classes; convert to plain dicts/strings.

---

### Task B – Dev API Endpoint (Prompt Inspector)

**Files:**
- Modify: `pixsim7/backend/main/api/v1` (add a small dev router or extend an existing dev router).

**Endpoint:**
- `GET /api/v1/dev/prompt-inspector`
  - Query params: **exactly one** of:
    - `asset_id: int` **or**
    - `job_id: int`
  - Behavior:
    - Look up the stored prompt text for the given `asset_id` or `job_id` using existing services.
    - If not found or no prompt → `404`.
    - Call `parse_prompt_to_blocks(prompt_text)` from Task A.
  - Response JSON:

```json
{
  "prompt": "full original prompt text",
  "blocks": [ ... ]  // exactly as returned from adapter
}
```

No extra fields. No DSL types in the response.

---

### Task C – Frontend Dev Panel: Prompt Inspector

**Files (apps/main):**
- Add: `apps/main/src/routes/PromptInspectorDev.tsx`
- Wire route: `/dev/prompt-inspector` in `apps/main/src/App.tsx` (ProtectedRoute, dev-only surface like `/dev/modules`).

**UI behavior (simple):**
- Text input for `asset_id` and `job_id` (at most one filled).
- “Inspect” button → calls `GET /api/v1/dev/prompt-inspector`.
- Show:
  - Left side: `<textarea readonly>` with `prompt`.
  - Right side: list of blocks grouped by `role` (character / action / romance / other).
- No editing, no saving. **Read-only inspector**.

---

### Acceptance Checklist

- [ ] Backend builds and runs with `pixsim-prompt-dsl` installed.
- [ ] `GET /api/v1/dev/prompt-inspector?asset_id=...` returns `{prompt, blocks}` for assets that have a prompt.
- [ ] `/dev/prompt-inspector` route renders and shows parsed blocks without errors.
- [ ] No database schemas or main generation flows were changed in this task.

