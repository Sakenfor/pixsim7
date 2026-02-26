# Prompt Resolver Workbench Roadmap (Multi-Iteration Handoff)

## Purpose

This document is the **longer-term implementation roadmap** for the new prompt resolver architecture work (`next_v1`) and the `Prompt Resolver Workbench`.

It is intended for **iterative work by multiple coding agents** (including Claude) without requiring full context reload every time.

This roadmap complements:

- `docs/architecture/prompt-resolver-next-v1.md` (architecture/spec)

This file focuses on:

- current implementation status
- constraints/invariants
- next iterations (small PRs)
- acceptance criteria and validation
- handoff conventions

## Current Baseline (Implemented)

### Backend: resolver core (parallel, no legacy runtime integration yet)

Implemented under:

- `pixsim7/backend/main/services/prompt/block/resolution_core/`

Includes:

- neutral resolver request/result/trace types
- resolver interface
- registry
- `next_v1` resolver (hard constraints + soft scoring + trace)
- legacy slot-results adapter helper (normalization only)

Test:

- `pixsim7/backend/main/tests/services/prompt/test_resolution_core.py`

### Backend: workbench dev endpoints (implemented)

In:

- `pixsim7/backend/main/api/v1/block_templates.py`

Implemented endpoints:

- `POST /api/v1/block-templates/dev/resolver-workbench/resolve`
  - accepts a generic `ResolutionRequest`-like payload
  - runs Python `next_v1`
  - returns `ResolutionResult` JSON

- `POST /api/v1/block-templates/dev/resolver-workbench/compile-template`
  - compiles a real block template (`slug` or `template_id`)
  - resolves lazy controls
  - applies control effects to slots
  - fetches candidates per slot (limited)
  - emits a `ResolutionRequest` JSON for workbench experimentation

### Frontend: Prompt Resolver Workbench panel (implemented)

In:

- `apps/main/src/features/promptResolverWorkbench/*`
- `apps/main/src/features/panels/domain/definitions/prompt-resolver-workbench/index.ts`

Current features:

- fixture picker (5 fixtures: police allure, tribal theme, forbid-pair fashion/accessory, scene+lighting+atmosphere with `requires_other_selected`, editorial mood scoring-only)
- request JSON editor
- backend-backed `Run next_v1`
- result viewer
- trace viewer
- snapshot JSON import/export
- compile real template by slug → request
- `control_values` JSON textarea wired to `compile-template` (with inline parse error)
- localStorage saved snapshots: save/load/delete with name + timestamp

Important: resolver execution is **backend-backed** (Python), not a frontend TS mirror.

### Backend: workbench endpoint tests (implemented)

In:

- `pixsim7/backend/main/tests/api/test_resolver_workbench_endpoints.py`

Covers:
- `resolve`: result shape, desired-tag scoring, trace events, `forbid_tag` constraint, invalid resolver_id → 400
- `compile-template`: no slug/id → 400, both → 400, slug not found → 404

## Invariants / Guardrails

These should be preserved unless explicitly changing architecture.

1. Do not break legacy template roll runtime

- Do not alter `template_service.py` production roll behavior as part of workbench iterations.
- Resolver workbench is a parallel experimentation path.

2. Keep dev endpoints additive

- `resolve` / `compile-template` are dev/tooling endpoints.
- They should not change normal template API semantics.

3. Keep `ResolutionRequest/Result/Trace` stable-ish

- Evolve versioned fields deliberately.
- Prefer additive changes over breaking renames.

4. Keep UI/Workbench generic

- Avoid hardcoding police/tribal semantics into shared workbench UI.
- Template-specific behavior belongs in fixtures or compiler mapping, not panel layout.

5. No “temporary duplication” of core resolver logic in frontend

- Resolver execution should stay backend/Python.
- Frontend should only display/submit payloads and render traces.

## Non-Goals (for now)

- Replacing current template roll path with `next_v1`
- Full parity between legacy and `next_v1`
- Tailoring `next_v1` behavior to match or beat `legacy_v1` (wrong north star)
- New content schema rewrite
- Graph/board UI for resolver workbench

## Track Separation

Two distinct tracks with different purposes. Do not conflate them.

### `next_v1` Development Track

Goal: build `next_v1` as a credible different approach on its own merits.
**Not** "does it match legacy?" — that is migration instrumentation, not development direction.

### Migration Confidence Track

Goal: when `next_v1` is mature enough to consider for production, provide tooling
to compare outputs and build confidence in the switch.
Deferred until `next_v1` development track is meaningfully ahead.

## Near-Term Workstreams

### Track 1: Compiler Enrichment — `template → ResolutionRequest` (HIGHEST PRIORITY)

`next_v1` is currently underfed. The engine has capabilities/constraints/features machinery
but compiled requests from real templates carry mostly tags + minimal constraints.
This is the biggest bottleneck for `next_v1` development.

Examples:

- populate `required_capabilities_by_target` reliably from slot category/role
- infer typed `features` from slot/block metadata
- emit proper hard constraints from slot tag constraints (already partial — improve coverage)
- carry slot debug provenance into target metadata
- map control effects explicitly into intent (desired tags / avoid tags per target)

Files:

- `pixsim7/backend/main/api/v1/block_templates.py` (`_compile_template_to_resolution_request`)
- `pixsim7/backend/main/tests/api/test_resolver_workbench_endpoints.py`

### Track 2: `next_v1` Relational Scoring (FIRST REAL DIFFERENTIATOR)

This is where `next_v1` stops being "per-slot weighted selection with extra ceremony."
Even one meaningful cross-target scoring mechanism proves the architecture.
Prerequisite: compiler enrichment should be in reasonable shape first.

Examples:

- pairwise compatibility bonus: score boost when two selected blocks are known-compatible
  (not just hard `forbid_pair` — a soft preference signal between targets)
- target ordering policies: resolve high-constraint targets first to unblock dependent targets
- seeded tie-breaking: deterministic selection under equal scores
- capability-aware score bonuses (not just capability filtering)

Files:

- `pixsim7/backend/main/services/prompt/block/resolution_core/next_v1_resolver.py`
- `pixsim7/backend/main/services/prompt/block/resolution_core/types.py` (additive only)
- `pixsim7/backend/main/tests/services/prompt/test_resolution_core.py`

### Track 3: Trace Usability (PRACTICAL NECESSITY)

Once cross-target events increase, raw trace becomes noisy quickly.
Small UI work, high leverage for debugging `next_v1` behavior.

Examples:

- trace filter by event kind (`constraint_failed`, `candidate_scored`, `selected`, ...)
- trace filter by target key
- candidate/result tables with quick collapse

Done:
- ~~control overrides JSON editor for `compile-template`~~ ✓
- ~~localStorage saved snapshots (named snapshots list)~~ ✓

Files:

- `apps/main/src/features/promptResolverWorkbench/*`

### Track 4: Dev Endpoint Tests + Validation

Done:
- ~~test `resolve` returns trace/result for fixture payload~~ ✓
- ~~test error cases (unknown resolver, missing template, invalid body)~~ ✓

Remaining:
- test `compile-template` returns valid shape for a real known template (requires DB fixture/factory)
- test that `control_values` affects compiled request shape

Files:

- `pixsim7/backend/main/tests/api/test_resolver_workbench_endpoints.py`

### Track 5: Migration Confidence (DEFERRED — migration instrumentation, not resolver development)

Defer until `next_v1` development tracks are meaningfully ahead.
Purpose: sanity-check production migration, not develop the resolver.

Examples:

- `/dev/resolver-workbench/roll-legacy` endpoint: run legacy template roll, normalize via
  `adapt_legacy_slot_results()`, return `ResolutionResult` for side-by-side inspection
- workbench comparison mode: run both resolvers on same compiled request, diff selected blocks
- diff tooling: highlight divergences between `legacy_v1` and `next_v1` outputs

Files:

- `pixsim7/backend/main/api/v1/block_templates.py`
- `apps/main/src/features/promptResolverWorkbench/*`

## Iteration Plan (Small PRs)

Each item should be shippable and reviewable.
Ordered by track priority: compiler enrichment → relational scoring → trace usability → migration (last).

### ~~Iteration 1~~: Workbench control overrides + endpoint tests ✓ DONE

Delivered:

- `control_values` JSON textarea in sidebar, wired to `compile-template`
- 8 backend tests covering `resolve` (shape, scoring, constraints, 400) and `compile-template` (400/404 validation)
- 3 new fixtures including `forbid_pair` and `requires_other_selected` cases

### ~~Iteration 2~~ (partial): Saved snapshots ✓ DONE / trace filters REMAINING

Done:
- ~~save/load/delete named snapshots (localStorage)~~ ✓

Remaining:
- trace filter by event kind / target key

Acceptance criteria:
- trace list can be narrowed without mutating result data

### Iteration 3 (RECOMMENDED NEXT): Compiler enrichment

Track 1. Highest priority for `next_v1` development — the engine is underfed without this.

Scope:
- populate `required_capabilities_by_target` reliably from slot category and role
- emit typed `features` from at least slot-level metadata (even if sparse initially)
- improve hard constraint generation from slot tag constraints
- carry slot index, strategy, optional flag into target metadata

Acceptance criteria:
- compiled request from a real template has non-empty `required_capabilities_by_target`
- hard constraints reflect slot tag requirements without manual fixture authoring
- existing workbench runs are not broken

Validation:
- `python -m py_compile pixsim7/backend/main/api/v1/block_templates.py`
- `pnpm -C apps/main exec tsc --noEmit`
- targeted pytest for endpoint tests + resolution_core tests

### Iteration 4: `next_v1` relational scoring

Track 2. First real differentiator — prerequisite: Iteration 3 done so compiler gives `next_v1` real signal.

Scope:
- implement pairwise compatibility bonus: soft score boost between compatible selected blocks
- implement deterministic seeded tie-breaking
- optionally: target ordering policy (high-constraint targets resolved first)
- all behavior observable in trace

Acceptance criteria:
- trace shows cross-target scoring events
- same seed produces same result deterministically
- behavior differs meaningfully from per-slot independent selection

### Iteration 5: Trace filters

Track 3. Becomes necessary once relational scoring adds trace noise.

Scope:
- filter trace event list by kind (multi-select)
- filter by target key
- no backend changes

Acceptance criteria:
- filtered trace does not mutate underlying result data
- filter state resets on new run

### Iteration 6: Migration confidence tooling (DEFERRED)

Track 5. Only useful after `next_v1` is meaningfully ahead.
Purpose: production migration sanity check, not resolver development.

Scope:
- `/dev/resolver-workbench/roll-legacy`: run legacy template roll, normalize via `adapt_legacy_slot_results()`
- workbench side-by-side comparison mode
- diff highlight on divergent selections

Acceptance criteria:
- legacy roll normalized result visible in workbench alongside `next_v1` result
- no changes to legacy template roll runtime behavior

## Handoff Template (for Claude / another worker)

When handing off, provide:

1. What branch/worktree to use
2. Exact scope (files to touch / avoid)
3. Which iteration item(s) from this roadmap
4. Validation commands
5. Deliverable format

Minimal handoff snippet:

```txt
Continue Prompt Resolver Workbench work using `docs/architecture/prompt-resolver-workbench-roadmap.md`.

Target iteration:
- Iteration N: <name>

Constraints:
- Do not touch legacy template roll runtime (`template_service.py`)
- Keep changes scoped to workbench + dev endpoints/tests

Validation:
- pnpm -C apps/main exec tsc --noEmit
- python -m py_compile pixsim7/backend/main/api/v1/block_templates.py
- targeted pytest for touched tests
```

## File Map (Hotspots)

### Backend (hot)

- `pixsim7/backend/main/api/v1/block_templates.py`
- `pixsim7/backend/main/services/prompt/block/resolution_core/types.py`
- `pixsim7/backend/main/services/prompt/block/resolution_core/next_v1_resolver.py`
- `pixsim7/backend/main/services/prompt/block/resolution_core/registry.py`

### Backend tests

- `pixsim7/backend/main/tests/services/prompt/test_resolution_core.py`
- add endpoint tests in a nearby API test module (preferred) or new targeted test file

### Frontend (hot)

- `apps/main/src/features/promptResolverWorkbench/PromptResolverWorkbenchPanel.tsx`
- `apps/main/src/features/promptResolverWorkbench/api.ts`
- `apps/main/src/features/promptResolverWorkbench/fixtures.ts`
- `apps/main/src/features/promptResolverWorkbench/snapshot.ts`
- `apps/main/src/features/promptResolverWorkbench/savedSnapshots.ts`
- `apps/main/src/features/panels/domain/definitions/prompt-resolver-workbench/index.ts`

## Known Limitations (Current)

1. `compile-template` compiler is intentionally minimal

- It maps slots/candidates/preferences/constraints enough for experimentation
- It does not yet fully model all template semantics

2. Workbench does not yet support legacy comparison mode

- Only `next_v1` is executable in-panel right now

3. No stable resolver schema version negotiation yet

- Snapshot schema is versioned (workbench-side), but resolver payload schema evolution is still ad hoc

## When To Revisit Architecture (Trigger Points)

Revisit `prompt-resolver-next-v1.md` and potentially refine core interfaces if:

- `ResolutionRequest` starts accumulating template-specific fields
- workbench needs repeated payload normalization hacks
- more than one resolver implementation exists and traces are not comparable
- compiler enrichments require major type changes

## Nice-to-Have (Later, not urgent)

- visual diff of two `ResolutionResult` traces
- import template + immediate compile/run in one click
- save/share snapshot files under `docs/fixtures/` or `test_artifacts`
- compare multiple seeds
- trace search by block id / target / event kind

