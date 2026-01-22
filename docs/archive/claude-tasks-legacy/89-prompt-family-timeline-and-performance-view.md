## 89 – Prompt Family Timeline & Performance View

**Goal:** Add a Timeline/Performance view in Prompt Lab that shows a `PromptFamily` as a small “story”: versions → ActionBlocks → assets, including basic performance metrics (generation counts, block usage, block/image fit summaries). This helps you see which prompts/blocks/packs are actually working, not just how they are structured.

---

### Context

Already implemented:

- **PromptVersioning:**
  - `PromptFamily` / `PromptVersion` domain + API (`api/v1/prompts/families.py`, etc.).
  - Prompt Lab Library tab uses these APIs to list and view versions.

- **ActionBlocks:**
  - `ActionBlockDB` with tags + compatibility, linked to `prompt_version_id` / `extracted_from_prompt_version`.
  - APIs for listing/searching blocks and their usage.

- **Generation & assets:**
  - `Generation` and `Asset` domain models + APIs.
  - `PromptVariantFeedback` and `BlockImageFit` for prompt and block→image feedback.

- **Dev tools:**
  - Prompt Lab (Analyze/Library/Graphs/Categories).
  - Block Fit Dev (`/dev/block-fit`).

Missing:

- A single view that answers:
  - “For this PromptFamily, how do versions evolve over time?”
  - “Which versions/blocks are most used and best fitting?”
  - “Which assets came from which versions/blocks?”

---

### Task A – Backend: Prompt Family Timeline Endpoint

**File:** `pixsim7/backend/main/api/v1/dev_prompt_timeline.py` (new)

**Goal:** Provide a dev-only endpoint that aggregates version/block/asset info for a single `PromptFamily` into a compact timeline-friendly payload.

**Response shape (Pydantic, conceptual):**

```py
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from uuid import UUID


class TimelineVersion(BaseModel):
    version_id: UUID
    version_number: int
    created_at: str
    commit_message: Optional[str]
    generation_count: int
    successful_assets: int
    tags: List[str]


class TimelineBlockSummary(BaseModel):
    block_id: str                 # ActionBlock.block_id
    db_id: str                    # ActionBlockDB.id (UUID) as string
    prompt_version_id: Optional[UUID]
    usage_count: int
    avg_fit_score: Optional[float]
    last_used_at: Optional[str]


class TimelineAssetSummary(BaseModel):
    asset_id: int
    generation_id: Optional[int]
    created_at: str
    source_version_id: Optional[UUID]
    source_block_ids: List[str]   # if you can derive block usage from lineage


class PromptFamilyTimelineResponse(BaseModel):
    family_id: UUID
    family_slug: str
    title: str
    versions: List[TimelineVersion]
    blocks: List[TimelineBlockSummary]
    assets: List[TimelineAssetSummary]
```

**Endpoint:**

- `GET /api/v1/dev/prompt-families/{family_id}/timeline`

**Implementation notes:**

- Use existing services to gather:
  - Versions for the family (`PromptVersionService.list_versions`).
  - ActionBlocks that reference `prompt_version_id` or `extracted_from_prompt_version` in that family.
  - Assets/generations linked to those versions (via `generation.prompt_version_id` or lineage if you have it).
  - Fit scores:
    - From `BlockImageFit` for each `block_id` + asset (average per block).

- Keep it fast and approximate:
  - Limit assets per version and per block if needed (e.g. last N, or just count and one example).

---

### Task B – Prompt Lab Timeline Tab

**File:** `apps/main/src/routes/PromptLabDev.tsx`

**Goal:** Add a **Timeline** view to Prompt Lab that consumes the timeline endpoint and presents a compact story of a `PromptFamily`.

**Behavior:**

- New tab: **Timeline** when a family is selected.
- Layout idea (3-column or vertical):

  - **Left:** Versions list (timeline)
    - For each version:
      - Show `#version_number`, `created_at`, `generation_count`, `successful_assets`, tags.
      - Clicking a version filters the blocks/assets displayed on the right.

  - **Middle:** Block summaries for this family
    - List `TimelineBlockSummary` entries:
      - Block `block_id`, usage_count, avg_fit_score.
      - Indicate which version they are linked to (if any).
      - Click → maybe open BlockFitDev (optional; see below).

  - **Right:** Asset summaries
    - List `TimelineAssetSummary` entries:
      - asset_id, generation_id, source_version_id, created_at.
      - Clicking an asset could:
        - Open the normal Asset detail route (`/assets/:id`) in a new tab.

**Wiring:**

- When a family is selected in the Library tab, the Timeline tab:
  - Calls `/api/v1/dev/prompt-families/{family_id}/timeline`.
  - Stores and renders the response.

---

### Task C – Optional: Quick Links into Other Dev Tools

> Optional, but useful to close loops.

In the Timeline view:

- For a `TimelineBlockSummary`:
  - Add a “Test Fit” icon that navigates to `/dev/block-fit?block_id=<db_id>` (keeping current behavior in BlockFitDev).

- For a `TimelineVersion`:
  - Add a “Analyze” icon that switches to the Analyze tab with that version’s prompt selected (reusing existing state wiring).

These are shallow hyperlink-style integrations; no new endpoints needed.

---

### Non-Goals

- Changing generation scheduling or ranking based on this view.
- Full-blown analytics dashboards; this is a compact timeline + a few key numbers.

---

### Acceptance Checklist

- [ ] `GET /api/v1/dev/prompt-families/{family_id}/timeline` returns versions + block summaries + asset summaries for a family.
- [ ] Prompt Lab has a **Timeline** tab when a family is selected:
  - [ ] Shows versions, blocks, and assets in a compact view.
  - [ ] Filters blocks/assets when a version is clicked.
- [ ] (Optional) Quick links from Timeline entries into BlockFitDev and the Analyze tab work.

