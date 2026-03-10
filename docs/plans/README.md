# Plans Registry and Governance

This folder uses a registry-driven governance model so implementation and planning docs stay synchronized.

## Folder semantics

- `docs/plans/active/`
  - Execution plans that own current code lanes.
  - Must follow `docs/plans/TEMPLATE.md` metadata contract.
  - Must be listed in `docs/plans/registry.yaml`.
- `docs/plans/active/handoffs/`
  - Prompt-only handoff docs for other agents.
  - Not canonical plans and not required in `registry.yaml`.
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
  - restore/update `registry.yaml` entry and `code_paths`.

## Registry contract

`docs/plans/registry.yaml` is the canonical ownership map. Each plan entry must include:

- `id`: stable identifier
- `path`: markdown plan path under `docs/plans/...`
- `status`: plan state (`active`, `done`, `parked`, ...)
- `stage`: current execution phase marker
- `owner`: owner lane/team
- `last_updated`: `YYYY-MM-DD`
- `code_paths`: owned files/directories (scoped as tightly as practical)

## Update log policy (per PR)

- Every active plan must have `## Update Log`.
- Any PR that touches a plan-owned lane should add at least one update-log line in impacted plans, or update `registry.yaml` when ownership changes.
- Log entries should be concise and dated (`YYYY-MM-DD`) with what changed (phase shift, scope change, guardrail, ownership, etc.).

## Commands

```bash
pnpm docs:plans:check
```

Checks:

1. Registry schema + duplicate IDs/paths.
2. Plan file existence + `code_paths` existence.
3. Plan metadata markers (`Last updated`, `Owner`, `Status`, `Stage`, `Update Log`).
4. Plan doc path references.
5. Code-to-plan drift (when `PLAN_BASE_SHA` and `PLAN_HEAD_SHA` are provided).

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

1. Copy `docs/plans/TEMPLATE.md` into `docs/plans/active/<plan>.md`.
2. Fill required metadata fields and initial `Update Log` entry.
3. Scope delivery phases and explicit out-of-scope.
4. Add/update registry entry with scoped `code_paths`.
5. Place prompt-only handoff docs (if any) under `docs/plans/active/handoffs/`.
6. Run:
   - `pnpm docs:plans:check`
   - `STRICT_PLAN_DOCS=1 pnpm docs:plans:check`
