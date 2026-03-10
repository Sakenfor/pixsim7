# Markdown Governance and Rulebook Plan

Last updated: 2026-03-11
Owner: docs-governance lane
Status: active
Stage: phase_0_bootstrap

## Goal

Create one practical, enforceable markdown governance system so humans and AI agents produce docs that are consistent, discoverable, and low-drift across plans, architecture notes, and handoff docs.

## Scope

- In scope:
  - Define a rulebook for markdown authoring and maintenance.
  - Formalize doc taxonomy and canonical/source-of-truth rules.
  - Add execution workflow for AI/human contributors (create, update, retire).
  - Add lightweight review checklist that pairs with existing `docs:plans:*` commands.
- Out of scope:
  - Large-scale migration of all legacy docs in one pass.
  - Rewriting historical archive content except for link/ownership correction.
  - New runtime features unrelated to documentation governance.

## Current Baseline

- Relevant files/endpoints/services:
  - `docs/plans/README.md`
  - `docs/plans/TEMPLATE.md`
  - `docs/plans/MANIFEST_TEMPLATE.yaml`
  - `docs/plans/registry.yaml`
  - `scripts/sync_plan_registry.ts`
  - `scripts/check_plan_registry.ts`
  - `docs/architecture/README.md`
  - `docs/decisions/README.md`

## Decisions Already Settled

- Active implementation lanes are governed by plan bundles under `docs/plans/active/<plan-id>/`.
- `docs/plans/registry.yaml` and the active index in `docs/plans/README.md` are generated outputs.
- A plan can have local companions and handoffs; those should live next to the plan bundle.

## Delivery Phases

### Phase 0: Bootstrap Rulebook

- [x] Create an active plan bundle for markdown governance.
- [x] Add a companion rulebook with explicit authoring rules for AI/humans.
- [ ] Link the rulebook from primary docs navigation.

Exit criteria:

- Rulebook exists and is discoverable from the plan bundle.
- Rulebook includes taxonomy, lifecycle, metadata, and update checklist.

### Phase 1: Classification and Ownership Pass

- [ ] Classify top-priority docs into: canonical, companion, reference, archive.
- [ ] Add or correct ownership and "last updated" metadata on high-churn docs.
- [ ] Open migration tasks for stale/duplicated canonical docs.

Exit criteria:

- High-churn areas have one declared canonical doc per topic.
- Duplicate "source-of-truth" docs are either archived or explicitly demoted.

### Phase 2: Tooling and Guardrails

- [ ] Extend `docs:plans:check` with optional rulebook validation mode.
- [ ] Add lint checks for broken companion/handoff links.
- [ ] Add warning checks for missing minimal metadata on canonical docs.

Exit criteria:

- CI can fail early on structural docs drift.
- Rulebook checks can run locally without custom setup.

### Phase 3: Adoption and PR Discipline

- [ ] Add PR checklist snippet for docs update requirements.
- [ ] Require update-log entries on plan-owned lane changes.
- [ ] Add "docs touched" receipt guidance for AI handoff prompts.

Exit criteria:

- Teams consistently update docs in the same PR as behavior/code changes.
- AI agent handoffs include explicit doc update expectations.

## Risks

- Risk: Rulebook is too broad and contributors ignore it.
  - Mitigation: keep hard rules short, actionable, and validated by tooling where possible.
- Risk: Existing legacy docs continue to drift because migration is delayed.
  - Mitigation: prioritize high-churn topics and enforce canonical pointers first.
- Risk: AI-generated docs become noisy or repetitive.
  - Mitigation: require concise templates and canonical-link checks.

## Update Log

- 2026-03-11 (`uncommitted`): Created markdown governance plan and companion rulebook skeleton.
