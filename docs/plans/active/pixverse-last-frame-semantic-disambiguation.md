# Pixverse frame-URL semantic disambiguation

Followup to the synthetic-extend work. The current extraction chain
accepts a priority of field names, but downstream code can't tell
**whether the stored URL is actually the last frame or fell back to
first_frame**.  For Pixverse-specific consumers that need the last frame
(video extend seeding, synthetic extend via i2v), this silently produces
wrong output when only `first_frame` is available.

## What's already in place (DO NOT re-do)

- **SDK `_parse_video_response`** (`libs/pixverse-py/pixverse/api/client.py:~875`)
  stores a single `thumbnail_url` with priority:
  1. `customer_video_last_frame_url`
  2. `last_frame`
  3. `first_frame`   ← **semantically WRONG for last-frame use**
  4. `thumbnail`
- **pixsim7 status extractor** (`pixverse_status.py`, 4 call sites of
  `_get_field(...)`) uses the same priority chain.
- Comments at both sites flag that `first_frame` is a display-only fallback.
- The downstream helper `resolve_pixverse_last_frame_url` reads
  `video.thumbnail` without knowing which field it came from.  That's the
  bug this task fixes.

## The actual problem

For a video where Pixverse returns only `first_frame` (no `last_frame`
or `customer_video_last_frame_url`):

- `video.thumbnail` gets set to the OPENING frame.
- Synthetic extend (i2v from "last frame") uses this URL as input.
- The extended video pins its first frame to the source's OPENING, not
  its ending — semantically wrong, user sees a weird jump-cut.
- No log, no warning, no UI signal.

Unknown at this point: **how often Pixverse actually returns only
`first_frame` without `last_frame`**.  May be never (in which case this
is theoretical).  Need empirical sweep to establish rate.

## The task

### Part 1: Empirical validation (no code change)

Run against the existing pixsim7 DB to see how often the stored
`provider_submissions.response.thumbnail_url` is actually the last frame
vs first_frame.

Suggested SQL to sample:
```sql
SELECT g.asset_id, ps.response->>'thumbnail_url' AS thumb_url
FROM provider_submissions ps
JOIN generations g ON ps.generation_id = g.id
WHERE ps.provider_id = 'pixverse'
  AND ps.status = 'success'
  AND g.operation_type IN ('text_to_video','image_to_video')
  AND ps.response->>'thumbnail_url' IS NOT NULL
  AND ps.response->>'thumbnail_url' NOT LIKE '%default.jpg%'
ORDER BY random() LIMIT 10;
```

For each sampled thumb_url, open in browser, compare against the actual
video's start vs end.  Tally:
- N matches LAST frame → priority is correct, no issue
- N matches FIRST frame → Pixverse is emitting only `first_frame` for
  those cases, fix required

If tally is 0 first-frame matches in a sample of 10+, **this task can
be closed without code** — just add a comment confirming empirical check.

### Part 2 (only if part 1 shows first-frame hits): typed attribute split

Split the SDK's `Video.thumbnail` into two explicit attributes:

```python
class Video(BaseModel):
    url: Optional[str]
    last_frame_url: Optional[str] = None   # from customer_video_last_frame_url / last_frame
    first_frame_url: Optional[str] = None  # from first_frame
    thumbnail: Optional[str] = None        # back-compat: whichever is set, last-preferred
```

`_parse_video_response` populates both specifically:
- `last_frame_url = data.get("customer_video_last_frame_url") or data.get("last_frame")`
- `first_frame_url = data.get("first_frame")`
- `thumbnail = last_frame_url or first_frame_url or data.get("thumbnail")`

Update pixsim7 consumers that need the last frame specifically to read
`.last_frame_url`, not `.thumbnail`:
- `pixverse_composition.py:resolve_pixverse_last_frame_url` — change
  `getattr(video, "thumbnail", None)` → `getattr(video, "last_frame_url", None)`.
  Fall back to `.thumbnail` for back-compat if older SDK.
- `pixverse_status.py` / `pixverse_operations.py` — if they extract for
  display only, keep using `.thumbnail` (back-compat).  If for synthetic
  extend seeding, use `.last_frame_url`.

### Part 3 (if part 2 lands): storage disambiguation

The pixsim7-side storage also mixes both:
- `ProviderSubmission.response["thumbnail_url"]` — could be last or first.
- `Asset.media_metadata["provider_thumbnail_url"]` — same.

Option: add `provider_last_frame_url` separately in metadata and submit
response.  Keep `thumbnail_url` as "whichever was present" for display.
`resolve_pixverse_last_frame_url` helper reads
`provider_last_frame_url` strictly.

This is a schema shape change — migrate carefully.  Might not be worth
it if Part 1 shows zero first-frame hits.

## Scope guards

- **Part 1 is cheap** — it's ~30min of SQL + manual browser clicks.  Do
  this FIRST.  Don't skip to code.
- **If empirical check shows this is a theoretical risk, close the
  ticket** with a comment on `resolve_pixverse_last_frame_url` noting
  the validation date.  No code change.
- **Part 2/3 are only justified if the risk is real.**
- Do not touch retry logic, composition resolver, or extract-frame
  endpoint — all settled.
- Do not rename existing fields (`thumbnail`, `thumbnail_url`,
  `provider_thumbnail_url`) — too much blast radius for a semantic
  disambiguation.  Add NEW fields if needed.

## Files to read

- `libs/pixverse-py/pixverse/api/client.py:870-890` — the `_parse_video_response` priority chain.
- `libs/pixverse-py/pixverse/models.py` — the `Video` class shape.
- `pixsim7/backend/main/services/provider/adapters/pixverse_composition.py` —
  the `resolve_pixverse_last_frame_url` helper.
- `pixsim7/backend/main/services/provider/adapters/pixverse_status.py` —
  status extraction call sites (~226, ~344, ~466, ~612).
- `pixsim7/backend/main/shared/schemas/asset_schemas.py:297-330` —
  how `thumbnail_url` is derived on response for the frontend.

## Test plan

### Part 1
- SQL samples pasted inline with eyeball results.
- No code to commit.

### Part 2 (if applicable)
- Unit test for `_parse_video_response` with each of: `last_frame` only,
  `first_frame` only, both, neither.  Assert `.last_frame_url` and
  `.first_frame_url` are set correctly.
- Existing SDK tests still pass (`cd libs/pixverse-py && pytest`).
- Existing pixsim7 tests still pass (`pytest tests/test_pixverse_extend_last_frame.py`).

### Part 3 (if applicable)
- Migration + code tested on a dev DB with mixed historical data.
- No regression in frontend `thumbnail_url` display.

## Commit style

Small focused commits, conventional-commit prefixes.  Likely:
- `chore(pixverse): empirical check — last_frame present in N/M` (Part 1 writeup).
- `feat(pixverse-sdk): split last_frame_url / first_frame_url on Video` (Part 2).
- `feat(pixverse-backend): stamp provider_last_frame_url separately` (Part 3).
