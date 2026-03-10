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

## Layered Assembly Policy (Proposed Canon)

### Layer stack

1. `L0 - Safety/Hard constraints`
   - Rating/safety constraints and explicit forbid constraints.
2. `L1 - Context anchors`
   - World/location/POV/character identity and other non-negotiable scene anchors.
3. `L2 - Core composition`
   - Camera/shot/angle/focus/light/placement primitives that define the scene skeleton.
4. `L3 - Stateful modifiers`
   - Mood/interaction/tone directives derived from session and NPC relationship state.
5. `L4 - Optional style/prose overlays`
   - Prose descriptors and polish modifiers that can be dropped first under budget pressure.

### Prompt budget + priority policy

- Budget must be provider/model-aware, not hardcoded to one value.
- Source of truth for max chars should come from provider capability limits (for example `prompt_max_chars`), with conservative fallback.
- If a product surface uses a fixed cap (for example 5000 chars), apply the same priority/drop policy below.

Deterministic budget handling:

1. Reserve budget:
   - `L0 + L1`: must fit (hard floor, not dropped).
2. Allocate remaining budget by priority:
   - `L2` before `L3` before `L4`.
3. Overflow handling order:
   - Drop/trim `L4` first,
   - then trim `L3`,
   - keep `L2` unless impossible,
   - never violate `L0/L1` constraints.
4. Within each layer, trim by stable rank:
   - lower score / lower confidence / lower explicit priority is removed first.

Implementation target:

- Add an assembly budget pass in prompt composition so selection is deterministic and explainable in traces (`dropped_for_budget`, `trimmed_for_budget`).

### NPC/stat state policy layer

- Introduce a normalized policy packet before compile/resolve:
  - Inputs: relationship/intimacy stats, NPC personality flags, session/world context.
  - Outputs: desired tags, avoid tags, allowed rating band, intensity bounds, optional slot hints.
- Reuse existing social-context computation as upstream signal source where possible (avoid duplicate intimacy/rating mappings).
- Missing stats must degrade gracefully to neutral defaults (no hard fail).

Policy examples:

- Higher intimacy band can widen allowed mood/style ranges, but still bounded by rating policy.
- NPC personality traits can bias desired tags (for example assertive vs reserved) without hard-locking all slots.

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
- [ ] Implement budget-aware layered assembly pass with deterministic drop/trim tracing.
- [ ] Implement normalized NPC/state policy packet feeding resolver intent.

Exit criteria:

- Projection quality metrics improve while false positives stay bounded.
- Text and blocks flows share analysis cache/results instead of repeated requests.
- Budgeted assembly behavior is deterministic and traceable.
- NPC/state signals influence resolver intent through one canonical mapping path.

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
- 2026-03-10 (`uncommitted`): Added explicit layered assembly canon (L0-L4), budget/priority overflow policy, and NPC/stat policy-packet direction to avoid future hardcoded drift.
