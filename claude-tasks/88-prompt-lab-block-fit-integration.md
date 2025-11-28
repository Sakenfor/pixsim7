## 88 – Prompt Lab ↔ Block/Image Fit Integration

**Goal:** Connect Prompt Lab with the Block Fit dev tools so you can move easily between “what does this prompt/block mean?” and “does it actually fit this image?”. This is glue work: no new algorithms, just wiring existing endpoints/UX together.

---

### Context

Already implemented:

- **Prompt Lab (`/dev/prompt-lab`):**
  - Analyze tab: parses prompts via native parser + ontology; shows `blocks` and tags.
  - Library tab: lists PromptFamilies and PromptVersions; shows prompt text & analysis.
  - Graph & Models & Categories tabs for various dev views.

- **Block/Image Fit tools:**
  - `BlockImageFit` model + migration (`block_image_fit.py`).
  - `compute_block_asset_fit` + `explain_fit_score` (`services/action_blocks/fit_scoring.py`).
  - Asset tagging via `tag_asset_from_metadata` (`services/assets/tags.py`).
  - Dev API under `/api/v1/dev/block-fit/score` and `/rate`.
  - Dev UI route `/dev/block-fit` (`BlockFitDev.tsx`). 

Missing:

- A smooth way from Prompt Lab to:
  - Select a block/prompt + asset and see fit/ratings. 
  - Seed BlockFitDev with a chosen block + asset from Prompt Lab.

---

### Task A – Add “Test Fit…” Actions in Prompt Lab Library

**File:** `apps/main/src/routes/PromptLabDev.tsx`

**Goal:** Let you trigger a block↔image fit analysis starting from a prompt/version context.

**Behavior:**

- In the Library tab’s **Version Detail** area, add:
  - A small “Test Fit…” panel with:
    - Input: `asset_id` (number).
    - Select: `role_in_sequence` (`initial` / `continuation` / `transition` / `unspecified`).
    - Button: “Open Block Fit with This Prompt”.  

**Implementation options:**

- For first version, simplest is to navigate to `/dev/block-fit` with query params, e.g.:

  - `window.location.href = /dev/block-fit?prompt_version_id=...&asset_id=...`

- Then in `BlockFitDev.tsx`, interpret those query params as defaults:
  - Load the PromptVersion and show its prompt text.
  - For now, let the user manually choose a specific `block_id` from that prompt’s linked ActionBlocks (or type it). 

Later you can refine to auto-suggest specific blocks; for now, this task only wires the navigation and pre-filling.

---

### Task B – Pre-fill BlockFitDev from Query Params

**File:** `apps/main/src/routes/BlockFitDev.tsx`

**Goal:** Make `/dev/block-fit` accept query params so Prompt Lab can seed it.

**Behavior:**

- Parse `prompt_version_id` and `asset_id` from `window.location.search` on mount.
- If provided:
  - Show the prompt text (via existing prompts API/PromptVersion fetch) in a read-only box.
  - Pre-fill the `asset_id` input.
  - Optionally show a hint like “Loaded from PromptLab (PromptVersion XYZ)”. 

**Note:** Selecting the specific block is still manual in this task. The key is that you land on BlockFitDev already focused on the right asset and with the prompt visible.

---

### Task C – (Optional) Shortcut from ActionBlock Context

> Optional, but small and useful if you often work from ActionBlocks lists.

If you have an ActionBlocks listing UI (or dev panel), add a “Test Fit…” link that:

- Navigates to `/dev/block-fit?block_id=<id>&asset_id=<id>`.
- BlockFitDev then pre-fills `block_id` and `asset_id` and shows fit immediately when you click “Compute Fit”.

---

### Acceptance Checklist

- [ ] Prompt Lab Library tab has a small “Test Fit…” section for a selected PromptVersion:
  - [ ] Lets you enter an `asset_id` and `role_in_sequence` and then opens `/dev/block-fit` pre-populated.
- [ ] `BlockFitDev` reads query params (`prompt_version_id`, `asset_id`, optionally `block_id`) and pre-fills its form / shows prompt text accordingly.
- [ ] No new backend endpoints are added; this task only uses existing `/dev/block-fit/*` APIs.

