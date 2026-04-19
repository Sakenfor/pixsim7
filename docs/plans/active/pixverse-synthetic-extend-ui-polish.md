# Synthetic Extend — UI polish for "last-frame unavailable"

**Scope: frontend only.** The backend fix chain (extraction, reuse helper,
non-retryable error) is already landed on the backend side. This task
surfaces that state to the user in the media card + error toast so they stop
hitting the wall unknowingly. Do not modify adapters / sync / extract-frame
endpoint — those are settled.

## Background (short)

Pixverse video generations can end up in three states relevant to "synthetic
extend" (pixsim7's i2v-from-last-frame chain):

| State | Source video has `customer_video_last_frame_url`? | Synthetic extend works? |
|---|---|---|
| Fully completed (`status=1`) | yes | ✅ yes |
| Filtered (`status=7` moderated) | no — Pixverse returns `default.jpg` placeholder | ❌ no — Pixverse didn't produce a real frame |
| Early-CDN-promoted over a filtered source | no — Pixverse never wrote it | ❌ no — underlying moderation never produced frames |

The backend already computes this. If a synthetic extend is attempted and
the source has no reusable last-frame URL, the upload falls through to
Pixverse's image-upload endpoint, gets moderation-rejected, and now raises
a **non-retryable** `ProviderError` — so the failure is fast and
deterministic, no more 3x retry burn.

## Backend state (already landed, DO NOT change)

- `ProviderError(retryable: bool = True)` — already exists in
  `pixsim7/backend/main/shared/errors.py`.
- Worker respects `.retryable` via
  `pixsim7/backend/main/workers/job_processor_errors.py::_is_non_retryable_error`.
- `pixsim7/backend/main/services/provider/adapters/pixverse_operations.py`
  upload-reject branch sets `retryable=False` when the error message
  matches `"not compliant"` / `"content policy"` / `"moderation"`.
- Shared helper:
  `pixsim7/backend/main/services/provider/adapters/pixverse_composition.py::resolve_pixverse_last_frame_url`
  — 3-level chain (media_metadata → submission.response → live fetch with
  self-heal).  Returns `None` for moderated/filtered sources.
- `try_reuse_pixverse_cdn_url_for_upload(asset, db_session)` in the same
  file — resolves "is this asset (or its PAUSED_FRAME parent) a Pixverse
  video, and does it have a reusable last-frame URL?"

## What this task needs

### 1. Media card badge: "no reusable last frame"

When a video asset is displayed in the UI (gallery/library/carousel) and
the user might want to synthetic-extend from it, show a small subtle
badge if the source has no usable last-frame URL.

**Detection on frontend:** an asset whose `media_metadata.provider_thumbnail_url`
is null/empty (or not present) AND whose latest submission response also
has no `thumbnail_url`. Backend already populates these via the fix chain
for future generations; for historical assets the field stays empty.

**Suggested rendering:** small icon (e.g. `lib/icons` — look for a "slash"
or "warning" style icon; match the existing `badge` pattern used elsewhere
on media cards, see `apps/main/src/features/assets/components/shared/CompactAssetCard.tsx`
which supports `hoverActions` + `overlay` props for extension). Tooltip:
"No last-frame available — synthetic extend unavailable for this video".

The badge should NOT appear for non-video assets. Only Pixverse-generated
videos (`provider_id == "pixverse"`, `media_type == video`).

Files likely involved:
- `apps/main/src/components/media/MediaCard.tsx` (display surface)
- `apps/main/src/features/assets/components/shared/CompactAssetCard.tsx`
- `apps/main/src/lib/icons` (icon registry)

### 2. Error classification in the toast/error surface

When a synthetic extend submission fails with the non-retryable
moderation rejection, the error bubble up to the UI probably currently
shows something generic like "Upload rejected by Pixverse: The uploaded
image is not compliant".

Classify in the error-toast/handler layer: detect
`error.retryable === false` OR message contains "not compliant" /
"content policy" → show user-friendly copy:

> "The source video has no reusable last frame (Pixverse filtered the
> generation). Try a different source, or use native extend instead."

Look at how generation errors are currently displayed — likely in
`apps/main/src/features/generation/` or a generation error hook. The
backend wraps these as structured errors; the frontend may already have
an error taxonomy that just needs one more case.

### 3. Optionally: disable the "synthetic extend" UI affordance

When the badge from (1) applies, disable or hide the "extend artificially"
button on the media card's hover actions. Prevents the user from even
submitting the doomed request. Same detection as (1).

## Files to read first

1. `apps/main/src/components/media/MediaCard.tsx` — main display
2. `apps/main/src/features/assets/components/shared/CompactAssetCard.tsx`
   — extension-point pattern (already supports `hoverActions`, `overlay`)
3. `apps/main/src/features/generation/` — generation error handling
4. `apps/main/src/lib/icons/icons.tsx` — icon registry (camelCase names)
5. `pixsim7/backend/main/shared/schemas/asset_schemas.py:297-330` — asset
   response shape, shows how `thumbnail_url` is already computed on
   response with a priority chain including `media_metadata.provider_thumbnail_url`

## Test plan

- Pick a Pixverse-generated video from a previously-filtered generation
  in your library.  Badge should appear.
- Pick a recently-completed (not filtered, not early-CDN) Pixverse video.
  Badge should NOT appear.
- Try synthetic extend on a filtered source — error toast should show the
  nicer copy, not the raw provider error.
- Type-check: `npx tsc --noEmit --project apps/main/tsconfig.json`.

## Do NOT

- Modify any backend code.
- Add new DB columns or schema changes.
- Change the `resolve_pixverse_last_frame_url` helper or the
  smart-upload logic in `AssetSyncService._upload_to_provider`.
- Add a "retry" button for the moderation case — moderation is
  deterministic, retrying is pure credit waste.

## Scope size

Small / medium.  ~100-200 lines of frontend changes across 2-4 files.
Single commit. Conventional-commit prefix `feat(media-card):` or
`fix(generation):` depending on framing.
