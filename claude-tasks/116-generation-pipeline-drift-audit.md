# Task 116: Generation Pipeline Concept Drift Audit

This task is a one-off analysis of the **generation pipeline** to detect
whether core concepts (generation types, operations, media types) have
drifted across frontend, backend, and provider integration.

It is **read-only**: do not modify code; produce a short report.

---

## Scope & Goals

Focus only on the generation pipeline:

- `generation_type` values and `GenerationNodeConfig`
- `OperationType` enum and the central mapping registry
- Pixverse provider mappings (video + image)
- Quick Generate → `/generations` → provider flow
- Asset creation for image vs video results

Goal: surface inconsistencies or “drift” where the same concept has
different meanings or mappings in different layers.

---

## Files to Inspect

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

## Checks to Perform

When executing this task, follow these checks step by step and include
file/line references in the final report.

### 1. Concept inventory

- List all `generation_type` values:
  - From `GenerationNodeConfigSchema` (Pydantic).
  - From `mapOperationToGenerationType` (frontend).
- List all `OperationType` enum values.
- Dump `GENERATION_TYPE_OPERATION_MAP` mapping
  `generation_type → OperationType`.
- List `supported_operations` for Pixverse.

### 2. Mapping consistency

- For each `generation_type` used in the frontend, check:
  - It exists in `GenerationNodeConfigSchema`.
  - It exists in `GENERATION_TYPE_OPERATION_MAP`.
- For each `generation_type` in the registry, check:
  - Its `OperationType` exists in the enum.
  - If Pixverse claims to support that operation, there is a matching
    branch in `map_parameters` and `execute`.
- For each Quick Generate `operationType`:
  - Show `operationType → generation_type → OperationType`.

Flag any values that appear in only one layer or that map to unexpected
operation types.

### 3. IMAGE vs VIDEO semantics

- Confirm which `generation_type` values map to:
  - `IMAGE_TO_VIDEO`
  - `IMAGE_TO_IMAGE`
- In `_canonicalize_structured_params`, see how `image_url` /
  `image_urls` are handled for those operations.
- In Pixverse adapter/operations:
  - Confirm image vs video operations call the correct SDK APIs.
- In `create_from_submission`, verify media type selection:
  - Image results → `MediaType.IMAGE`.
  - Video results → `MediaType.VIDEO`.

Note any ambiguous or inconsistent handling of image vs video.

### 4. Canonicalization vs provider expectations

- For each Pixverse-supported operation:
  - List the fields it expects (from `map_parameters` and
    `_generate_*` methods).
  - Cross-check that `_canonicalize_structured_params` produces those
    fields (given a valid config).

List fields that are expected but never canonicalized, or canonicalized
but unused.

### 5. Quick Generate vs unified `/generations`

- For each Quick Generate `operationType`, confirm:
  - Which fields `buildGenerationRequest` sets (`image_url`,
    `image_urls`, `video_url`, `prompts`, etc.).
  - How `buildGenerationConfig` embeds these into the structured config.
  - How `/generations` turns `generation_type` into `OperationType`.

Look for any surprising flows (e.g., text-only operation ending as an
image operation).

### 6. Invariants and potential violations

Derive a few simple invariants (e.g., IMAGE_TO_IMAGE requires image
inputs; successful image generations produce image assets) and identify
code paths where these invariants might be violated (missing validation,
ambiguous media type, etc.).

---

## Expected Output

Produce a Markdown report, e.g.:

- `docs/GENERATION_DRIFT_AUDIT_REPORT_YYYYMMDD.md`

The report should include:

- A mapping table of `generation_type → OperationType → where used`.
- A list of inconsistencies or drifts with:
  - Concept name.
  - Description.
  - File/line references.
- Optional short list of follow-up suggestions (no code changes).

---

## See Also

- `claude-tasks/117-generation-pipeline-drift-fixes.md` – Implementation of drift fixes
- `claude-tasks/118-plugin-owned-generation-aliases.md` – Finalize plugin ownership of semantic aliases
- `docs/GENERATION_ALIAS_CONVENTIONS.md` – Guide for adding new generation type aliases

