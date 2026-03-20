# DB-first Plans and Meta Contracts

Last updated: 2026-03-17
Owner: docs-governance lane
Scope: plan/doc governance and API contract discovery

## Why this exists

Plan state is DB-first. We no longer treat `docs/plans/**/plan.md` and `manifest.yaml` as canonical plan records.
This guide is the quick reference for the current API workflow.

## Source of truth

- Plan metadata and plan markdown live in backend tables (`Document`, `PlanRegistry`).
- Related companion/handoff docs are exposed via `PlanDocument`.
- Files under `docs/plans/` are governance/support docs, not authoritative plan records.

## Plan API surface

Base path: `/api/v1/dev/plans`

- List plans: `GET /api/v1/dev/plans`
- Get one plan (includes markdown): `GET /api/v1/dev/plans/{plan_id}`
- Update fields and/or markdown: `PATCH /api/v1/dev/plans/update/{plan_id}`
- Log checkpoint progress: `POST /api/v1/dev/plans/progress/{plan_id}`
- Create plan: `POST /api/v1/dev/plans`
- List plan documents: `GET /api/v1/dev/plans/documents/{plan_id}`
- Registry view (DB-backed): `GET /api/v1/dev/plans/registry`
- Activity feed: `GET /api/v1/dev/plans/activity`
- Runtime settings: `GET /api/v1/dev/plans/settings`

## DB-only runtime mode

- `plansDbOnlyMode` should remain `true`.
- When DB-only mode is enabled, filesystem sync (`POST /api/v1/dev/plans/sync`) is disabled by design.

## Meta contract discovery

Use the meta contract index to discover canonical API contracts for agent tooling and integrations:

- `GET /api/v1/meta/contracts`

This endpoint is the discoverability entrypoint for domains such as prompts, blocks, plans, notifications, codegen, UI catalog, and assistant surfaces.

## Recommended agent workflow

1. Discover contracts with `/api/v1/meta/contracts`.
2. Pull current plan context from `/api/v1/dev/plans` (and `/agent-context` when useful).
3. Apply updates through `/api/v1/dev/plans/update/{plan_id}` and `/progress/{plan_id}`.
4. Validate updates by re-reading `/api/v1/dev/plans/{plan_id}`.

## Legacy notes

- `pnpm docs:plans:sync` and `pnpm docs:plans:check` remain as legacy governance tools.
- They are not the canonical path for creating/updating plan records.
