## 90 – Timestamped Block ↔ Video Feedback (Frame-Level Notes)

**Goal:** Extend the existing Block ↔ Image Fit feedback system so that ratings can be tied to a **specific moment** in a video (timestamp), with optional notes. This creates a richer dataset for future AI analysis without requiring complex region/mask annotation.

---

### Context

Already implemented:

- `BlockImageFit` model/table:
  - Stores `block_id`, `asset_id`, optional `generation_id`, `role_in_sequence`, `fit_rating`, `heuristic_score`, and tag snapshots + notes.
- Fit scoring pipeline:
  - `compute_block_asset_fit` + `explain_fit_score` for heuristic fit.
  - Asset tagging via `tag_asset_from_metadata`.
- Dev API + UI:
  - `/api/v1/dev/block-fit/score` and `/rate` in `block_image_fit.py`.
  - `/dev/block-fit` (`BlockFitDev.tsx`) for selecting block + asset and submitting a rating.

Missing:

- An explicit way to say: *“This block works/doesn’t work at **this** time in the video.”*
  - E.g. “At 3.2s the camera angle is wrong for this block,” or “entry beat lines up well at 1.5s.”

This task adds **timestamp support** to BlockImageFit and the BlockFitDev UI/API. The AI analysis part is deferred.

---

### Task A – Extend BlockImageFit with Timestamp

**File:** `pixsim7/backend/main/domain/block_image_fit.py`

**Goal:** Add an optional timestamp (in seconds) to block↔asset fit records.

**Changes:**

- Add a field:

  ```py
  timestamp_sec: Optional[float] = Field(
      default=None,
      description="Optional timestamp in seconds within the asset (video) where this rating applies"
  )
  ```

- Update the Alembic migration:
  - Add a new migration `20251128_XXXX_add_timestamp_to_block_image_fit.py` that:
    - Adds `timestamp_sec` as a nullable float column to `block_image_fits`.

**Notes:**

- Existing records remain valid; `timestamp_sec` stays `NULL` for them.

---

### Task B – API: Accept Timestamp in Fit Rating

**File:** `pixsim7/backend/main/api/v1/block_image_fit.py`

**Goal:** Let clients optionally send a timestamp when rating a block against a video asset.

**Changes:**

- Extend `RateFitRequest` with:

  ```py
  timestamp_sec: Optional[float] = Field(
      default=None,
      description="Optional timestamp in seconds for this rating"
  )
  ```

- When creating `BlockImageFit` in `rate_fit`:
  - Set `timestamp_sec=request.timestamp_sec`.

No behavior change if `timestamp_sec` is omitted.

---

### Task C – BlockFitDev UI: Time-Aware Ratings

**File:** `apps/main/src/routes/BlockFitDev.tsx`

**Goal:** Add a simple way to capture the current playback time when rating a block against a video asset.

**Behavior:**

- If the selected `asset` is a video:
  - Show current playback time (from the video element) as `currentTime` (e.g. “3.2s”).
  - Add a small “Use current time as timestamp” checkbox/button near the rating controls.
    - When checked/clicked, it sets a local `timestampSec` state to the rounded `currentTime`.
  - Display the timestamp that will be sent with the rating (e.g. “Rating at 3.2s”).
- When calling `/dev/block-fit/rate`:
  - Include `timestamp_sec` in the request body if it’s set.

**Notes:**

- You can keep the video player minimal (play/pause + time); no need for region/mask UI.

---

### Task D – Dev View for Existing Timestamped Feedback (Optional)

> Optional, but useful to confirm it works and see existing annotations.

In `BlockFitDev` (or a separate dev route), add a small list under the rating form:

- Show recent `BlockImageFit` records for the current `block_id` + `asset_id`, including:
  - `fit_rating`, `heuristic_score`, `role_in_sequence`, `timestamp_sec`, `notes`, `created_at`.
- Clicking an entry could:
  - Seek the video to that timestamp (if available), so you can re-watch the moment that was rated.

This uses existing `block_image_fits` data; no new backend endpoints are strictly required, but adding a small `GET /api/v1/dev/block-fit/list` filtered by `block_id`/`asset_id` is acceptable if you prefer.

---

### Non-Goals

- Region/mask annotation for specific areas of the frame.
- Any AI analysis or automatic adaptation based on timestamped feedback (that’s for a future task).

---

### Acceptance Checklist

- [ ] `BlockImageFit` has an optional `timestamp_sec` column, with migration applied.
- [ ] `/api/v1/dev/block-fit/rate` accepts `timestamp_sec` and persists it into `BlockImageFit`.
- [ ] `/dev/block-fit` UI:
  - [ ] Shows current video time when an asset is a video.
  - [ ] Allows the user to capture that time as `timestamp_sec` for the rating.
  - [ ] Sends `timestamp_sec` when rating, if set.
- [ ] (Optional) A dev view shows existing timestamped ratings and can seek the video to the rated time.
