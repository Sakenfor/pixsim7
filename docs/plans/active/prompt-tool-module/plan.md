# Prompt Tool Module Plan

Last updated: 2026-03-10
Owner: prompt-tool module lane
Status: in progress
Stage: phase_4_complete_phase_5_pending

## Goal

Create a first-class "Prompt Tool" module that lets users run tool-like prompt operations (rewrite, blend, edit, transform) from raw text mode and block mode, while keeping outputs compatible with:

- current prompt text UX
- block primitive overlays
- guidance plan runtime payloads
- composition asset pipelines

This is a module-level architecture lane, not a one-off feature.

## Scope

- In scope:
  - Prompt tool preset contract (catalog + execution I/O).
  - Minimal backend execution endpoint for prompt tools.
  - Prompt UI integration in existing prompt surfaces.
  - User ownership model (private by default, optional share flow).
  - Normalized outputs that can be applied to text and/or blocks.
- Out of scope:
  - Full provider marketplace.
  - Replacing current generation endpoints.
  - Hard dependency on block mode for all users.
  - Generic plugin execution of arbitrary user code on backend.

## Current Baseline

- Relevant files/endpoints/services:
  - `apps/main/src/features/prompts/components/PromptComposer.tsx` (existing prompt editing entry)
  - `apps/main/src/features/prompts/hooks/useShadowAnalysis.ts` (existing analyzer loop)
  - `apps/main/src/features/prompts/lib/promptAnalysisCache.ts` (shared cache for prompt analysis)
  - `apps/main/src/features/panels/domain/definitions/prompt-library-inspector/PromptLibraryInspectorPanel.tsx` (authoring/inspection surface)
  - `apps/main/src/components/media/viewer/tools/viewerToolPresets.ts` (existing preset abstraction)
  - `pixsim7/backend/main/api/v1/prompt_packs.py` (non-admin authoring baseline)
  - `pixsim7/backend/main/api/v1/prompts/operations.py` (existing prompt operation surface)
  - `pixsim7/backend/main/shared/schemas/guidance_plan.py` (guidance payload contract)
  - `pixsim7/backend/main/services/ownership/user_owned.py` (owner/scope enforcement helpers)
  - `pixsim7/backend/main/api/v1/analyzers.py` (review/workflow patterns)

## Decisions Already Settled

- Prompt tools should live as a reusable module, not hidden inside a single panel.
- Non-admin users should be able to author/use their own prompt tool presets.
- Use existing app APIs and ownership helpers as the base path; only add new endpoints where needed.
- Raw text prompt remains valid and first-class; block primitives are additive.
- Tool runs should return normalized structured output, not provider-specific ad hoc blobs.

## Mandatory Pre-Implementation Audit

Before adding new prompt tool APIs or models, do a targeted reuse audit and include findings in the implementation PR:

- Authoring and list surfaces to inspect first:
  - `apps/main/src/features/panels/domain/definitions/prompt-library-inspector/PromptLibraryInspectorPanel.tsx`
  - `pixsim7/backend/main/api/v1/prompt_packs.py`
  - `pixsim7/backend/main/api/v1/block_templates/routes_blocks.py`
- Ownership helpers/patterns to reuse first:
  - `pixsim7/backend/main/services/ownership/user_owned.py`
  - `pixsim7/backend/main/services/prompt/block/template_service.py` owner normalization helpers
  - `pixsim7/backend/main/api/v1/analyzers.py` scoped list + review workflow patterns

Rule:

- Do not introduce new owner/scope helper patterns until this audit confirms a gap.
- Prefer extending shared helpers over endpoint-local owner logic.

### Audit findings (2026-03-10)

- `apps/main/src/features/panels/domain/definitions/prompt-library-inspector/PromptLibraryInspectorPanel.tsx`
  - Current tabs are package/template/block/matrix/interactions inspection; there is no prompt tool execution lane yet.
- `pixsim7/backend/main/api/v1/prompt_packs.py`
  - Uses canonical ownership helpers (`resolve_user_owned_list_scope`, `assert_can_write_user_owned`, `resolve_user_owner`) and response owner normalization patterns.
- `pixsim7/backend/main/api/v1/block_templates/routes_blocks.py`
  - Block primitive routes currently enforce auth but are not modeled as user-owned resources, so no reusable owner-scope logic was copied from here.
- `pixsim7/backend/main/services/ownership/user_owned.py`
  - Reused directly for list-scope resolution and write-access assertions.
- `pixsim7/backend/main/services/prompt/block/template_service.py`
  - Confirmed canonical owner metadata normalization helpers (`_coerce_owner_user_id`, `_normalize_owner_metadata`) for future DB-backed prompt tool presets.
- `pixsim7/backend/main/api/v1/analyzers.py`
  - Reused the scoped-list pattern (scope resolution first, then mapping to endpoint behavior) as the API baseline.

## Domain Contract

### PromptToolPreset

```ts
interface PromptToolPreset {
  id: string;                   // ex: prompt-tool:rewrite/style-shift
  label: string;
  description?: string;
  source: 'builtin' | 'user' | 'shared';
  category: 'rewrite' | 'compose' | 'edit' | 'extract' | 'analysis';
  enabled: boolean;
  requires: Array<'text' | 'composition_assets' | 'mask_asset' | 'regions'>;
  defaults?: Record<string, unknown>;
}
```

### PromptToolExecution

```ts
interface PromptToolExecutionRequest {
  preset_id: string;
  prompt_text: string;
  params?: Record<string, unknown>;
  run_context?: Record<string, unknown>; // composition_assets, masks, regions, etc.
}

interface PromptToolExecutionResult {
  prompt_text: string; // always present
  block_overlay?: Array<Record<string, unknown>>; // optional additive block patches
  guidance_patch?: Record<string, unknown>;       // guidance_plan partial
  composition_assets_patch?: Array<Record<string, unknown>>;
  warnings?: string[];
  provenance: {
    preset_id: string;
    analyzer_id?: string;
    model_id?: string;
  };
}
```

Key rule: `prompt_text` is always emitted so raw mode can consume results without requiring block mode.

## API Plan

Use `/api/v1/prompt-tools` as a focused module surface.

- Catalog:
  - `GET /prompt-tools/catalog?scope=self|shared|builtin|all`
- Execution:
  - `POST /prompt-tools/execute`
- User presets:
  - `POST /prompt-tools/presets`
  - `GET /prompt-tools/presets`
  - `GET /prompt-tools/presets/{id}`
  - `PATCH /prompt-tools/presets/{id}`
  - `DELETE /prompt-tools/presets/{id}`
- Optional review workflow (same pattern as analyzer presets):
  - `POST /prompt-tools/presets/{id}/submit`
  - `POST /prompt-tools/presets/{id}/approve`
  - `POST /prompt-tools/presets/{id}/reject`

Policy notes:

- Apply `resolve_user_owned_list_scope` and `assert_can_write_user_owned`.
- Non-admin users can create/update their own presets.
- Public/shared visibility only through workflow transitions.

## UI Plan

Primary integration surfaces:

- `PromptComposer`: add a "Tools" rail that can run a selected preset against current text/asset context.
- `PromptLibraryInspectorPanel`: add a `tools` tab for catalog, ownership badges, and preset editing.
- Keep existing text and block editing unchanged unless a tool run is explicitly applied.

Apply flow:

1. User selects preset.
2. User runs with current prompt + context assets/masks.
3. UI shows diff/preview:
   - raw prompt diff
   - optional block overlay preview
   - optional guidance patch preview
4. User chooses apply mode: `replace_text`, `append_text`, `apply_overlay_only`, `apply_all`.

## Integration Map

```text
[Viewer Tool Presets] --(masks/regions/assets)----+
                                                   |
                                                   v
[PromptComposer text/blocks] --> [Prompt Tool Execute API] --> [PromptToolExecutionResult]
                                                   |                     |
                                                   |                     +--> prompt_text (always)
                                                   |                     +--> block_overlay (optional)
                                                   |                     +--> guidance_patch (optional)
                                                   |                     +--> composition_assets_patch (optional)
                                                   v
                                        [Generations run_context]
                                                   |
                                                   v
                                        [guidance_plan + composition_assets]
```

## Delivery Phases

### Phase 0: Contract and audit
Status: completed (2026-03-10)

- [x] Complete pre-implementation audit and document reuse decisions.
- [x] Finalize `PromptToolPreset` and execution result contract.
- [x] Add API schema models only (no endpoint behavior change yet).

Exit criteria:

- Contract is documented and used by both frontend and backend types.

### Phase 1: Builtin catalog + execute endpoint
Status: completed (2026-03-10)

- [x] Implement builtin prompt tool registry with a small starter set.
- [x] Add `GET /prompt-tools/catalog`.
- [x] Add `POST /prompt-tools/execute` for builtin presets only.
- [x] Return normalized execution result shape.

Exit criteria:

- Backend routes and tests validate catalog + execute contract for builtin presets.

### Phase 2: PromptComposer integration
Status: completed (2026-03-10)

- [x] Add tools rail to PromptComposer.
- [x] Add result preview + apply modes.
- [x] Preserve current undo/redo behavior and history snapshots after apply.

Exit criteria:

- User can run and apply tool output in text mode and block mode.

### Phase 3: User-owned preset CRUD
Status: completed (2026-03-10)

- [x] Add DB model/service for prompt tool presets.
- [x] Add user-owned CRUD endpoints.
- [x] Add scope filters (`mine`, `owner_user_id`, `include_public`) reusing existing patterns.

Exit criteria:

- Non-admin user can create and run private presets.

### Phase 4: Submit/approve/share workflow
Status: completed (2026-03-10)

- [x] Add review status transitions (`DRAFT -> SUBMITTED -> APPROVED/REJECTED`).
- [x] Add moderator/admin actions and audit trail.
- [x] Expose shared presets in catalog with badges.

Exit criteria:

- Approved shared presets are visible to other users via catalog scope.

### Phase 5: Cross-surface runtime wiring

- [ ] Wire prompt tools to viewer-origin context (`mask_asset`, regions, composition assets).
- [ ] Ensure `guidance_patch` and `composition_assets_patch` merge cleanly into generation run_context.
- [ ] Add one real "tool-style" flow (for example masked edit transform) end to end.

Exit criteria:

- Same preset can run from prompt panel and viewer-linked flow with consistent output contract.

## Suggested Builtin Presets

- `rewrite/style-shift`: tone/style transform on raw prompt text.
- `compose/reference-merge`: merge prompt text with up to N composition assets.
- `edit/masked-transform`: generate text + guidance patch for region/mask edits.
- `extract/structured-tags`: derive structured tags and patch into block overlay.

Keep this set minimal for first implementation; add more after telemetry.

## Testing and Observability

- Backend unit tests:
  - catalog scope filtering
  - owner access checks
  - execution result schema validation
  - workflow transitions (if phase 4 implemented)
- Frontend tests:
  - tools rail rendering and disabled states
  - preview/apply modes
  - undo/redo safety after apply
- Observability:
  - emit `prompt_tool_executed` events with preset id, duration, apply mode
  - track error classes (`validation_error`, `execution_error`, `permission_denied`)

## Risks

- Risk: duplicated abstractions with viewer tools and analyzer presets.
  - Mitigation: keep prompt tools focused on prompt transformation outputs and reuse owner/workflow helpers.
- Risk: provider-specific coupling leaks into tool outputs.
  - Mitigation: keep output normalized (`prompt_text`, `guidance_patch`, `composition_assets_patch`) and adapt later.
- Risk: UI overload in PromptComposer.
  - Mitigation: default collapsed tools rail and progressive disclosure.

## First Sprint Backlog

1. Audit and contract finalization PR.
2. Backend catalog + execute (builtin-only) PR.
3. PromptComposer tools rail + preview/apply PR.
4. Core tests for execution schema + UI apply flow PR.

## Update Log

- 2026-03-10 (`uncommitted`): Normalized metadata fields to template contract (`Last updated`, `Owner`, `Status`, `Stage`).
- 2026-03-10 (`uncommitted`): Added to `docs/plans/registry.yaml`; enabled `docs:plans:check` lint + CI integration.
- 2026-03-10 (`uncommitted`): Aligned section naming/checklist style with `docs/plans/TEMPLATE.md`; marked Phase 0/1 complete.
- 2026-03-10 (`uncommitted`): Completed Phase 2 PromptComposer integration (tools rail, execute preview, apply modes with undo-safe snapshots).
- 2026-03-10 (`uncommitted`): Completed Phase 3 backend lane (DB model + migration, CRUD/list/execute ownership wiring, and prompt-tools API/service tests).
- 2026-03-10 (`uncommitted`): Completed Phase 4 review workflow (submit/approve/reject endpoints, status metadata, admin moderation paths, and workflow tests).
