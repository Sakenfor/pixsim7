# Ongoing Work Status

Last updated: 2026-03-10
Owner: active dev loop (chat + agents)
Status: active
Stage: rolling

## Purpose

Track the current in-progress lanes so work does not drift across sessions.
This file is operational status, not architecture spec.

## Active Lanes

| Lane | Status | Current Snapshot | Next Concrete Step |
| --- | --- | --- | --- |
| Scene planner panel | In progress | `scene-plan` panel scaffolding exists and can build a preview plan from behavior/action-selection inputs. | Wire one end-to-end happy path (world + NPCs -> request -> plan JSON -> trace/debug notes). |
| Frontend resolver registry consolidation | In progress | `apps/main/src/lib/resolvers/` now contains `resolverRegistry` plus domain resolver modules for game catalogs, sessions, saved projects, and block catalogs. Major read-path consumers were moved to resolver APIs with `consumerId` tracking. | Finish remaining read-path migrations (presence/runtime where suitable), then add lightweight resolver observability view in dev tools. |
| Project availability/debug package | In progress | `useProjectAvailability` is integrated in `ProjectPanel`, now backed by resolver-layer reads for worlds/saved projects/templates/primitives/content packs. | Add one compact "debug package" export/readout for reproducible checks. |
| Block primitives cutover finalization | In progress (high impact) | Core flow moved to primitives-first; remaining legacy cleanup is broad (migrations, ID policy, old model references). | Finish one focused cleanup slice at a time (IDs, migrations, docs, then model pruning). |
| Bananza seed + gameplay validation loop | In progress | Seed script modularized to `scripts/seeds/game/bananza/` package (data, flows/api, flows/direct, cli). Old `scripts/seed_bananza_boat_slice.py` kept as thin compatibility wrapper. | Stabilize one canonical test script: create/load project, seed minimum world/NPC behavior, run planner/generation checks. |

## Recent Completed Anchors

- `074dcfe0`: unified panel world context selection + dock visibility gating.
- `222dcb24`: fixed stale game-system doc paths after graph/feature migration.
- `c17d5b51`: docs cleanup (stale paths, action docs archival/status headers).
- `181f83ee`: HMR persistence for generation singletons/scope context.
- March 3, 2026 (current working tree): frontend resolver-layer rollout for game/project/block/session catalogs across panels/routes/stores.

## Working Rules

1. Keep commits lane-scoped (avoid mixed backend/frontend/docs commits).
2. Prefer one canonical path per feature, then archive legacy paths.
3. Update this file when a lane changes state or is split.

## Exit Criteria Per Lane

- Scene planner panel: one deterministic testable flow documented and runnable.
- Project availability/debug package: repeatable diagnostics output for any selected world/project.
- Block primitives cutover: no runtime dependency on legacy PromptBlock/ActionEngine paths.
- Bananza validation loop: reproducible setup path with minimal manual steps.

## Update Log

- 2026-03-10: Normalized plan metadata to template contract and added update-log governance section.
