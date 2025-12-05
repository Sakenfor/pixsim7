# Task 117: Implement Generation Pipeline Drift Fixes

This task implements the **high‑priority fixes** identified in
`claude-tasks/116-generation-pipeline-drift-report-20251205.md` for the
generation pipeline (mappings, image vs video semantics, and basic
validation).

It should be done in small, reviewable steps; tests are optional but
welcome where practical.

---

## 0. References

- Audit report:
  - `claude-tasks/116-generation-pipeline-drift-report-20251205.md`
- Existing task spec:
  - `claude-tasks/116-generation-pipeline-drift-audit.md`

Key files:

- Backend:
  - `pixsim7/backend/main/shared/operation_mapping.py`
  - `pixsim7/backend/main/shared/schemas/generation_schemas.py`
  - `pixsim7/backend/main/api/v1/generations.py`
  - `pixsim7/backend/main/services/generation/creation_service.py`
  - `pixsim7/backend/main/domain/enums.py`
  - `pixsim7/backend/main/services/provider/adapters/pixverse.py`
  - `pixsim7/backend/main/services/provider/adapters/pixverse_operations.py`
  - `pixsim7/backend/main/services/provider/provider_service.py`
  - `pixsim7/backend/main/services/asset/core_service.py`
- Frontend:
  - `apps/main/src/lib/api/controlCenter.ts`
  - `apps/main/src/lib/control/quickGenerateLogic.ts`
  - `apps/main/src/components/control/QuickGenerateModule.tsx`

---

## 1. Fix missing frontend operation mappings

**Goal:** Ensure all Quick Generate operations map to explicit
`generation_type` values that have registry entries, instead of silently
falling back to `variation` → `TEXT_TO_VIDEO`.

### 1.1 Extend `GenerateAssetRequest.operationType`

File: `apps/main/src/lib/api/controlCenter.ts`

- Update `GenerateAssetRequest.operationType` union to include
  `'text_to_image'` (the UI offers this option).

### 1.2 Add explicit mappings in `mapOperationToGenerationType`

File: `apps/main/src/lib/api/controlCenter.ts`

- In `mapOperationToGenerationType(operationType)`, add explicit cases:
  - `text_to_image` → a new `generation_type` string, e.g.
    `"text_to_image"`.
  - `video_extend` → `"video_extend"`.
- Keep existing mappings for:
  - `image_to_video` (currently `npc_response` or a generic
    `"image_to_video"` if you decide to modernize).
  - `image_to_image` → `"image_edit"`.
  - `video_transition` → `"transition"`.

### 1.3 Wire new generation_type values into the registry and schema

File: `pixsim7/backend/main/shared/operation_mapping.py`

- Add entries to `GENERATION_TYPE_OPERATION_MAP`:
  - `"text_to_image": OperationType.TEXT_TO_IMAGE`
  - `"video_extend": OperationType.VIDEO_EXTEND`

File: `pixsim7/backend/main/shared/schemas/generation_schemas.py`

- Extend `GenerationNodeConfigSchema.generation_type` regex pattern to
  include:
  - `text_to_image`
  - `video_extend`

**Acceptance:** For each Quick Generate operation (`text_to_image`,
`video_extend`), you can trace:

`operationType → generation_type → OperationType`

and it matches the audit’s expected OperationType.

---

## 2. Fix media type classification for IMAGE_TO_IMAGE

**Goal:** Ensure IMAGE_TO_IMAGE generations create `MediaType.IMAGE`
assets, not `MediaType.VIDEO`, by aligning submission response fields
with asset classification logic.

### 2.1 Align submission response field names for images

Files:

- `pixsim7/backend/main/services/provider/adapters/pixverse_operations.py`
- `pixsim7/backend/main/services/provider/provider_service.py`

Current issue (from audit):

- For IMAGE_TO_IMAGE, Pixverse operations currently stuff image results
  into video‑named fields (`video_url`, `provider_video_id`), and
  `AssetCoreService.create_from_submission` infers media type primarily
  from `image_url` / `provider_image_id` vs `video_url` /
  `provider_video_id`.

Preferred fix (keep it simple & compatible with `AssetCoreService`):

- When `operation_type == IMAGE_TO_IMAGE`:
  - Use `image_url` and `provider_image_id` in `GenerationResult` and
    submission response.
  - Avoid populating `video_url` / `provider_video_id` for pure image
    operations.
- For video operations, keep using `video_url` / `provider_video_id`.

You can implement this either by:

- Extending `GenerationResult` to carry both `image_url` and
  `video_url`, or
- Keeping `GenerationResult` as‑is but:
  - Adding a small branch in `provider_service.execute_generation` that,
    for IMAGE_TO_IMAGE, re‑keys the response into `image_url` /
    `provider_image_id`.

### 2.2 Verify `AssetCoreService.create_from_submission` behavior

File: `pixsim7/backend/main/services/asset/core_service.py`

- Confirm that when the response has `image_url` or `provider_image_id`,
  it chooses `MediaType.IMAGE`.
- Confirm that image results no longer reach the `video_url` /
  `provider_video_id` branch.

**Acceptance:** A minimal manual test (or a small unit/integration
check) shows that an IMAGE_TO_IMAGE generation leads to an asset row
with `media_type == 'image'`.

---

## 3. Add backend validation for structured params (defensive)

**Goal:** Add early validation in `GenerationCreationService` for
**structured** params, mirroring the audit’s recommendations, so that
obviously malformed requests fail before hitting providers.

File: `pixsim7/backend/main/services/generation/creation_service.py`

### 3.1 Extend structured validation block

Currently, structured params are mostly trusted once they pass schema
validation. Augment the `is_structured` branch to perform
operation‑specific checks similar to the audit’s examples:

- For `OperationType.IMAGE_TO_VIDEO`:
  - Require `image_url` in `generation_config` or root `params`.
- For `OperationType.IMAGE_TO_IMAGE`:
  - Require at least one of:
    - `image_urls` (non‑empty list), or
    - `image_url` (single URL).
- For `OperationType.VIDEO_EXTEND`:
  - Require `video_url` or `original_video_id`.
- For `OperationType.VIDEO_TRANSITION`:
  - Require `image_urls` list with at least 2 entries.
  - Require `prompts` list with exactly `len(image_urls) - 1` entries.

Raise `InvalidOperationError` with clear messages when checks fail.

**Acceptance:** For each operation, a malformed structured request
fails with a readable 400‑level error from the API instead of a late
provider failure.

---

## 4. (Optional) Invariant helpers and documentation

These are lower priority but useful if time allows.

### 4.1 Invariant helpers

Consider adding small helpers (or comments/tests) capturing invariants
called out in the audit, e.g.:

- IMAGE_TO_IMAGE must have image inputs.
- IMAGE_TO_VIDEO must have a seed image.
- Successful IMAGE_TO_IMAGE generations must produce `MediaType.IMAGE`
  assets.

This can be as simple as:

- Small unit tests for `_canonicalize_structured_params` and
  `create_from_submission`, or
- A short “Invariants” section in `operation_mapping.py` and/or
  `GENERATION_CONFIG_EVOLUTION.md`.

### 4.2 Registry doc comment

File: `pixsim7/backend/main/shared/operation_mapping.py`

- Add a brief comment explaining:
  - Which frontend operations map to each `generation_type`.
  - That `npc_response` is currently a legacy/game‑oriented alias for
    IMAGE_TO_VIDEO, while `image_to_video` (if added) is generic.

---

## 5. Deliverables

When this task is complete, you should have:

1. Updated mappings and schema so:
   - `text_to_image` and `video_extend` Quick Generate operations map to
     the correct `OperationType` values.
2. Fixed media type classification so:
   - IMAGE_TO_IMAGE generations produce `MediaType.IMAGE` assets.
3. Structured validation in `GenerationCreationService` that rejects
   obviously malformed structured requests for:
   - IMAGE_TO_VIDEO, IMAGE_TO_IMAGE, VIDEO_EXTEND, VIDEO_TRANSITION.
4. (Optional) Invariant notes/tests and small registry comments
   documenting the mapping.

---

## See Also

- `claude-tasks/118-plugin-owned-generation-aliases.md` – Finalize plugin ownership of semantic aliases
- `docs/GENERATION_ALIAS_CONVENTIONS.md` – Guide for adding new generation type aliases

