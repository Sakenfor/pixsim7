# TASK: Generation Pipeline Concept Drift Audit

This is a **read-only** analysis task for another AI agent (or a human)
to check whether core **generation pipeline** concepts have drifted
across frontend, backend, and provider code.

The agent must **not modify any code**; the only output is a short
Markdown report describing current mappings and any drift found.

---

## 1. Scope & Goals

Focus only on the unified generation pipeline:

- `generation_type` values and `GenerationNodeConfig`.
- `OperationType` enum and the central mapping registry.
- Pixverse provider mappings (image + video).
- Quick Generate → `/generations` → provider flow.
- Asset creation/media type classification (image vs video).

Goal: detect inconsistencies or “drift” where the same concept has
different meanings or mappings in different layers.

---

## 2. Files to Inspect

The agent should inspect at least these files.

**Backend**

- `pixsim7/backend/main/shared/operation_mapping.py`
- `pixsim7/backend/main/shared/schemas/generation_schemas.py`
- `pixsim7/backend/main/api/v1/generations.py`
- `pixsim7/backend/main/services/generation/creation_service.py`
- `pixsim7/backend/main/services/generation/generation_service.py`
- `pixsim7/backend/main/domain/enums.py`
- `pixsim7/backend/main/services/provider/adapters/pixverse.py`
- `pixsim7/backend/main/services/provider/adapters/pixverse_operations.py`
- `pixsim7/backend/main/services/provider/provider_service.py`
- `pixsim7/backend/main/services/asset/core_service.py`

**Frontend**

- `apps/main/src/lib/api/controlCenter.ts`
- `apps/main/src/lib/control/quickGenerateLogic.ts`
- `apps/main/src/components/control/QuickGenerateModule.tsx`
- `apps/main/src/stores/generationSettingsStore.ts`

---

## 3. Checks to Perform

Work through these checks step by step. When a step says “list” or
“dump”, include the actual values and file locations in your report.

### 3.1 Concept inventory

Extract the actual values currently used:

1. From `GenerationNodeConfigSchema` in
   `pixsim7/backend/main/shared/schemas/generation_schemas.py`:
   - List all allowed `generation_type` strings.
2. From `OperationType` enum in `pixsim7/backend/main/domain/enums.py`:
   - List all operation values.
3. From `GENERATION_TYPE_OPERATION_MAP` in
   `pixsim7/backend/main/shared/operation_mapping.py`:
   - Dump the mapping `generation_type → OperationType`.
4. From Pixverse provider (`pixverse.py`):
   - List `supported_operations`.
5. From Quick Generate frontend:
   - In `controlCenter.ts`, list all `generation_type` strings returned
     by `mapOperationToGenerationType`.

**Report:** include a table like:

| generation_type | OperationType (registry) | Used in frontend? (Y/N) |

### 3.2 Mapping consistency

Using the inventory above, check:

1. For each `generation_type` used by the frontend:
   - Does it appear in `GenerationNodeConfigSchema.generation_type`?
   - Does it appear in `GENERATION_TYPE_OPERATION_MAP`?
2. For each entry in `GENERATION_TYPE_OPERATION_MAP`:
   - Does the mapped `OperationType` exist in the `OperationType` enum?
   - If Pixverse `supported_operations` includes that `OperationType`,
     is there a corresponding branch in:
     - `PixverseProvider.map_parameters`.
     - `PixverseOperationsMixin.execute`.
3. For each Quick Generate `operationType` (TS string):
   - Show `operationType → generation_type → OperationType` using:
     - `mapOperationToGenerationType` (frontend).
     - `resolve_operation_type` (from `operation_mapping.py`).

**Report:** list any inconsistencies, for example:

- `generation_type` used in frontend but missing from registry/schema.
- Registry entry that never appears in frontend or providers.
- Quick Generate operation that resolves to an unexpected `OperationType`.

### 3.3 IMAGE vs VIDEO semantics

Check how image and video operations are separated:

1. For `OperationType.IMAGE_TO_VIDEO` and `OperationType.IMAGE_TO_IMAGE`:
   - Confirm in `operation_mapping.py` which `generation_type` values map
     to each.
2. In `_canonicalize_structured_params` in `creation_service.py`:
   - See how `image_url` / `image_urls` are handled for:
     - `IMAGE_TO_VIDEO`.
     - `IMAGE_TO_IMAGE`.
   - Note what ends up in `canonical_params`.
3. In `PixverseProvider.map_parameters` (`pixverse.py`):
   - Check how `IMAGE_TO_VIDEO` and `IMAGE_TO_IMAGE` are mapped:
     - Where does `image_url` go?
     - Where do `image_urls` go?
4. In `PixverseOperationsMixin` (`pixverse_operations.py`):
   - Confirm which SDK calls are used for:
     - `IMAGE_TO_VIDEO` (video API).
     - `IMAGE_TO_IMAGE` (image API).
5. In `AssetCoreService.create_from_submission` (`core_service.py`):
   - See how `media_type` is chosen:
     - When response has `image_url` / `provider_image_id`, it should be
       `MediaType.IMAGE`.
     - When response has `video_url` / `provider_video_id`, it should be
       `MediaType.VIDEO`.

**Report:** note any code paths where:

- An `IMAGE_TO_IMAGE` generation could create a `MediaType.VIDEO` asset,
  or vice versa.
- There is ambiguity about whether images are required for an image
  operation.

### 3.4 Canonicalization vs provider expectations

Ensure canonical parameters line up with what providers expect:

1. For each Pixverse operation in `supported_operations`:
   - List the fields it uses in:
     - `map_parameters`.
     - `_generate_*` methods in `pixverse_operations.py`
       (e.g. `model`, `quality`, `duration`, `image_url(s)`,
       `video_url`, `fusion_assets`).
2. Compare this with `_canonicalize_structured_params`:
   - Verify that when a `GenerationNodeConfig` contains the right data,
     `canonical_params` will include the fields Pixverse expects for
     that operation.

**Report:** for each operation, list:

- Fields expected by Pixverse but not reliably produced by canonical
  params.
- Fields produced by canonicalization that are unused by Pixverse
  (potential dead weight).

### 3.5 Quick Generate vs unified `/generations`

Trace the flow from Quick Generate to the backend:

1. In `quickGenerateLogic.ts`:
   - For each `operationType` (`text_to_video`, `image_to_video`,
     `image_to_image`, `video_extend`, `video_transition`, `fusion`),
     note which fields it sets in `dynamicParams` / `imageUrls` /
     `prompts` (e.g. `image_url`, `image_urls`, `video_url`).
2. In `controlCenter.ts`:
   - Show how `mapOperationToGenerationType` translates these
     `operationType` values into `generation_type`.
   - Show how `buildGenerationConfig` embeds `image_url` / `image_urls` /
     `video_url` into the structured config.
3. In `/api/v1/generations`:
   - Confirm how `generation_type` is used to pick `OperationType`
     via `resolve_operation_type`.

**Report:** for each Quick Generate operation, include:

- `operationType → generation_type → OperationType`.
- Any surprises (e.g. a text-only op ending as an image operation).

### 3.6 Invariants and potential violations

Infer a few simple invariants from the code, for example:

- If `generation.operation_type == IMAGE_TO_IMAGE` then
  `canonical_params.image_urls` should be non-empty.
- If `generation.operation_type == IMAGE_TO_VIDEO` then inputs should
  contain at least one seed image.
- If a generation completes and an asset is created:
  - `MediaType.IMAGE` assets come from image operations.
  - `MediaType.VIDEO` assets come from video operations.

Then, based on the inspected code, identify any paths where these
invariants could be violated (e.g. missing validation, ambiguous media
type selection).

**Report:** list invariants and suspected violation paths with file and
line references.

---

## 4. Expected Output

The agent should produce a Markdown report, for example:

- `claude-tasks/NNN-generation-pipeline-drift-report-YYYYMMDD.md`

The report should contain:

- A mapping table: `generation_type → OperationType → where used`.
- A list of inconsistencies / drifts with:
  - Concept name.
  - Description.
  - File and line references.
- A short list of suggested follow-ups (no code changes in this task).

Optionally, the agent may add a brief summary section to a shared doc
like `docs/TASK_TRACKING_OVERVIEW.md`, linking to the detailed report.

