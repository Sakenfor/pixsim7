# Authoring Project System Completion (Claude Task)

## Objective
- [ ] Complete the DB-backed authoring project system end-to-end, including lifecycle UX, autosave/recovery, extension versioning/migration, broader project-context capability usage, and test coverage.

## Repo Context
- [ ] Workspace: `G:\code\pixsim7`
- [ ] We are moving toward schema extensibility and away from ad-hoc registries.
- [ ] Do not revert unrelated dirty working tree changes.

## Baseline Commits To Inspect First
- [ ] `fac388b0` - DB-backed project snapshots and panel save/load
- [ ] `a8ecc3d9` - Auto-discover project bundle contributors
- [ ] `51ac9586` - Project index + current project context
- [ ] `29adca0e` - Snapshot lifecycle ops (rename/duplicate/delete)

## Primary Files To Review
### Frontend
- [ ] `apps/main/src/features/panels/components/tools/ProjectPanel.tsx`
- [ ] `apps/main/src/features/scene/stores/projectSessionStore.ts`
- [ ] `apps/main/src/features/scene/stores/projectIndexStore.ts`
- [ ] `apps/main/src/features/contextHub/components/ContextHubRootProviders.tsx`
- [ ] `apps/main/src/features/contextHub/domain/capabilities.ts`
- [ ] `apps/main/src/lib/game/projectBundle/types.ts`
- [ ] `apps/main/src/lib/game/projectBundle/contributors.ts`
- [ ] `apps/main/src/lib/game/projectBundle/service.ts`
- [ ] `apps/main/src/lib/game/projectBundle/autoDiscover.ts`
- [ ] `apps/main/src/lib/api/game.ts`

### Backend
- [ ] `pixsim7/backend/main/domain/game/core/models.py`
- [ ] `pixsim7/backend/main/domain/game/schemas/project_bundle.py`
- [ ] `pixsim7/backend/main/domain/game/schemas/__init__.py`
- [ ] `pixsim7/backend/main/services/game/project_storage.py`
- [ ] `pixsim7/backend/main/api/v1/game_worlds.py`
- [ ] `pixsim7/backend/main/tests/api/test_game_world_project_bundle_endpoints.py`

## Implementation Scope

### 1) Current Project UX Polish
- [ ] Add explicit **Save Current** behavior:
  - [ ] If current project exists, overwrite that project directly.
  - [ ] Keep existing **Save As New** and **Overwrite Selected** behavior.
- [ ] Add a clear active/current project badge in Project panel.
- [ ] Add unsaved marker state in Project panel.
- [ ] Keep current project metadata consistent after save/load/rename/duplicate/delete.
- [ ] Clear/repair current-project state when deleting current project.

### 2) DB Autosave + Recovery (No File Export)
- [ ] Implement backend autosave draft persistence.
- [ ] Choose and implement durable data model for drafts:
  - [ ] Extend snapshots with draft metadata OR
  - [ ] Add dedicated draft table/model/endpoints.
- [ ] Add API support:
  - [ ] Create/update draft
  - [ ] Fetch latest draft (metadata + payload)
  - [ ] Delete/clear draft
- [ ] Frontend autosave:
  - [ ] Autosave periodically only when dirty
  - [ ] Debounce/throttle to avoid API spam
- [ ] Add **Recover latest draft** action in Project panel.
- [ ] Add conflict handling when draft is newer than saved snapshot.

### 3) Extension Contract Hardening (Version + Migration)
- [ ] Upgrade extension contract to include versioned payload handling.
- [ ] Add migration hook(s) for extension payload upgrades.
- [ ] Ensure export includes extension version metadata.
- [ ] Maintain backward compatibility with legacy/raw extension payloads.
- [ ] On unknown/unsupported versions, warn and continue where possible.
- [ ] Improve extension import/export report with migrated/skipped/failed details.
- [ ] Keep auto-discovery behavior (`features/*/projectBundle/*`) intact.

### 4) Capability Adoption Across Panels
- [ ] Extend usage of `CAP_PROJECT_CONTEXT` beyond Project panel.
- [ ] Wire into a few high-value authoring-facing panels/components.
- [ ] Avoid introducing React/Zustand update loops.

### 5) Testing + Validation
- [ ] Add/extend backend tests for autosave/recovery endpoints.
- [ ] Add tests for extension versioning/migration paths.
- [ ] Add/extend frontend store tests:
  - [ ] `projectSessionStore`
  - [ ] `projectIndexStore`
- [ ] Add/extend Project panel logic tests where practical.
- [ ] Keep existing snapshot endpoint tests passing.
- [ ] Run and report:
  - [ ] `pytest -q pixsim7/backend/main/tests/api/test_game_world_project_bundle_endpoints.py`
  - [ ] Relevant new backend tests
  - [ ] `pnpm --filter @pixsim7/main exec tsc --noEmit --pretty false`

## Constraints
- [ ] Do not break existing working authoring flows.
- [ ] Prefer additive, backward-compatible changes.
- [ ] Do not use temporary compatibility shims unless truly necessary.
- [ ] Do not modify unrelated files in a dirty tree.
- [ ] Keep implementation and naming aligned with existing repo patterns.

## Deliverables
- [ ] Implement all scope items above end-to-end.
- [ ] Provide concise delivery summary:
  - [ ] Changed files
  - [ ] API additions
  - [ ] Data model/migration notes
  - [ ] Backward-compatibility notes
  - [ ] Test results
  - [ ] Residual risks/TODOs
- [ ] If large, split into logical commits:
  - [ ] Backend model/API
  - [ ] Frontend integration
  - [ ] Extension versioning/migration
  - [ ] Tests

---

## Copy/Paste Prompt For Claude
```text
You are a senior full-stack engineer working in this repo: G:\code\pixsim7.

Complete the task described in `.claude/tasks/authoring-project-system-completion.md`.

Requirements:
- Work through every checklist section.
- Keep changes backward-compatible and avoid touching unrelated dirty files.
- Run the required tests and report outcomes.
- If scope is too large for one commit, split into logical commits by layer.

Output format:
1) Summary of what was implemented
2) File list grouped by backend/frontend/tests
3) API/schema/model changes
4) Validation commands and results
5) Remaining risks/TODOs
```
