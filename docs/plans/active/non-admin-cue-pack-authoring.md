# Non-Admin CUE Pack Authoring Plan

Last updated: 2026-03-10
Owner: prompt-pack authoring lane
Status: active
Stage: implementation

## 1) Goal

Enable non-admin users to author prompt primitive packs in CUE, validate/compile them safely on backend, use them privately at runtime, and optionally publish/share them through a controlled workflow.

## 2) Scope

- In scope:
  - User-scoped CUE authoring in UI.
  - Backend compile/validate pipeline (single source of truth).
  - Private runtime usage of user packs.
  - Optional publish/share workflow without requiring global admin write access.
  - Prompt Library integration for authoring and inspection.
- Out of scope:
  - Replacing existing system packs on disk.
  - Full marketplace/discovery ranking.
  - Arbitrary backend plugin execution from user-authored code.

## 3) Current Baseline

- Prompt Library already has `packages`, `templates`, `blocks`, `matrix`, `interactions` tabs in:
  - `apps/main/src/features/panels/domain/definitions/prompt-library-inspector/PromptLibraryInspectorPanel.tsx`
- Block primitives can be queried/edited through block template APIs.
- Content-pack reload from disk is admin-gated in:
  - `pixsim7/backend/main/api/v1/block_templates/routes_content_packs.py`
- CUE source currently lives in repo (`tools/cue/prompt_packs/`) and generated schemas are committed.

### 3.1) Mandatory Pre-Implementation Audit

Before adding new authoring or ownership code, perform a targeted reuse audit and document findings in the implementation PR:

- Existing authoring surfaces/endpoints to inspect first:
  - `apps/main/src/features/panels/domain/definitions/prompt-library-inspector/PromptLibraryInspectorPanel.tsx`
  - `pixsim7/backend/main/api/v1/block_templates/routes_blocks.py`
  - `pixsim7/backend/main/api/v1/block_templates/routes_content_packs.py`
- Existing ownership/list-scope helpers to reuse first:
  - `pixsim7/backend/main/services/ownership/user_owned.py`
  - `pixsim7/backend/main/services/prompt/block/template_service.py` (`_coerce_owner_user_id`, `_normalize_owner_metadata`)
  - `pixsim7/backend/main/api/v1/analyzers.py` (user-owned list scope patterns)
- Rule:
  - Do not introduce new ownership helper patterns until this audit confirms a real gap.
  - Prefer extending shared helpers over copy-pasting owner checks in new endpoints.

## 4) Product Model

- Authoring should be "private by default".
- Each user can create packs under a user namespace, for example:
  - `user.<user_id>.<pack_slug>`
- Users can run their own packs immediately in their own sessions.
- Publishing is versioned and immutable.
- Shared visibility is controlled by workflow state, not by direct overwrite of global packs.

## 5) Architecture Decisions

- Decision A:
  - Keep system packs file-based as they are.
  - Add user packs in DB-backed registry/storage.
- Decision B:
  - Compile CUE on backend only.
  - Frontend never compiles or trusts local generated artifacts.
- Decision C:
  - Runtime reads from a merged logical catalog:
  - `system packs (file)` + `approved shared packs (db)` + `user private packs (db, owner only)`.
- Decision D:
  - Non-admin can submit and publish to shared catalog only via workflow transitions allowed by policy.

## 6) Data Model (DB)

Add tables (or equivalent models):

- `prompt_pack_draft`
  - `id`, `owner_user_id`, `namespace`, `pack_slug`, `status`
  - `cue_source`, `last_compile_status`, `last_compile_errors`, `last_compiled_at`
  - `created_at`, `updated_at`
- `prompt_pack_version`
  - `id`, `draft_id`, `version`, `cue_source`
  - `compiled_schema_yaml`, `compiled_manifest_yaml`, `compiled_blocks_json`
  - `checksum`, `created_at`
- `prompt_pack_publication`
  - `id`, `version_id`, `visibility` (`private`, `shared`, `approved`)
  - `review_status` (`draft`, `submitted`, `approved`, `rejected`)
  - `reviewed_by`, `reviewed_at`, `review_notes`

Recommended status enums:

- Draft lifecycle:
  - `DRAFT`, `COMPILE_OK`, `COMPILE_FAILED`, `SUBMITTED`, `APPROVED`, `REJECTED`

## 7) Backend API Plan

Add new API group, for example: `/api/v1/prompt-packs`

- Authoring:
  - `POST /drafts`
  - `GET /drafts`
  - `GET /drafts/{id}`
  - `PATCH /drafts/{id}` (metadata only)
  - `PUT /drafts/{id}/source` (replace CUE source)
  - `POST /drafts/{id}/validate` (syntax + schema checks)
  - `POST /drafts/{id}/compile` (generate artifacts)
- Versioning:
  - `POST /drafts/{id}/versions` (snapshot from latest compile)
  - `GET /drafts/{id}/versions`
  - `GET /versions/{version_id}`
- Publication:
  - `POST /versions/{version_id}/submit`
  - `POST /versions/{version_id}/approve`
  - `POST /versions/{version_id}/reject`
  - `POST /versions/{version_id}/publish-private`
  - `POST /versions/{version_id}/publish-shared`
- Catalog/runtime:
  - `GET /catalog?scope=self|shared|system|all`
  - `POST /catalog/{pack_id}/activate` (user preference binding)
  - `POST /catalog/{pack_id}/deactivate`

Notes:

- Keep existing block-template APIs unchanged for backward compatibility.
- New APIs should return compile diagnostics with line/column and normalized error codes.

## 8) Compile/Validation Pipeline

Pipeline stages:

- Stage 1: Parse CUE.
- Stage 2: Validate against prompt pack contract.
- Stage 3: Generate normalized schema/manifest/blocks artifacts.
- Stage 4: Run pack lints (id policy, signature contract, namespace policy, duplicates).
- Stage 5: Store compile result with deterministic checksum.

Operational constraints:

- Hard timeout for compile process.
- Memory and output size limits.
- Per-user rate limit and daily compile quotas.
- Reject pack IDs that attempt system namespaces.

## 9) Runtime Integration

- Extend pack registry service to include DB packs.
- Filter by viewer user:
  - always include system packs.
  - include owner private packs.
  - include approved shared packs.
- Preserve existing resolution behavior for current users and tests.
- Add cache invalidation when draft/version publication changes.

## 10) Prompt Library UI Plan

Add a new `authoring` tab to Prompt Library Inspector:

- Left pane:
  - user drafts list
  - status chip
  - last compile result
- Main pane:
  - CUE editor (raw mode)
  - optional guided form mode (later)
  - compile/validate actions
  - artifact preview tabs:
    - generated schema
    - generated manifest
    - block catalog preview
  - quick test area:
    - input prompt
    - parsed candidates
    - primitive match projection result
- Publish controls:
  - save draft
  - create version
  - submit/share
  - review status panel

## 11) Security and Policy

- No filesystem writes from user authoring requests.
- No execution of arbitrary user code.
- Strict namespace ownership checks on every write.
- Full audit trail for source updates, compile actions, publish actions, and approvals.

## 12) Delivery Phases

### Phase 0: Contract and Storage

- Add DB models and migrations.
- Add compile result schema and status enums.
- Add minimal draft CRUD endpoints.

Exit criteria:

- User can create draft and store CUE source.

### Phase 1: Compile + Validate

- Implement backend compile/validate pipeline with diagnostics.
- Add `validate` and `compile` endpoints.
- Add server tests for invalid/valid packs and guardrails.

Exit criteria:

- User can compile and preview artifacts from CUE source.

### Phase 2: Runtime Consumption

- Merge DB packs into runtime catalog for owner scope.
- Add activation/deactivation API and preference binding.
- Add resolver tests to prove private pack isolation.

Exit criteria:

- User can use private authored pack in prompt flow without admin action.

### Phase 3: Prompt Library Authoring UI

- Add `authoring` tab.
- Wire editor, compile/validate actions, diagnostics, and artifact previews.
- Add "quick interaction test" block.

Exit criteria:

- End-to-end authoring works from UI for non-admin user.

### Phase 4: Share/Review Workflow

- Add submit/approve/reject/publish endpoints.
- Add reviewer UI controls.
- Add shared catalog visibility rules.

Exit criteria:

- Non-admin users can submit packs and approved packs are visible to others.

## 13) Testing Plan

- Backend unit tests:
  - namespace rules
  - compile diagnostics mapping
  - lifecycle state transitions
  - visibility filtering by user
- Backend integration tests:
  - draft -> compile -> version -> activate -> runtime use
  - draft -> submit -> approve -> shared visibility
- Frontend tests:
  - authoring tab state transitions
  - compile error rendering
  - artifact preview rendering

## 14) Risks and Mitigations

- Risk: compile service abuse.
  - Mitigation: rate limits, quotas, hard timeouts.
- Risk: drift between CLI and backend compile outputs.
  - Mitigation: single compile pipeline and golden tests.
- Risk: catalog confusion between system/shared/private.
  - Mitigation: explicit scope badges and filter controls in UI.
- Risk: accidental breakage from unreviewed shared packs.
  - Mitigation: immutable versions and review gate for shared visibility.

## 15) First Sprint Backlog (Suggested)

- Task 1:
  - Add models + migration for draft/version/publication.
- Task 2:
  - Implement `POST/GET/PATCH /prompt-packs/drafts`.
- Task 3:
  - Implement compile service + `POST /drafts/{id}/validate` + `POST /drafts/{id}/compile`.
- Task 4:
  - Implement runtime catalog merge for owner scope.
- Task 5:
  - Add Prompt Library `authoring` tab skeleton and wire draft list + editor.
- Task 6:
  - Add end-to-end test: create draft -> compile -> activate -> visible in interactions tooling.

## Update Log

- 2026-03-10: Normalized plan metadata to template contract, fixed path references, and added update-log governance section.
