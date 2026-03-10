# Block Primitives Evolution

Last updated: 2026-03-10
Owner: block-primitives lane
Status: active
Stage: phase_0_baseline

## Goal

Own the canonical execution plan for the block-primitives system so CUE pack authoring, compiler/resolver composition, and runtime consumers evolve on one track without legacy drift.

## Scope

- In scope:
  - Primitive contract canon (`block_id`, category/tags/capabilities, `op` metadata, descriptor overlays).
  - CUE authoring and generated schema pipeline for prompt packs.
  - Template/runtime resolution alignment (`compiler_v1 -> next_v1`).
  - Legacy surface retirement where action-block naming or paths still shadow primitive canon.
  - Parser projection quality and primitive-mode consumer convergence.
- Out of scope:
  - Analyzer architecture work.
  - New generation UX modules that do not consume primitive contracts.
  - Full marketplace/discovery strategy for user-authored packs.

## Current Baseline

- Canonical prompt building source is `BlockPrimitive` plus schema packs.
- Core packs are authored in CUE:
  - `tools/cue/prompt_packs/*`
- Runtime-emitted pack schemas are generated into:
  - `pixsim7/backend/main/content_packs/prompt/*/schema.yaml`
- Template and runtime composition paths are compiler/resolver based:
  - `compiler_v1 -> next_v1`
- Resolver workbench dev flow exists and is backend-backed:
  - `pixsim7/backend/main/api/v1/block_templates/routes_templates.py`
  - `apps/main/src/features/promptResolverWorkbench`
- Supporting architecture references:
  - `docs/architecture/block-primitives-evolution.md` (deep context + historical rationale)
  - `docs/architecture/reviews/block-primitives-snapshot-2026-03-10.md` (point-in-time drift snapshot)

## Decisions Already Settled

- CUE is the write-path source of truth for core system packs.
- Emitted `schema.yaml` files are runtime artifacts, not canonical authoring surfaces.
- `op` metadata is canonical for operational primitives (`op_id[_template]`, `signature_id`, `modalities`, `refs`, `params`, `default_args`).
- Direction is a separate reusable primitive family (not embedded in camera as a taxonomy root).
- Backward-compatibility adapters can exist, but new canonical contracts should not be designed around them.

## Delivery Phases

### Phase 0: Canonical Plan Adoption

- [ ] Keep this file as the canonical active plan for primitive architecture.
- [ ] Ensure derivative docs/handoffs link back to this plan.
- [ ] Keep registry ownership paths aligned with actual touched code.

Exit criteria:

- New primitive tasks reference this plan as source of truth.
- Plan metadata and ownership remain current across PRs.

### Phase 1: Contract Hardening

- [ ] Enforce CUE -> schema generation workflow for pack changes.
- [ ] Complete and verify op-signature coverage in core packs.
- [ ] Extend tests around op ingestion, capability stamping, and ref capability tags.
- [ ] Finalize canonical handling for prose/descriptors without introducing parallel contracts.

Exit criteria:

- Core packs compile cleanly from CUE and pass contract checks.
- Op metadata is stable/queryable across generated outputs.

### Phase 2: Consumer Convergence

- [ ] Improve primitive projection recall (direction/placement vocab expansion + eval reruns).
- [ ] Remove duplicate prompt-analysis calls across shadow mode and block-seeding paths.
- [ ] Keep a single adapter boundary for primitive refs and downstream resolvers.
- [ ] Add/finish dev tooling surface for primitive interaction debugging.

Exit criteria:

- Projection quality metrics improve while false positives stay bounded.
- Text and blocks flows share analysis cache/results instead of repeated requests.

### Phase 3: Legacy Retirement

- [ ] Remove or quarantine dead narrative legacy files after callsite verification.
- [ ] Remove stale frontend `/action-blocks` clients if no active consumers remain.
- [ ] Clean naming drift where primitive IDs still use `action_block_*` fields/labels.
- [ ] Update docs/API references to primitives-first canon only.

Exit criteria:

- No active runtime path depends on legacy selector-era action-block stack.
- Naming/docs no longer imply multiple canonical primitive systems.

## Risks

- Risk: generated schemas become hand-edited and drift from CUE.
  - Mitigation: enforce generation check path and keep CUE as sole authoring source.
- Risk: legacy and canonical runtime paths evolve in parallel.
  - Mitigation: require explicit owner approval before any new legacy-path feature work.
- Risk: parser projection stays too conservative for primitive vocabulary.
  - Mitigation: iterate with eval corpus + shadow guard metrics; tune stop-tokens and variant discrimination.
- Risk: naming drift slows onboarding and cleanup.
  - Mitigation: codify naming policy and migrate in targeted slices.

## Update Log

- 2026-03-10 (`uncommitted`): Promoted block-primitives evolution to canonical active plan; snapshot moved to supporting architecture review doc.
- 2026-03-10 (`uncommitted`): Hardened op-signature contract enforcement (`requires_variant_template`) and added prompt-service + content-pack loader tests for signature template/prefix/modality guards.
