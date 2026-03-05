# Bananza Seed Refocus Task (Claude Handoff)

Status: Done
Owner: Claude (separate chat)  
Scope: `scripts/seeds/game/bananza/*` + related block pack wiring

## Goal
Keep Bananza seed deterministic and idempotent, but stop using seed scripts as the source of reusable primitive/template definitions.

## Problem Summary
Current Bananza seed flow does two different jobs:

1. Good seed behavior:
- creates/updates demo world entities (locations, NPCs, schedules, behavior)
- saves project snapshots with demo provenance
- supports deterministic reruns

2. Undesired content-authoring behavior:
- upserts primitive definitions from `PRIMITIVE_SEEDS`
- upserts generation template definitions from `GENERATION_TEMPLATE_SEEDS`

This makes seed scripts a second content-authority path.

## Target Behavior

1. Seed remains responsible for demo state bootstrap.
2. Primitive/template definitions are sourced from packs (schema/content files), not hardcoded seed arrays.
3. Seed only references block/template IDs and validates availability.
4. Snapshot provenance stays `demo` for Bananza.

## Out Of Scope

- No analyzer changes.
- No role kernel changes.
- No UI redesign.
- No migration of unrelated demos.

## Tasks (Ordered)

### 1) Introduce Bananza content pack authority

Create/confirm a Bananza-specific content pack source for:
- Bananza primitives (non-core IDs like `bananza.*`, `genre.*` if demo-specific)
- Bananza scaffold templates currently in seed arrays

Rules:
- Core-generic blocks belong in `core_*` packs, not Bananza pack.
- Bananza pack owns demo-specific IDs only.

### 2) Refactor seed data to references-only

In `scripts/seeds/game/bananza/seed_data/__init__.py`:
- Replace inline primitive payload definitions with reference lists (IDs).
- Replace inline template payload definitions with reference slugs/IDs where possible.
- Keep world/NPC/schedule/behavior seed constants.

### 3) Update seed flows

Files:
- `scripts/seeds/game/bananza/flows/api_flow.py`
- `scripts/seeds/game/bananza/flows/direct_flow.py`

Changes:
- Remove primitive/template authoring upsert logic.
- Add “ensure content loaded” checks:
  - verify required block IDs exist
  - verify required template slugs exist
- Fail seed with actionable errors if required content is missing.

### 4) Keep snapshot semantics, tighten provenance

Keep existing project snapshot save path but ensure:
- provenance remains explicit demo provenance
- dedupe logic remains deterministic and idempotent
- no hidden mutation of content definitions during seed run

### 5) Add tests + smoke checks

Add/adjust tests so rerun behavior is stable and content authority is enforced.

Minimum checks:
- Seed rerun does not create duplicate demo projects unexpectedly.
- Seed fails fast when required block/template refs are missing.
- Seed no longer writes primitive/template definitions directly.

## Acceptance Criteria

Done when all are true:

1. Bananza seed no longer contains inline reusable primitive definitions.
2. Bananza seed no longer upserts template definition payloads from seed arrays.
3. Bananza seed still fully boots demo world state deterministically.
4. Saved snapshots keep demo provenance and dedupe behavior.
5. Required block/template refs are validated before seed completion.

## Suggested PR Slices

1. PR-A: Bananza pack/content authority setup
2. PR-B: Seed data ref conversion + flow refactor
3. PR-C: Tests + docs update

## Operator Notes

If seed fails due to missing content refs:
- load/reload content packs first
- rerun seed
- do not reintroduce inline seed payload authoring as a quick fix
