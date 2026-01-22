**Task 115: Pixverse Generation Settings & Control Center Integration**

> **For Agents**
> - Canonicalize how generation settings (models, quality, duration, advanced flags) are surfaced from `pixverse-py` into PixSim7.
> - Improve the Control Center Generate tab so Pixverse video options (v5 vs v5.5, multi_shot, audio, off_peak) behave correctly and consistently.
> - Provide a reusable "generation settings bar" component that other UIs (Intimacy composer, dev tools) can adopt.
> - Use this task when you:
>   - Touch `pixsim7/backend/main/services/provider/adapters/pixverse.py`.
>   - Work on `QuickGenerateModule` or other generation UIs that need provider-specific settings.
>   - Need to add new Pixverse options (e.g. new models, flags) without duplicating logic across frontend/backends.

---

## Context

We now have two coordinated pieces:

- **SDK (`pixverse-py`)**
  - `pixverse/models.py`:
    - `VideoModel`, `ImageModel`, `CameraMovement` define available enums.
    - `GenerationOptions` is the canonical schema for video options:
      - `model`, `quality`, `duration`, `seed`, `aspect_ratio`.
      - `motion_mode`, `negative_prompt`, `camera_movement`, `style`, `template_id`.
      - Advanced v5.5+ fields: `multi_shot`, `audio`.
      - Account/credits feature: `off_peak` (queue into off-peak processing).
    - `VIDEO_OPERATION_FIELDS` + `get_video_operation_fields(operation: str) -> list[str]` now define which `GenerationOptions` fields apply to which high-level video operations:
      - `text_to_video` → includes `aspect_ratio`, `multi_shot`, `audio`, `off_peak`.
      - `image_to_video` → **no `aspect_ratio`**, but includes `camera_movement`, `multi_shot`, `audio`, `off_peak`.
      - `video_extend` → **no `aspect_ratio`**, includes `multi_shot`, `audio`, `off_peak`.
  - `pixverse/__init__.py` exports `get_video_operation_fields` alongside `VideoModel`/`ImageModel` so adapters can query this UI metadata explicitly.

- **PixSim7 backend adapter**
  - File: `pixsim7/backend/main/services/provider/adapters/pixverse.py`
    - Uses `VideoModel.ALL` / `VideoModel.DEFAULT` to expose video model choices (v3.5, v4, v5, v5.5).
    - Uses `ImageModel.ALL`, `ImageModel.QUALITIES`, `ImageModel.ASPECT_RATIOS` for image generation parameters.
    - Uses `CameraMovement.ALL` for `image_to_video` camera presets.
    - `get_operation_parameter_spec()` now:
      - Builds a `video_field_specs` map for each GenerationOptions field (`model`, `quality`, `duration`, `aspect_ratio`, `seed`, `motion_mode`, `negative_prompt`, `camera_movement`, `style`, `template_id`, `multi_shot`, `audio`, `off_peak`).
      - Calls `get_video_operation_fields(operation)` where available to determine which fields to include for:
        - `"text_to_video"`.
        - `"image_to_video"`.
        - `"video_extend"`.
      - Falls back to previous hard-coded lists when the SDK helper is unavailable or raises.
      - No longer introspects `GenerationOptions.model_fields` for extra fields: only SDK-sanctioned fields are surfaced.

- **PixSim7 frontend / Control Center**
  - `apps/main/src/components/control/QuickGenerateModule.tsx`:
    - Uses `useProviderSpecs` → `/api/v1/providers` → `extract_provider_capabilities()` → `get_operation_parameter_spec()` to derive `operation_specs` per provider/operation.
    - For the header bar:
      - Computes `paramSpecs` (`ParamSpec[]`) from `operation_specs[operationType].parameters`, excluding `prompt`, `image_urls`, `prompts`.
      - Splits `paramSpecs` into:
        - `primaryParams` (via `PRIMARY_PARAM_NAMES`: `duration`, `quality`, `aspect_ratio`, `model`, `model_version`, `seconds`, `style`, `resolution`) → inline selects in the settings bar.
        - `advancedParams` → `+N` popover with inputs.
      - Renders booleans as checkboxes in the advanced section; this already works for `multi_shot`, `audio`, `off_peak`.
  - `apps/main/src/components/control/DynamicParamForm.tsx`:
    - Provides a generic param renderer using the same `ParamSpec` shape.
  - `apps/main/src/components/control/GenerationSettingsBar.tsx` (new):
    - Extracted version of the header "settings bar" UI (provider dropdown, primary param selects, `+N` advanced popover) intended for reuse.
    - Not yet fully wired into `QuickGenerateModule` or other UIs.

High-level design intent:

- **SDK is the source of truth** for:
  - Available models, qualities, aspect ratios, camera movements.
  - Which fields apply to which operation (especially subtle rules like "no aspect for Pixverse image_to_video").
- **Adapter is a thin layer** that:
  - Converts generic PixSim operations to SDK operations.
  - Maps SDK field metadata into a generic `operation_specs` structure.
- **Frontend UIs are spec-driven**, using the same "generation settings bar" across:
  - Control Center Quick Generate.
  - Intimacy and other content generation tools.

---

## Goals

1. **Make Pixverse video settings spec-driven and future-proof**
   - Use `VideoModel` / `ImageModel` / `CameraMovement` / `GenerationOptions` / `get_video_operation_fields()` as the only source of truth for Pixverse options.
   - Ensure Control Center and any future UIs respect the per-operation field mapping.

2. **Canonicalize the generation settings UI**
   - Provide a shared `GenerationSettingsBar` component that handles:
     - Provider selection.
     - Primary param dropdowns (model, quality, duration, aspect ratio, etc).
     - Advanced param popover (multi_shot, audio, off_peak, other provider-specific flags).
   - Replace the ad-hoc settings block in `QuickGenerateModule` with this shared component.

3. **Make Pixverse-specific options understandable**
   - Present `multi_shot`, `audio`, and `off_peak` as clearly labeled toggles (checkboxes) in the advanced UI.
   - Ensure their availability matches SDK semantics (e.g. v5.5+ for multi_shot/audio).

4. **Enable reuse in other generation UIs**
   - Document and validate a pattern for reusing the settings bar:
     - Intimacy composer’s Generation tab.
     - Dev panels (Generation health, prompt inspector, etc.) that need to preview settings.

---

## Deliverables

1. **SDK: Stable per-operation UI metadata**
   - `pixverse/models.py`:
     - `VIDEO_OPERATION_FIELDS` updated and kept in sync with any new `GenerationOptions` fields.
     - `get_video_operation_fields(operation)` used by external consumers; treat this as a public API.
   - `pixverse/__init__.py`:
     - `get_video_operation_fields` included in `__all__` and documented as the canonical way to derive UI/adapter field lists.
   - Write a short section in `README.md` or a dedicated doc (e.g. `docs/UI_METADATA.md`) explaining this contract:
     - Who should call it (adapters, UI frameworks).
     - How to add new fields and operations without breaking consumers.

2. **Backend: Adapter fully aligned to SDK UI metadata**
   - `pixsim7/backend/main/services/provider/adapters/pixverse.py`:
     - Continue to import and use `get_video_operation_fields` for `text_to_video`, `image_to_video`, `video_extend`.
     - Keep `video_field_specs` as the single mapping from GenerationOptions fields → `ParamSpec` metadata.
     - Remove any remaining Pydantic introspection for Pixverse video fields.
     - Optionally strip `aspect_ratio` from `map_parameters` for `IMAGE_TO_VIDEO` in case a caller still sends it.
   - Add a small backend unit test (or doctest-style check) that asserts:
     - `get_operation_parameter_spec()` field names for Pixverse video ops match `VIDEO_OPERATION_FIELDS` for `text_to_video`, `image_to_video`, `video_extend`.

3. **Frontend: Shared generation settings bar wired into QuickGenerate**
   - `apps/main/src/components/control/GenerationSettingsBar.tsx`:
     - Finalize props so it’s clearly reusable:
       - `providerId`, `providers` (id/name).
       - `paramSpecs: ParamSpec[]`.
       - `dynamicParams: Record<string, any>`.
       - `onChangeProvider(id?: string)`.
       - `onChangeParams(next: Record<string, any>)` or `onChangeParam(name, value)`.
       - `generating`, `showSettings`, `onToggleSettings`, `presetId`.
     - Ensure primary vs advanced logic is identical to the original `QuickGenerateModule` header.
   - `apps/main/src/components/control/QuickGenerateModule.tsx`:
     - Replace the inline settings bar and advanced `+N` UI with `<GenerationSettingsBar />`.
     - Wire provider changes to `setProvider` and param changes to `setDynamicParams`.
     - Keep UX identical:
       - Auto-open settings when there are visible options or `image_to_image` is selected.
       - Show preset indicator when `presetId` is set.
   - Confirm that for Pixverse:
     - `model` dropdown shows all values from `VideoModel.ALL`.
     - `image_to_video` has no `aspect_ratio` selector, but does have `camera_movement` and the advanced toggles.
     - `multi_shot`, `audio`, `off_peak` appear as checkboxes in the advanced popover.

4. **Reuse pattern & future integration**
   - Document (in a short developer note or inline JSDoc):
     - How other modules (e.g. Intimacy composer) should use `GenerationSettingsBar`:
       - Fetch `operation_specs` via `useProviderSpecs`.
       - Derive `paramSpecs` from `operation_specs[operationType].parameters` (same filtering as `QuickGenerateModule`).
       - Hold `dynamicParams` and `providerId` in their own state.
       - Drop in `<GenerationSettingsBar />` with the same prop shape.
   - Optionally, add a TODO section listing candidate integration points:
     - `apps/main/src/components/intimacy/IntimacySceneComposer.tsx` (Generation tab).
     - Dev panels that inspect or replay generations.

5. **Validation**
   - Backend:
     - `python -m py_compile pixsim7/backend/main/services/provider/adapters/pixverse.py`.
     - Any existing tests covering `/providers` or generation specs should still pass.
   - SDK:
     - `python -m py_compile pixverse/models.py pixverse/__init__.py`.
   - Frontend (when appropriate):
     - Ensure TypeScript builds and the app runs.
     - Manually verify Control Center:
       - Pixverse + `text_to_video` shows all models, including `v5.5`, with aspect ratio.
       - Pixverse + `image_to_video` has no aspect dropdown, but has camera movement + advanced `multi_shot`, `audio`, `off_peak` toggles.
       - Settings bar behaves identically to before in terms of layout and interaction.

---

## Notes for Agents

- Prefer evolving `VIDEO_OPERATION_FIELDS` / `get_video_operation_fields()` in the SDK over adding new special cases in the PixSim7 adapter.
- When adding new Pixverse video features:
  1. Add the field to `GenerationOptions`.
  2. Add the field name to the relevant lists in `VIDEO_OPERATION_FIELDS`.
  3. Update `pixsim7`’s `video_field_specs` mapping to include a matching `ParamSpec` entry.
- For non-Pixverse providers (Sora, Runway, Pika), keep generation specs parallel in spirit, but do not force them into the Pixverse model structure; they can have their own metadata helpers.

---

## Implementation Summary ✅

**Status**: Complete

**Deliverables implemented**:

1. **SDK UI metadata** - `pixverse-py` exports `get_video_operation_fields()` for per-operation field lists
2. **Backend adapter alignment** - `pixverse.py` uses SDK metadata via `get_operation_parameter_spec()`
3. **GenerationSettingsBar component** - Reusable settings bar at `apps/main/src/components/control/GenerationSettingsBar.tsx`
   - Provider dropdown, primary param selects, advanced popover
   - Cost hints integration via `useCostHints`
   - Fully documented with JSDoc and usage examples
4. **QuickGenerateModule integration** - Uses GenerationSettingsBar internally
5. **Validation** - Pixverse video operations respect SDK field mappings (no aspect_ratio for image_to_video, etc.)

**Key files**:
- `apps/main/src/components/control/GenerationSettingsBar.tsx`
- `apps/main/src/components/control/GenerationSettingsBar.md` (documentation)
- `pixsim7/backend/main/services/provider/adapters/pixverse.py`

