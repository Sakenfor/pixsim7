## 86 – Block ↔ Image Fit Scoring & Feedback

**Goal:** Add a minimal but extensible system to score and rate how well an `ActionBlock` fits a specific image (or generated asset), using ontology-aligned tags on both sides. This includes a fit heuristic, a feedback entity for user ratings, and a small dev/authoring UI to inspect and adjust fits. No automatic generation changes yet; this is about measurement and plumbing.

---

### Context

Already in place:

- **ActionBlocks:**
  - `ActionBlockDB` with `prompt`, `tags`, `complexity_level`, `source_type`, `is_composite`, `component_blocks`, `prompt_version_id`, etc.
  - Tags are being normalized toward ontology IDs (Task 84) for intensity, speed, mood, etc.

- **Ontology & parser:**
  - `ontology.yaml` / `ontology.py` with core/domain IDs and relationships (camera, spatial, state, beat, etc.).
  - `SimplePromptParser` + `prompt_dsl_adapter.analyze_prompt` annotate prompts with roles and `ontology_ids`.

- **Assets & generations:**
  - `Asset` / `Generation` domain models and APIs.
  - PromptVariantFeedback for prompt→asset feedback (fit/quality) already exists.

Missing:

- A first-class way to ask: *“How well does block X match image Y?”*:
  - Heuristic fit based on ontology tags (camera/view, spatial relations, actors present, beats).
  - User ratings tied to `block_id` + `asset_id` (or generation) with sequence context (“initial”, “continuation”, “transition”).
  - A dev view to inspect and understand mismatches.

---

### Task A – Define Block/Image Fit Feedback Entity

**File:** `pixsim7/backend/main/domain/block_image_fit.py` (new)

**Goal:** Add a small SQLModel to store user ratings (and derived metadata) for how well an ActionBlock fits an image/asset.

**Schema (conceptual):**

```py
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON
from typing import Optional, Dict, Any
from datetime import datetime
from uuid import UUID


class BlockImageFit(SQLModel, table=True):
    """
    User feedback and derived metadata for how well an ActionBlock
    fits a specific image/asset (or generation output).
    """
    __tablename__ = "block_image_fits"

    id: Optional[int] = Field(default=None, primary_key=True)

    block_id: UUID = Field(
        foreign_key="action_blocks.id",
        index=True,
        description="ActionBlockDB.id being evaluated"
    )

    asset_id: Optional[int] = Field(
        default=None,
        index=True,
        description="Asset.id (image/video) the block is being evaluated against"
    )

    generation_id: Optional[int] = Field(
        default=None,
        index=True,
        description="Generation.id if rating tied to a specific generation"
    )

    # Sequence context: initial scene setup, continuation, or transition
    role_in_sequence: str = Field(
        default="unspecified",
        max_length=32,
        description="'initial' | 'continuation' | 'transition' | 'unspecified'"
    )

    # User + rating
    user_id: Optional[int] = Field(default=None, index=True)
    fit_rating: Optional[int] = Field(
        default=None,
        description="1-5 rating for how well block fits the image"
    )

    # Heuristic fit score (0-1 or 0-100) from ontology tag comparison, for analysis
    heuristic_score: Optional[float] = Field(default=None)

    # Snapshots of tags at rating time (for offline analysis)
    block_tags_snapshot: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    asset_tags_snapshot: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    notes: Optional[str] = Field(default=None, description="Optional free-form notes")

    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
```

**Migration:** Add an Alembic migration to create `block_image_fits` with indexes on `block_id`, `asset_id`, `generation_id`, `user_id`, `created_at`.

---

### Task B – Image/Asset Tagging Pipeline (Ontology IDs)

**Goal:** Ensure images/assets have ontology-aligned tags so we can compute fit vs ActionBlock tags.

**Files (backend):**

- `pixsim7/backend/main/services/assets/tags.py` (new)

**Design:**

- Define a small, pluggable tagging helper for assets:

  ```py
  from typing import Dict, Any
  from pixsim7.backend.main.shared.ontology import load_ontology

  def tag_asset_from_metadata(asset: Asset) -> Dict[str, Any]:
      """
      Best-effort ontology tag extraction for an asset.
      Sources:
        - Existing metadata/captions from provider (if any)
        - Generation prompt text (if available)
      Strategy:
        - Run SimplePromptParser + ontology.match_keywords on any captions/prompts
        - Merge ontology_ids into a dict { "ontology_ids": [...], "roles": [...], ... }
      """
  ```

- The first implementation can be simple:
  - If an asset has an associated generation with `final_prompt`, parse that prompt and use `ontology_ids` as asset tags.
  - If provider-specific captions exist, run them through the parser too.
  - Store the result in-memory in the fit computation; **do not** add new DB columns in this task (snapshots go into `BlockImageFit.asset_tags_snapshot`). If you already have a JSON metadata column on `Asset`, you may reuse it, but that’s optional.

**Acceptance:**

- There is a helper function that, given an `Asset` (and optionally its `Generation`), yields a set of ontology IDs that describe the image (camera/view, actors, some spatial/beat hints).

---

### Task C – Fit Heuristic (Backend Helper)

**File:** `pixsim7/backend/main/services/action_blocks/fit_scoring.py` (new)

**Goal:** Implement a basic, explainable heuristic that scores how well an ActionBlock fits an asset based on ontology-aligned tags.

**Design:**

```py
from typing import Dict, Any, Tuple
from pixsim7.backend.main.domain.action_block import ActionBlockDB
from pixsim7.backend.main.domain.asset import Asset


def compute_block_asset_fit(
    block: ActionBlockDB,
    asset_tags: Dict[str, Any],
) -> Tuple[float, Dict[str, Any]]:
    """
    Compute a heuristic fit score between an ActionBlock and an asset.

    Returns:
        (score, details) where score is 0.0-1.0 and details includes
        reasons (matched_tags, missing_required_tags, etc.).

    Strategy (first pass):
        - Required matches:
          - If block tags contain camera/view IDs (e.g. 'cam:from_behind'),
            treat them as required; penalize if asset_tags lack them.
          - Similarly for obvious spatial relations (rel:*).
        - Soft matches:
          - Overlap on mood/intensity/speed/beat IDs improves score.
        - Compute a simple weighted sum:
          score = 1.0 - required_miss_penalty + soft_match_bonus
          then clamp to [0.0, 1.0].
    """
    ...
```

**Notes:**

- Keep it simple and transparent; we’re not training a model here.
- Include a `details` dict with:
  - `required_matches`, `required_misses`, `soft_matches`,
  - `block_ontology_ids`, `asset_ontology_ids`.

**Acceptance:**

- Given an ActionBlock and derived asset tags, `compute_block_asset_fit` returns a numeric score + details.

---

### Task D – API Endpoint for Recording Fit Feedback

**File:** `pixsim7/backend/main/api/v1/block_image_fit.py` (new)

**Goal:** Provide a dev/authoring endpoint to:

- Compute heuristic fit for block+asset.
- Let a user submit a human rating and optional notes.
- Persist a `BlockImageFit` record.

**Endpoints:**

1. `POST /api/v1/dev/block-fit/score`

   - Body:

     ```json
     {
       "block_id": "UUID",
       "asset_id": 123
     }
     ```

   - Behavior:
     - Load `ActionBlockDB` and `Asset`.
     - Derive `asset_tags` via Task B helper.
     - Call `compute_block_asset_fit` and return:

       ```json
       {
         "heuristic_score": 0.73,
         "details": { ... }
       }
       ```

2. `POST /api/v1/dev/block-fit/rate`

   - Body:

     ```json
     {
       "block_id": "UUID",
       "asset_id": 123,
       "generation_id": 456,        // optional
       "role_in_sequence": "initial", // or 'continuation'/'transition'
       "fit_rating": 3,
       "notes": "Camera is front-facing, block expects from_behind"
     }
     ```

   - Behavior:
     - Compute heuristic fit (as above).
     - Build `BlockImageFit` with:
       - `block_id`, `asset_id`, `generation_id`, `role_in_sequence`, `user_id` (from auth), `fit_rating`, `heuristic_score`, and snapshots of block+asset tags.
     - Persist and return the created record (or a simple acknowledgment).

**Scope:**

- Dev-only endpoints (`/dev/*`), behind normal auth.
- No automatic changes to generation flows in this task.

---

### Task E – Dev UI: Block Fit Inspector

**File:** `apps/main/src/routes/BlockFitDev.tsx` (new)

**Goal:** Provide a simple dev route to:

- Pick a block and an asset.
- See the heuristic fit + ontology-based explanation.
- Submit a human rating.

**Route:**

- Path: `/dev/block-fit`
- Behind `ProtectedRoute` like other dev tools.

**UI behavior:**

- Inputs:
  - `block_id` (text input + “Load block” button, or a small search box that hits ActionBlocks list API).
  - `asset_id` (text input + “Load asset” button).
  - `role_in_sequence` (select: `initial`, `continuation`, `transition`, `unspecified`).
  - Buttons:
    - “Compute Fit” → calls `/dev/block-fit/score`.
    - “Submit Rating” → calls `/dev/block-fit/rate`.

- Display:
  - Block summary: text + tags (ontology IDs as chips).
  - Asset summary: thumb + ontology tags (derived from tags helper).
  - Fit summary:
    - Show `heuristic_score` as a bar and list `details.required_misses` / `details.soft_matches`.
  - Rating controls: 1–5, notes textarea.

- No integration into production flows; it’s a dev tool for inspecting and tuning the heuristic.

---

### Non-Goals (for this Task)

- Automatically changing generation ranking or block suggestions based on fit scores.
- Training a ML model from the feedback (you’ll have data and heuristics first).
- Full image understanding; first version can rely heavily on prompts/captions as image tags.

---

### Acceptance Checklist

- [ ] `BlockImageFit` model and migration exist and can store per block+asset rating with sequence context and tag snapshots.
- [ ] There is a helper to derive ontology-aligned tags for an asset from prompts/captions.
- [ ] `compute_block_asset_fit` returns a heuristic score + explanation based on ontology IDs.
- [ ] Dev endpoints under `/api/v1/dev/block-fit/*`:
  - [ ] `/score` computes heuristic fit for a given block+asset.
  - [ ] `/rate` persists a `BlockImageFit` record with heuristic + user rating.
- [ ] `/dev/block-fit` route exists with a simple UI to inspect block+asset fit, view ontology-based explanations, and submit ratings.
