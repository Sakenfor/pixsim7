# Markdown Rulebook (AI + Human)

Last updated: 2026-03-11  
Owner: docs-governance lane  
Canonical plan: `docs/plans/active/md-governance-rulebook/plan.md`

## Purpose

Define one shared way to create, update, and retire markdown docs so the repo keeps a single source of truth per topic and avoids drift.

## Audience

- Human contributors
- AI coding agents
- Reviewers approving documentation changes

## Hard Rules

1. One canonical doc per topic.
   - If a topic already has a canonical doc, update it instead of creating a parallel doc.
   - If a new doc is needed, link back to canonical from both directions.
2. Active implementation work must live in a plan bundle.
   - Use `docs/plans/active/<plan-id>/plan.md` + `manifest.yaml`.
   - Keep companions/handoffs inside the same plan folder when they are plan-scoped.
3. Generated artifacts are never hand-edited.
   - `docs/plans/registry.yaml` and the active index table in `docs/plans/README.md` must be produced via `pnpm docs:plans:sync`.
4. Plan metadata must stay current.
   - `Last updated`, `Owner`, `Status`, `Stage`, and `Update Log` are required in active plans.
5. Code changes that alter behavior must update docs in the same PR.
   - Minimum: update the owning plan `Update Log`.
   - If architecture or contracts changed, update the canonical architecture/reference doc too.
6. Deprecated docs must point forward.
   - Keep a short stub with "moved to" path instead of silent deletion, unless docs are pure generated output.
7. Do not use docs as unscoped scratchpads.
   - Use plan companions or handoff files with explicit ownership/scope.

## Doc Taxonomy

1. `Plan` (`docs/plans/active|done|parked/...`)
   - Execution tracking, ownership, phased checklist, update log.
2. `Companion` (`docs/plans/.../companions/*.md`)
   - Design details and rationale tied to one plan.
3. `Handoff` (`docs/plans/.../handoffs/*.md`)
   - Task prompts and execution packets for agents.
4. `Architecture` (`docs/architecture/*`)
   - Long-lived system shape and boundaries.
5. `Decision (ADR)` (`docs/decisions/*`)
   - Immutable decision record with date/context/tradeoffs.
6. `Reference/Guide` (`docs/reference/*`, `docs/guides/*`, domain READMEs)
   - How-to, API usage, operational runbooks.
7. `Archive` (`docs/archive/*`)
   - Historical snapshots, legacy tasks, non-canonical material.

## Canonicality Contract

- Every non-trivial topic should answer:
  - `What is the canonical doc?`
  - `Who owns it?`
  - `Where do implementation tasks live?`
- If two docs conflict:
  - Plan + ADR + code win over stale guide text.
  - Add a correction note in the stale file and link to canonical.

## Naming and Layout Rules

1. Plan IDs use lowercase kebab-case: `my-feature-roadmap`.
2. Plan bundle path is stable once published; avoid renaming after external references exist.
3. Companion names are concise, purpose-first, uppercase optional:
   - `MD_RULEBOOK.md`
   - `migration-notes.md`
4. Handoff names include date or iteration for traceability:
   - `handoff-2026-03-11-parser-lane.md`

## Required Workflow (AI + Human)

### A. Before Writing

1. Search for existing canonical docs in the same topic.
2. Decide if this is:
   - an existing plan update,
   - a new plan bundle,
   - a companion/handoff under an existing plan.
3. Declare owner and scope before adding content.

### B. While Writing

1. Keep scope explicit ("in scope / out of scope").
2. Use concrete file paths and stable terminology.
3. Record decisions and tradeoffs, not just task lists.
4. If you move docs, leave compatibility stubs.

### C. After Writing

1. Run:
   - `pnpm docs:plans:sync`
   - `pnpm docs:plans:check`
   - `STRICT_PLAN_DOCS=1 pnpm docs:plans:check`
2. Verify links from old paths (if moved) resolve to canonical paths.
3. Add/update `Update Log` entries in impacted active plans.

## PR Review Checklist (Docs)

- [ ] Canonical doc for the changed topic is clear.
- [ ] Plan metadata is complete and current.
- [ ] Registry/index were regenerated when manifests changed.
- [ ] No duplicate source-of-truth docs introduced.
- [ ] Moved docs have forward pointers.
- [ ] Update logs mention what changed and why.

## AI Agent Handoff Checklist

- Include:
  - target plan ID,
  - exact files to update,
  - expected metadata fields,
  - required validation commands,
  - "do not create parallel canonical doc" guardrail.
- Require final output to list touched files and validation results.

## Minimal Templates

### New Active Plan Bundle

1. Create `docs/plans/active/<plan-id>/`
2. Add:
   - `plan.md` from `docs/plans/TEMPLATE.md`
   - `manifest.yaml` from `docs/plans/MANIFEST_TEMPLATE.yaml`
3. Optional:
   - `companions/*.md`
   - `handoffs/*.md`

### Compatibility Stub (Old Path)

```md
# Moved

This document moved to: `docs/plans/active/<plan-id>/plan.md`.
Use the new path as canonical.
```

## Non-Goals

- This rulebook does not force immediate rewrite of all legacy docs.
- This rulebook does not replace ADRs or subsystem architecture docs.
- This rulebook does not mandate one writing style; it mandates structure and ownership.
