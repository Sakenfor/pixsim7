## 65 – Prompt Blocks Viewer & Reusable Inspection UI

**Goal:** Turn the dev prompt inspector into reusable UI so any place that shows a prompt (dev panels, generation detail, fullscreen viewers) can also show parsed prompt blocks, without duplicating logic or leaking DSL types.

---

### Constraints

- Do **not**:
  - Change existing DB schemas or generation behavior.
  - Expose `prompt_dsl` types/enums in React props or API responses.
  - Add LLM calls in this task.
- Reuse the existing backend endpoint:
  - `GET /api/v1/dev/prompt-inspector?asset_id=...` or `?job_id=...`

---

### Task A – Reusable `PromptBlocksViewer` Component

**Files:**
- Add: `apps/main/src/components/prompts/PromptBlocksViewer.tsx`
- Update: `apps/main/src/routes/PromptInspectorDev.tsx`

**Component API:**

```ts
interface PromptBlock {
  role: 'character' | 'action' | 'setting' | 'mood' | 'romance' | 'other';
  text: string;
  component_type?: string;
}

interface PromptBlocksViewerProps {
  prompt: string;
  blocks: PromptBlock[];
  collapsible?: boolean;   // default false
  initialOpen?: boolean;   // default true
}
```

**Behavior:**

- Renders:
  - A read-only prompt view (textarea or monospaced box).
  - Parsed blocks grouped by `role`, with simple role-based coloring.
- If `collapsible` is true:
  - Show a small header with a toggle (e.g. “Prompt Analysis ▾”).
  - When collapsed, hide both prompt and blocks; when expanded, show all.
- Pure presentational:
  - No data fetching.
  - No knowledge of asset IDs or job IDs.

**Refactor `PromptInspectorDev`:**

- Replace inline “Parsed Components” UI with `<PromptBlocksViewer prompt={result.prompt} blocks={result.blocks} />`.
- Keep its input fields and `Inspect` button logic intact.

---

### Task B – `usePromptInspection` Hook

**Files:**
- Add: `apps/main/src/hooks/usePromptInspection.ts`
- Update: `apps/main/src/routes/PromptInspectorDev.tsx` (use the hook)

**Hook API:**

```ts
interface UsePromptInspectionOptions {
  assetId?: number;
  jobId?: number;
}

interface PromptInspectionState {
  prompt: string | null;
  blocks: PromptBlock[];
  loading: boolean;
  error: string | null;
}

export function usePromptInspection(options: UsePromptInspectionOptions): PromptInspectionState;
```

**Behavior:**

- Whenever `options.assetId` or `options.jobId` changes:
  - If neither is set → `prompt=null`, `blocks=[]`, `loading=false`, `error=null`.
  - If both are set → `error="Please provide only one of assetId or jobId"` (or similar), no request.
  - If exactly one is set:
    - Set `loading=true`, clear previous error.
    - Call `GET /dev/prompt-inspector?asset_id=...` **or** `?job_id=...` using `useApi()`.
    - On success, set `prompt` and `blocks`.
    - On failure, set `error` and clear `blocks` (keep `prompt` null or previous value).

**Integrate into `PromptInspectorDev`:**

- Keep the two text inputs (`assetId`, `jobId`) local in the route.
- On “Inspect” button click:
  - Validate “only one of assetId/jobId”.
  - Store parsed numeric IDs in local state (`activeAssetId`, `activeJobId`).
- Call `usePromptInspection({ assetId: activeAssetId, jobId: activeJobId })`.
- Use hook state for:
  - `loading` (button label / disabled).
  - `error` (error message area).
  - `prompt` + `blocks` passed into `<PromptBlocksViewer>`.

---

### Task C – Light Integration in `GenerationDevPanel`

**Files:**
- Update: `apps/main/src/components/dev/GenerationDevPanel.tsx`

**Behavior (minimal, non-invasive):**

- In the right-hand “Generation Details” panel, under the existing sections:
  - Add a small “Prompt Inspector” row for the selected generation:
    - Either:
      - A button: `Inspect Prompt (Dev)` that opens `/dev/prompt-inspector?job_id=<selectedGeneration.id>` in the same tab or new tab.
    - Or, if you want inline:
      - A small, collapsed `<PromptBlocksViewer>` section using `usePromptInspection({ jobId: selectedGeneration.id })` with `collapsible={true}` and `initialOpen={false}`.
- Keep this clearly labeled as a dev-only helper (e.g. `Prompt (Dev Inspector)`).
- Do **not** change how generations are fetched or stored; this is read-only.

---

### Acceptance Checklist

- [ ] `PromptBlocksViewer` compiles and renders correctly in `PromptInspectorDev`.
- [ ] `usePromptInspection` correctly calls `/dev/prompt-inspector` and handles:
  - assetId-only, jobId-only, neither, both.
- [ ] `PromptInspectorDev` uses the hook instead of inlining fetch + reduce logic.
- [ ] `GenerationDevPanel` exposes a clear way to inspect the prompt for the selected generation (either link or inline collapsed viewer).
- [ ] No new direct references to `prompt_dsl` appear outside the backend adapter.

