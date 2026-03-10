# Mask Tool Capability Task List

Last updated: 2026-03-10
Owner: viewer-mask-tools lane
Status: active
Stage: phase_4_complete_phase_5_pending

## Purpose

Drive the next implementation slice for media viewer masking without mixing it with ownership, account, or project work.

This lane is about:

- viewer mask-tool UX
- automatic/local mask capabilities
- provider-backed mask/edit tools
- the contract between manual masks, analyzers, and provider operations

This lane is not about:

- ownership canonicalization
- accountless auth/owner context
- project/world availability

## Decisions Already Settled

These should be treated as constraints, not rediscovered:

- Do not create a standalone mask-only registry as the main long-term solution.
- Local automatic masking can fit the analyzer/capability side.
- Provider-backed edits are still tool-like and should be exposed as higher-level tool presets over provider operations.
- Long term, the system likely grows from "analyzers" into a broader capability/module registry, but first steps should be additive and low-risk.
- Manual mask drawing/export remains the baseline path and must keep working.
- `guidance_plan.masks` is the provider-agnostic runtime target for masks when a generation path supports richer guidance.

## Current Code Anchors

Use these files as the factual starting point:

| Area | File | Why it matters |
| --- | --- | --- |
| Viewer manual mask overlay | `apps/main/src/components/media/viewer/overlays/builtins/maskOverlay.tsx` | Current draw/erase/layer/export/save behavior |
| Viewer host | `apps/main/src/components/media/viewer/panels/MediaPanel.tsx` | Where overlay modes are mounted |
| Viewer tool extension surface | `apps/main/src/components/media/viewer/tools/index.ts` | Existing registry pattern worth mirroring |
| Generation mask picker | `apps/main/src/features/generation/components/generationSettingsPanel/MaskPicker.tsx` | Current saved-mask selection UX |
| Provider capability registry | `apps/main/src/features/providers/lib/core/capabilityRegistry.ts` | Existing frontend capability source for operations |
| Analyzer frontend entry | `apps/main/src/lib/analyzers/index.ts` | Current analyzer surface on frontend |
| Operation typings | `apps/main/src/types/operations.ts` | Existing `auto_mask_info` hint and operation metadata |
| Analyzer preset/instance API area | `pixsim7/backend/main/api/v1/analyzers.py` | Existing analyzer registry/API concepts |
| Guidance plan | `docs/prompts/guidance-plan-v1.md` | Canonical provider-agnostic masks contract |
| Analyzer architecture context | `docs/architecture/local-llm-prompt-analyzer.md` | Evidence that analyzer registry is already broader than prompt-only |

## Delivery Rules

- Keep changes lane-scoped. Do not touch ownership/account/project code.
- Prefer additive types/adapters over broad renames.
- Avoid a big "registry rewrite" first.
- Keep current manual mask flows backward compatible.
- When in doubt, define a neutral contract first, then wire one real capability through it.

## Phase 1: Current-State Audit + Neutral Contract

- [x] Inventory the current manual mask flow end-to-end:
  - viewer overlay draw/erase
  - saved mask asset export
  - generation mask picker consumption
  - any existing `mask_url` / `maskLayers` / `auto_mask_info` use
- [x] Define a neutral frontend type for mask-tool options:
  - **Decision**: adopted `ViewerToolPreset` (B1 rollout) instead of mask-only `MaskToolOption`
  - Split original `kind` into `source` × `category` (addresses taxonomy overlap concern)
  - Added `outputMapping` per-preset (addresses phase ordering concern)
  - Added `ViewerToolExecution` state machine for async tools
  - B1 ships `category: 'mask' | 'edit'`; `'annotate' | 'reference'` reserved
  - `MaskToolOption` is a temporary narrowed alias during B1
- [x] Put this contract in a stable place that does not force analyzer/provider coupling into the viewer component itself.
  - File: `components/media/viewer/tools/viewerToolPresets.ts`
- [x] Document how this option contract maps to current manual mask behavior.
  - `PRESET_MANUAL_DRAW`: source=manual, category=mask, outputKind=asset, outputMapping=mask_url
  - `PRESET_MANUAL_POLYGON`: same output path, different interaction mode

Acceptance criteria:

- ~~one neutral type/model exists for mask-tool options~~ **Done**: `ViewerToolPreset`
- ~~manual mask overlay can be represented by that model without behavior changes~~ **Done**: `PRESET_MANUAL_DRAW` + `PRESET_MANUAL_POLYGON`

## Phase 2: Local Automatic Mask Options

- [x] Audit current analyzer/catalog surfaces and determine what metadata exists today for asset analyzers.
  - Backend: `AnalyzerKind` (parser/llm/vision), `AnalyzerTarget` (prompt/asset), `AnalyzerTaskFamily` (detection/caption/ocr/etc)
  - 8 built-in analyzers (4 prompt, 4+ asset). `asset:object-detection` closest to mask capabilities
  - No existing mask.detect/segment/track tags — task_family is the available discriminator
- [x] Decide the minimum capability tags needed for local masking:
  - **Decision**: use existing `task_family: 'detection'` as the B1 bridge criterion
  - Future task families (segmentation, tracking) will be added backend-side; bridge picks them up automatically
- [x] Add an additive bridge layer from analyzer info to mask-tool options.
  - File: `components/media/viewer/tools/analyzerPresetBridge.ts`
  - `analyzerToPreset()` maps asset analyzers with detection task_family → ViewerToolPreset
  - `analyzersToPresets()` batch-converts catalog entries
- [x] Do not require a full backend analyzer schema refactor in the first slice.
  - Bridge uses local `AnalyzerCatalogEntry` interface — no backend changes needed
- [x] If current analyzer responses are too narrow, add the smallest possible metadata/capability extension needed.
  - No extension needed — existing `task_family` is sufficient for B1

Acceptance criteria:

- ~~at least one local-capability path can appear in the viewer as a mask-tool option~~ **Done**: `asset:object-detection` → `analyzer:asset:object-detection` preset via bridge
- ~~no analyzer rename or large registry migration is required yet~~ **Done**: zero backend changes

## Phase 3: Provider-Backed Tool Presets

- [ ] Define a "tool preset" layer above provider operations.
- [ ] Start with a small set of concrete presets:
  - `remove_text`
  - `remove_object`
  - `inpaint_selection`
- [ ] Each preset should wrap an existing provider operation contract, likely `image_edit` or similar, with a default prompt/parameter policy.
- [ ] Availability should come from provider capabilities/operation specs, not hardcoded viewer logic.
- [ ] Keep the distinction clear:
  - provider operations are low-level execution primitives
  - tool presets are user-facing actions

Acceptance criteria:

- at least one provider-backed edit tool can be described without special-casing the viewer
- the preset abstraction does not break existing generation/provider flows

## Phase 4: Viewer UX Wiring

- [x] Add a mask-tool options surface to the viewer/mask overlay UI.
  - `useViewerToolPresets` hook in `MaskToolsPanel`
  - `PresetButton` component for preset entries
  - "Source" section in left sidebar, shown only when non-manual presets exist
- [x] Group options into at least:
  - manual (from `useViewerToolPresets.manual`)
  - auto/local (from `useViewerToolPresets.automatic`)
  - provider/edit — available but no real provider presets wired yet
- [x] Show unavailable options with a concrete reason when possible:
  - `resolvePresetAvailability()` returns `{ available: false, reason: string }` for disabled presets
  - Shown as button title/tooltip
- [x] Do not bury current manual draw workflow behind the new abstraction.
- [ ] Keep the first UI slice simple: one visible entry point, no heavy redesign.

Acceptance criteria:

- the viewer can list mask-related actions from a contract rather than only hardcoded manual tools
- manual draw remains the default safe path

## Phase 5: Runtime Output Contract

- [ ] Define what each option produces:
  - saved mask asset
  - transient region geometry
  - generation edit request
- [ ] Ensure outputs can map cleanly to existing generation concepts:
  - `mask_url`
  - `maskLayers`
  - `guidance_plan.masks`
  - `auto_mask_info` if still needed as an intermediate compatibility field
- [ ] Prefer `guidance_plan.masks` as the richer canonical runtime target when the path supports it.
- [ ] Avoid adding another ad hoc mask payload if an existing one can be normalized instead.

Acceptance criteria:

- one written mapping exists from each mask-tool option kind to runtime generation payloads

## Phase 6: Tests

- [ ] Add unit tests for the mask-tool option adapter layer.
- [ ] Add one viewer-level test or focused component test proving manual + one non-manual option can coexist.
- [ ] Add one provider-preset availability test if provider-backed presets are introduced.
- [ ] Add one analyzer-to-option mapping test if local capability bridging is introduced.

Acceptance criteria:

- the new abstraction is covered by narrow tests, not only manual UI clicks

## Suggested PR Slices

1. Neutral option contract + current-state audit notes + manual option adapter only.
2. Analyzer/capability bridge for local auto-mask options.
3. Provider-backed tool preset abstraction and one real preset.
4. Viewer UI wiring and minimal tests.

## Good First Concrete Deliverable

If only one focused slice is taken first, it should be:

- add `MaskToolOption` contract
- expose current manual mask flow through that contract
- add one placeholder/real "auto mask" option source adapter
- keep behavior unchanged unless the new option is explicitly selected

## Explicit Non-Goals For This Lane

- do not rename all analyzers into capabilities in one pass
- do not refactor ownership systems
- do not redesign the whole media viewer
- do not force provider-specific edit UX directly into the mask overlay component

## Update Log

- 2026-03-10: Normalized plan metadata to template contract and added update-log governance section.
