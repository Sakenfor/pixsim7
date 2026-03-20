# Plans Registry and Governance

Plans are DB-first.

Source of truth is stored in backend tables (`Document`, `PlanRegistry`, `PlanDocument`) and managed through the Dev Plans API.
Filesystem `plan.md` and `manifest.yaml` bundles are intentionally removed to avoid DB-vs-file drift.

## Canonical APIs

- `GET /api/v1/dev/plans`
- `GET /api/v1/dev/plans/{plan_id}`
- `GET /api/v1/dev/plans/registry`
- `GET /api/v1/dev/plans/documents/{plan_id}`
- `PATCH /api/v1/dev/plans/update/{plan_id}`
- `POST /api/v1/dev/plans/progress/{plan_id}`
- `POST /api/v1/dev/plans`
- `GET /api/v1/dev/plans/settings`

## Runtime mode

- Keep `plansDbOnlyMode=true` (`GET /api/v1/dev/plans/settings`).
- In DB-only mode, filesystem manifest sync (`POST /api/v1/dev/plans/sync`) is disabled by design.

## Markdown rulebook

- Canonical guide for AI/human markdown process:
  - `docs/plans/active/md-governance-rulebook/companions/MD_RULEBOOK.md`

## Local folder usage

- `docs/plans/` stores governance docs, templates, and optional companion/handoff markdown assets.
- Do not re-introduce per-plan `plan.md` or `manifest.yaml` as authoritative plan state.
- If a plan needs markdown updates, patch the DB record through `PATCH /api/v1/dev/plans/update/{plan_id}` with full `markdown`.

## Legacy commands

`pnpm docs:plans:sync` and `pnpm docs:plans:check` still exist for legacy governance tooling, but they are not the source of truth for plans.
