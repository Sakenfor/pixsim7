# Block Primitives Snapshot (2026-03-10)

Last updated: 2026-03-10
Owner: block-primitives lane
Status: supporting snapshot
Stage: point_in_time

## Goal

Keep one canonical execution plan for block primitives so architecture, APIs, and pack authoring do not drift while we continue CUE-first evolution and legacy cleanup.

## Scope

- In scope:
  - Canonical block primitive contracts (`block_id`, category/tags/capabilities, `op` metadata).
  - CUE source-of-truth flow (`tools/cue/prompt_packs`) and generated pack schemas.
  - Compiler/resolver integration points for template/runtime composition.
  - Drift checks for remaining legacy action-block surfaces.
- Out of scope:
  - Analyzer service architecture work.
  - Game flow UX redesign unrelated to primitive contracts.
  - Full marketplace/discovery for user-authored packs.

## Current Baseline

- Canonical source for prompt building blocks is `BlockPrimitive` + schema packs.
- Core packs are authored in CUE and emitted into backend content packs:
  - `tools/cue/prompt_packs/*`
  - `pixsim7/backend/main/content_packs/prompt/*/schema.yaml`
- Template roll/runtime path is compiler+resolver based:
  - `compiler_v1 -> next_v1`
- Resolver workbench dev endpoints exist for compile/resolve and inline roll diagnostics:
  - `pixsim7/backend/main/api/v1/block_templates/routes_templates.py`
- PromptBlock/action-block naming still appears in mixed legacy surfaces in narrative/runtime lanes.

### Drift Check Matrix (2026-03-10)

| Area | Canonical Direction | Drift Risk |
| --- | --- | --- |
| Pack authoring | CUE source (`tools/cue/prompt_packs`) | Manual edits directly in emitted `schema.yaml` |
| Block IDs | Namespaced string IDs (`<namespace>.<name>`) | Legacy IDs/aliases creeping back into new writes |
| Runtime selection | compiler/resolver path (`compiler_v1 -> next_v1`) | Parallel legacy generator path in narrative actions |
| Vocabulary projection | Primitive-aware parser shadow/eval | Generic stop-token filtering causing under-match |
| Naming | `block primitive` / `composition_role` | New code using `action_block*` naming for primitive IDs |

## Decisions Already Settled

- CUE is the source of truth for core system packs; emitted YAML is runtime artifact, not authoring source.
- `op` contract is canonical for operational primitives (`op_id[_template]`, `signature_id`, `modalities`, `refs`, `params`, `default_args`).
- Direction is separated from camera as its own reusable primitive family.
- Template/runtime resolution continues to converge on compiler+resolver architecture rather than selector-era paths.
- Backward compatibility is allowed where needed, but should not define new canonical interfaces.

## Delivery Phases

### Phase 0: Snapshot Lock + Ownership

- [ ] Keep this document as the single active snapshot for primitive architecture and drift checks.
- [ ] Keep plan registry ownership paths aligned with real code lanes.
- [ ] Link all new primitive-related plans/handoffs back to this file.

Exit criteria:

- New primitive work references this doc as canonical plan.
- Drift matrix reflects current reality (updated at least once per active sprint cycle).

### Phase 1: Contract Hardening

- [ ] Enforce CUE->schema consistency in contributor workflow (`pnpm prompt-packs:gen` before merge on pack changes).
- [ ] Finish/verify op signature coverage for current core packs.
- [ ] Add/maintain tests for schema-op ingestion and capability/ref stamping.
- [ ] Define canonical treatment for prose/descriptor overlays in schema contract (no ad-hoc forks).

Exit criteria:

- Core packs compile cleanly from CUE and pass contract tests.
- `op` metadata is queryable and stable across emitted packs.

### Phase 2: Consumer Convergence

- [ ] Improve primitive projection quality (direction/placement synonym coverage and eval reruns).
- [ ] Reuse prompt analysis results across shadow mode and block seeding paths (avoid duplicate API calls).
- [ ] Add a primitive interaction/dev panel path for easier visual debugging of block interactions.
- [ ] Finalize primitive ref binding approach and adapter boundaries.

Exit criteria:

- Primitive projection quality metrics are tracked and improving.
- Text mode and blocks mode share analysis data path instead of re-fetching independently.

### Phase 3: Legacy Surface Retirement

- [ ] Remove or isolate dead/unused narrative legacy files after callsite verification.
- [ ] Eliminate stale frontend `/action-blocks` clients if no active consumers remain.
- [ ] Clean docs and API listings to reflect primitives-first canon.
- [ ] Complete naming cleanup where primitive IDs still flow through `action_block_*` labels.

Exit criteria:

- No active runtime path depends on selector-era action-block stack.
- Docs and code naming no longer suggest multiple canonical block systems.

## Risks

- Risk: Emitted schemas diverge from CUE and silently become hand-edited truth.
  - Mitigation: treat CUE as write-path only and gate pack changes with generation checks.
- Risk: Legacy and new runtime paths both evolve, causing behavior split.
  - Mitigation: require explicit owner decision before any legacy path feature work.
- Risk: Naming drift (`action_block` vs `primitive`) slows cleanup and onboarding.
  - Mitigation: codify naming policy and migrate identifiers in focused slices.
- Risk: Projection logic remains too conservative and under-matches primitives.
  - Mitigation: keep eval corpus + shadow guard metrics and iterate synonym/penalty scoring deliberately.

## Update Log

- 2026-03-10 (`uncommitted`): Created canonical block-primitives snapshot + drift-check plan and registered ownership lane.
