# Plans Registry and Governance

This folder uses a manifest-driven bundle model so implementation plans, companions, and ownership metadata stay synchronized.

## Markdown Rulebook

- Canonical guide for AI/human markdown process:
  - `docs/plans/active/md-governance-rulebook/companions/MD_RULEBOOK.md`

## Active Plans

<!-- BEGIN:GENERATED_PLAN_INDEX -->
| Plan | Stage | Owner | Priority | Summary |
| ---- | ----- | ----- | -------- | ------- |
| [Markdown Governance and Rulebook](active/md-governance-rulebook/plan.md) | phase_0_bootstrap | docs-governance lane | high | Unified markdown plan + rulebook for AI/human doc authoring, ownership, and drift control. |
| [Ongoing Work Status](active/ongoing-work-status/plan.md) | rolling | active dev loop | high | Live status board tracking all active implementation lanes and next steps. |
| [App Map Graph](active/app-map-graph/plan.md) | execution | frontend/backend app-map lane |  | Dev-only AppMap panel with architecture dependency graph visualization. |
| [Bananza Project First Hardening](active/bananza-project-first-hardening/plan.md) | rollout | bananza seed/runtime lane |  | Seed data robustness and game runtime hardening for Bananza project. |
| [Block Primitives Evolution](active/block-primitives-evolution/plan.md) | phase_0_baseline | block-primitives lane |  | BlockPrimitive model, PromptBlock retirement, composition and migration paths. |
| [Contexthub Implementation](active/contexthub-implementation/plan.md) | packet_a_complete | contexthub lane |  | Project/world context inheritance across panels via ContextHub. |
| [Game Journey Flow Mapping](active/game-journey-flow-mapping/plan.md) | phase_7_complete | journey-map lane |  | Dynamic journey flow mapping for scene/character creation paths in AppMap. |
| [Mask Tool Capability Task List](active/mask-tool-capability-task-list/plan.md) | phase_4_complete_phase_5_pending | viewer-mask-tools lane |  | Viewer mask overlay tools — draw, import, presets, analyzer bridge. |
| [Mixed Legacy Areas Cleanup](active/mixed-legacy-areas-cleanup/plan.md) | proposed | architecture-cleanup lane |  | Identify and clean up mixed legacy code areas across the codebase. |
| [Non Admin Cue Pack Authoring](active/non-admin-cue-pack-authoring/plan.md) | implementation | prompt-pack authoring lane |  | User-facing cue pack creation and editing without admin privileges. |
| [Prompt Resolver Roadmap](active/prompt-resolver-roadmap/plan.md) | multi_iteration | prompt-resolver lane |  | Multi-iteration resolver workbench — parallel resolver, dev endpoints, tests. |
| [Prompt Template Controls](active/prompt-template-controls/plan.md) | backlog | template-controls lane |  | Slider/select controls on templates — SlotKey migration, theme modifier packs. |
| [Prompt Tool Module](active/prompt-tool-module/plan.md) | phase_3_complete_phase_4_pending | prompt-tool module lane |  | PromptComposer tools rail — catalog, execute, preset CRUD, review workflow. |
| [Pseudo 3d Checkpoint Navigation](active/pseudo-3d-checkpoint-navigation/plan.md) | phase_6_complete_rollout_pending | pseudo-3d navigation lane |  | Pseudo-3D room navigation using 2D checkpoint graphs, not real 3D meshes. |
<!-- END:GENERATED_PLAN_INDEX -->

## Plan bundle contract

Each plan is a folder (bundle) under one of:

- `docs/plans/active/<plan-id>/`
- `docs/plans/done/<plan-id>/`
- `docs/plans/parked/<plan-id>/`

Minimum bundle files:

- `plan.md` - canonical markdown plan content (use `docs/plans/TEMPLATE.md`).
- `manifest.yaml` - ownership/status metadata used to generate registry output.

Optional bundle files:

- `companions/*.md` - supporting design/rationale docs for the plan.
- `handoffs/*.md` - prompt handoffs scoped to the plan.

## Folder semantics

- `docs/plans/active/`
  - Execution plans that own current code lanes.
  - Bundle source of truth for active lane ownership.
  - Handoffs are colocated inside each plan bundle (`handoffs/` subfolder).
- `docs/plans/done/`
  - Completed plans kept for historical traceability.
  - Should not own active `code_paths`.
- `docs/plans/parked/`
  - Paused/deferred plans, intentionally not in active execution.
  - Keep context and restart notes; re-register/update before resuming.

## Move rules (`active` -> `done` -> `parked`)

- Move `active` -> `done` when:
  - planned exit criteria are met,
  - lane is no longer expected to drive near-term code changes.
- Move `active` -> `parked` when:
  - work is intentionally paused/deferred,
  - ownership should no longer trigger active drift expectations.
- Move `parked` -> `active` when restarting:
  - refresh metadata (`Status`, `Stage`, `Owner`, `Last updated`),
  - keep `manifest.yaml` current and run `docs:plans:sync`.

## Registry contract

`docs/plans/registry.yaml` is now a generated artifact for active plans.
Source of truth is each active bundle `manifest.yaml`.

Manifest required fields:

- `id`: stable identifier
- `title`: display title
- `status`: plan state (`active`, `done`, `parked`, ...)
- `stage`: current execution phase marker
- `owner`: owner lane/team
- `last_updated`: `YYYY-MM-DD`
- `plan_path`: plan markdown path (`./plan.md` recommended)
- `code_paths`: owned files/directories (scoped as tightly as practical)

Manifest optional fields:

- `priority`: `high` | `normal` | `low` (default `normal`) — controls index sort order
- `summary`: one-line description for the generated plan index
- `companions`: supporting docs paths
- `handoffs`: handoff prompt docs paths
- `tags`: classification tags
- `depends_on`: upstream plan IDs

Generated registry entries include:

- `id`: stable identifier
- `path`: markdown plan path under `docs/plans/...`
- `status`: plan state (`active`, `done`, `parked`, ...)
- `stage`: current execution phase marker
- `owner`: owner lane/team
- `last_updated`: `YYYY-MM-DD`
- `code_paths`: owned files/directories (scoped as tightly as practical)
- `priority`: plan urgency (`high`, `normal`, `low`)
- `summary`: one-line description

## Update log policy (per PR)

- Every active plan must have `## Update Log`.
- Any PR that touches a plan-owned lane should add at least one update-log line in impacted plans, or update bundle manifests when ownership changes.
- Log entries should be concise and dated (`YYYY-MM-DD`) with what changed (phase shift, scope change, guardrail, ownership, etc.).

## Commands

```bash
pnpm docs:plans:sync
pnpm docs:plans:check
```

`docs:plans:sync`:

1. Discovers active plan manifests.
2. Validates manifest contract and path existence.
3. Regenerates `docs/plans/registry.yaml` deterministically.
4. Regenerates the Active Plans index table in this README.

Checks:

1. Registry schema + duplicate IDs/paths.
2. Manifest-to-registry parity (registry must match generated manifest view).
3. Plan file existence + `code_paths` existence.
4. Plan metadata markers (`Last updated`, `Owner`, `Status`, `Stage`, `Update Log`).
5. Plan doc path references.
6. Code-to-plan drift (when `PLAN_BASE_SHA` and `PLAN_HEAD_SHA` are provided).

## Strict modes

- `STRICT_PLAN_DOCS=1`: strict metadata + path-reference checks together.
- `STRICT_PLAN_METADATA=1`: metadata warnings become errors.
- `STRICT_PLAN_PATH_REFS=1`: path-reference warnings become errors.

Example:

```bash
STRICT_PLAN_DOCS=1 pnpm docs:plans:check
```

Path-reference ignore configuration (for intentional pseudo paths/wildcards):

- file: `docs/plans/path-ref-ignores.txt` (one regex per line)
- env: `PLAN_PATH_REF_IGNORE_PATTERNS='^pattern1$,^pattern2$'`
- optional env file override: `PLAN_PATH_REF_IGNORE_FILE=docs/plans/path-ref-ignores.txt`

## Quick New-Plan Checklist

1. Create bundle folder `docs/plans/active/<plan-id>/`.
2. Copy `docs/plans/TEMPLATE.md` to `docs/plans/active/<plan-id>/plan.md`.
3. Copy `docs/plans/MANIFEST_TEMPLATE.yaml` to `docs/plans/active/<plan-id>/manifest.yaml` and fill fields.
4. Fill required plan metadata fields and initial `Update Log` entry.
5. Add optional bundle-local `companions/` and `handoffs/` as needed.
6. Run:
   - `pnpm docs:plans:sync`
   - `pnpm docs:plans:check`
   - `STRICT_PLAN_DOCS=1 pnpm docs:plans:check`
