# Extension Platform Program Tracker

Last updated: March 5, 2026  
Scope owner: extension-platform lane (chat + delegated agents)

## Purpose

Operational tracker for the extension platform unification program.
This file is for execution tracking and handoff continuity.

Companion strategy doc:
- [`README.md`](./README.md)

## Program Goal

Unify plugins, analyzers, semantic packs, and block packs under one extension model:

1. canonical identity
2. shared lifecycle
3. unified registry projection
4. policy-governed publish flow
5. backward compatibility during migration

## Current Baseline Snapshot

### Available now

1. Plugin capability sandbox and permission model.
2. Plugin load-time permission validation and allow/deny controls.
3. Per-user plugin enablement state.
4. Per-world plugin enablement state.
5. Analyzer plugin registration hooks.
6. Analyzer preset review flow.
7. Semantic pack status flow.
8. Namespaced block ID policy.
9. Shared scaffold added:
   - backend contract helpers: `shared/extension_contract.py`
   - tests: `test_extension_contract.py`

### Missing now

1. Cross-domain canonical identity adoption.
2. Cross-domain lifecycle engine.
3. Unified extension catalog projection.
4. Unified review/publish policy gate.
5. Artifact provenance/version governance.

## Workstream Board

Status legend: `pending`, `in_progress`, `blocked`, `done`

| ID | Workstream | Status | Scope | Dependencies | Exit Criteria |
| --- | --- | --- | --- | --- | --- |
| EP-01 | Identity Contract Adoption | blocked | Adopt canonical extension IDs across boundaries while preserving legacy IDs. | Scaffold contract module; analyzer ID format migration | At least 2 domains read/write via shared identity parser/builder with migration tests. |
| EP-02 | Shared Lifecycle Engine | pending | Centralize transition rules (`draft/submitted/approved/rejected/published/deprecated`). | EP-01 | Analyzer presets + semantic packs both use one transition helper/service. |
| EP-03 | Unified Extension Catalog | pending | Add projection for all extension kinds with discoverability metadata. | EP-01, EP-02 | One query surface for extension discovery across kinds. |
| EP-04 | Runtime Metadata Wiring | pending | Carry canonical identity metadata through plugin manager/analyzer registry/pack loaders. | EP-01, EP-03 | Runtime emits canonical identity fields in diagnostics and logs. |
| EP-05 | Publish Policy + Audit | pending | Standardize approval checks, trust policy, and audit records. | EP-02, EP-03 | Submit/approve/reject/publish actions are policy-enforced and auditable. |
| EP-06 | Frontend Discovery Alignment | pending | Move frontend to catalog-driven extension discovery where feasible. | EP-03 | Frontend no longer depends on fragmented discovery contracts. |

## Milestones

| Milestone | Target | Status | Completion Signal |
| --- | --- | --- | --- |
| M1: Identity Foundation | Week 1 | blocked | Canonical identity contract used by two real domains; tests green. Blocked: analyzer IDs must migrate to canonical format first. |
| M2: Lifecycle Unification | Week 2 | pending | Shared lifecycle service replaces duplicated transitions in at least two domains. |
| M3: Unified Catalog v1 | Week 3 | pending | Registry projection table/view + read API endpoint available. |
| M4: Runtime + Policy Wiring | Week 4 | pending | Runtime metadata and policy/audit flow active for one extension kind end-to-end. |
| M5: Cross-domain Rollout | Week 5+ | pending | Plugins/analyzers/packs covered by one extension catalog + policy flow. |

## Phase Plan With Checkpoints

## Phase 1: Identity

Checklist:
- [ ] Define DB migration strategy for canonical identity columns.
- [ ] Migrate analyzer IDs from `<target>:<name>` to `<kind>:<scope>.<owner>/<name>` format (prerequisite for identity adoption).
- [ ] Add adapters for legacy ID fallback in existing services. *(EP-01.1 reverted — see decision log 2026-03-05c)*
- [ ] Add compatibility tests for mixed canonical/legacy reads.
- [ ] Document API contract updates.

Quality gates:
1. No breaking change for legacy IDs.
2. Existing plugin/analyzer flows remain operational.

## Phase 2: Lifecycle

Checklist:
- [ ] Introduce shared lifecycle transition service.
- [ ] Rewire analyzer preset transitions to shared service.
- [ ] Rewire semantic pack transitions to shared service.
- [ ] Add transition audit/event hooks.

Quality gates:
1. Identical behavior for existing workflows.
2. Explicit transition error semantics.

## Phase 3: Catalog Projection

Checklist:
- [ ] Define `extension_catalog` read model schema.
- [ ] Build projection sync path from source domains.
- [ ] Add filtered list endpoint(s) for kind/scope/status.
- [ ] Add admin diagnostics for projection drift.

Quality gates:
1. Projection rebuild is deterministic.
2. Query latency acceptable for frontend usage.

## Phase 4: Runtime + Policy

Checklist:
- [ ] Runtime metadata wiring for plugin/analyzer registries.
- [ ] Unified submit/approve/reject/publish policy checks.
- [ ] Audit trails for governance actions.
- [ ] Feature flags for staged rollout.

Quality gates:
1. Policy denies unsafe transitions consistently.
2. Audit records capture actor + target + decision.

## Migration Waves

| Wave | Domains | Strategy |
| --- | --- | --- |
| Wave A | Analyzer presets + semantic packs | Lowest-risk lifecycle unification proof. |
| Wave B | Plugin catalog + plugin runtime metadata | Add canonical identity and policy metadata without changing plugin loading semantics. |
| Wave C | Block pack metadata + discovery | Align pack IDs and ownership model to extension identity. |
| Wave D | Frontend discovery paths | Shift to catalog-driven discovery incrementally with fallbacks. |

## Risk Register

| Risk | Impact | Likelihood | Mitigation | Status |
| --- | --- | --- | --- | --- |
| Legacy ID breakage | High | Medium | Dual-read/write period + compatibility tests. | open |
| Runtime behavior drift | High | Medium | Feature flags + golden tests on resolver/runtime outputs. | open |
| Policy false positives | Medium | Medium | Dry-run mode + audit review before enforcement. | open |
| Projection staleness | Medium | Medium | Rebuild job + drift diagnostics endpoint. | open |
| Scope creep across domains | Medium | High | Milestone gating and strict workstream ownership. | open |

## Decision Log

| Date | Decision | Reason | Follow-up |
| --- | --- | --- | --- |
| 2026-03-05 | Use canonical extension ID format `<kind>:<scope>.<owner>/<name>[@<version>]` as shared target. | Supports multi-kind, owner-scoped, version-aware identity. | Adopt via adapters first (no hard cutover). |
| 2026-03-05 | Keep legacy IDs functional during migration. | Zero-user-disruption and staged rollout safety. | Add deprecation metrics before removal timeline. |
| 2026-03-05 | Separate strategy doc from operational tracker. | Better handoff and execution clarity. | Keep this file updated weekly or per milestone move. |
| 2026-03-05 | Revert EP-01.1 analyzer identity adoption. | Analyzer IDs use `<target>:<name>` format incompatible with canonical `<kind>:<scope>.<owner>/<name>`. Adapter produces meaningless keys. Identity adoption requires analyzer ID format migration first. | Define analyzer ID migration plan before re-attempting. |

## Metrics to Track

1. `% canonical IDs` by domain and endpoint.
2. `legacy ID parse hits` over time.
3. `lifecycle transition failures` by state pair.
4. `catalog projection drift count`.
5. `policy deny/allow counts` with reason distribution.
6. `runtime lookup latency` for extension discovery endpoints.

## Immediate Next Sprint (Execution Queue)

Priority order:
1. ~~EP-01.0: Define analyzer ID migration plan.~~ *(done — see `analyzer-id-migration.md`)*
2. EP-01.1R: Implement Phase B sidecar — mapping helpers, `extension_id` column on `analyzer_definitions`, response enrichment.
3. EP-01.2: Add identity adapter usage in semantic pack API/service boundaries (assess pack ID format compatibility first).
4. EP-01.3: Draft migration spec for canonical identity columns across remaining tables.
5. EP-02.1: Extract shared lifecycle transition service skeleton.
6. EP-02.2: Rewire one existing workflow to shared lifecycle service behind flag.

Execution prompt:
- [`ep-01-0-prompt.md`](./ep-01-0-prompt.md)
- EP-01.1 prompt is superseded until analyzer ID migration plan is complete.

## Update Template

Use this snippet for each update:

```md
### Update YYYY-MM-DD

- Progress:
  - ...
- Decisions:
  - ...
- Risks/Blocks:
  - ...
- Next:
  - ...
```

## Last Update Log

### Update 2026-03-05 (e) — EP-01.0 complete

- Progress:
  - Authored `docs/plans/extension-platform/analyzer-id-migration.md` with full inventory and phased migration design.
  - Key decision: **sidecar `extension_id`** alongside `analyzer_id`, not replacement. Runtime paths unchanged in Phase B.
  - Mapping: `prompt:simple` → `analyzer:core.pixsim/prompt-simple` (deterministic, reversible).
  - Only `analyzer_definitions` table gets the new column. Presets/analyses/instances unchanged.
  - Defined 4 rollout phases (A→D), test plan, risk controls, and feature flags.
  - Next coding slice defined: EP-01.1R (mapping helpers + DB column + response enrichment).
- Decisions:
  - EP-01 can be unblocked by following Phase B from the migration plan.
  - Legacy resolution (`resolve_legacy()`) happens before extension ID mapping — extension contract never sees raw legacy IDs.
- Risks/Blocks:
  - Plan needs review before EP-01.1R implementation begins.
- Next:
  - Review migration plan.
  - Execute EP-01.1R: mapping helpers, `extension_id` column, response enrichment.

### Update 2026-03-05 (c) — EP-01.1 reverted

- Progress:
  - Reverted all EP-01.1 changes: removed `resolve_analyzer_identity()` from `analyzer_preset_service.py`, removed 3 identity metadata fields from `AnalyzerPresetResponse`, removed identity resolution from `_build_preset_response` in `api/v1/analyzers.py`, deleted `test_analyzer_preset_identity_adapter.py`.
  - `shared/extension_contract.py` scaffold retained — it's correct for future use when IDs migrate.
- Decisions:
  - EP-01.1 identity adoption is **premature** for analyzer boundaries. Analyzer IDs use `<target>:<name>` format (`prompt:simple`, `asset:object-detection`) which is fundamentally different from the canonical extension format `<kind>:<scope>.<owner>/<name>`. Forcing `expected_kind="analyzer"` on IDs like `prompt:simple` produces meaningless synthetic keys (`analyzer:legacy.legacy/prompt:simple`). The registry already has its own `resolve_legacy()` map and `is_legacy` flag on `AnalyzerInfo` — the extension contract identity model doesn't map onto how analyzer IDs work today.
  - Identity adoption requires analyzer IDs to first migrate to canonical extension format. This is a prerequisite, not a parallel task.
  - EP-01 status changed to `blocked` pending analyzer ID format migration.
- Risks/Blocks:
  - No domain currently uses canonical extension IDs for analyzers. Identity adoption across any domain depends on at least one domain migrating first.
- Next:
  - Define analyzer ID migration plan (from `<target>:<name>` to `analyzer:<scope>.<owner>/<name>`).
  - Consider whether EP-01.2 (semantic packs) has the same format mismatch before attempting.

### Update 2026-03-05 (d) — EP-01.0 prompt published

- Progress:
  - Added corrected EP-01.0 Claude execution prompt focused on analyzer ID migration planning.
  - Updated tracker execution prompt link to EP-01.0.
- Decisions:
  - Keep EP-01 blocked until migration plan is authored and reviewed.
- Risks/Blocks:
  - Running the old EP-01.1 prompt will repeat reverted work.
- Next:
  - Execute EP-01.0 and produce `analyzer-id-format-migration-plan.md`.

### Update 2026-03-05 (b) — EP-01.1 attempted (subsequently reverted)

- Progress:
  - `resolve_analyzer_identity()` adapter added in `analyzer_preset_service.py`.
  - Adapter called in `create_preset` entry point.
  - `AnalyzerPresetResponse` gains optional `analyzer_identity_key`, `analyzer_identity_canonical`, `analyzer_identity_scope` fields.
  - `_build_preset_response` populates identity metadata for every response.
  - Focused tests added: `test_analyzer_preset_identity_adapter.py` (9 tests).
  - All 19 tests green (`test_extension_contract.py` + adapter tests).
- Decisions:
  - Identity parse is best-effort in response builder (never breaks response).
  - No DB schema change in this slice.
- Risks/Blocks:
  - Proxy-mode preset endpoints return upstream JSON as-is; identity metadata only appears when local service handles the request.
- Next:
  - EP-01.2: Identity adapter usage in semantic pack API/service boundaries.

### Update 2026-03-05

- Progress:
  - Added shared extension contract scaffold in backend.
  - Added tests for canonical/legacy parse and lifecycle helpers.
  - Added strategy handoff doc and this tracker.
  - Added EP-01.1 Claude execution prompt with acceptance criteria and test command.
- Decisions:
  - Start with identity-first migration.
- Risks/Blocks:
  - Existing codebase has many unrelated active edits; keep this lane isolated.
- Next:
  - Start EP-01.1 and EP-01.2 with small PR slices.
