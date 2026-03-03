# Ongoing Work Status

Last updated: March 3, 2026
Owner: active dev loop (chat + agents)

## Purpose

Track the current in-progress lanes so work does not drift across sessions.
This file is operational status, not architecture spec.

## Active Lanes

| Lane | Status | Current Snapshot | Next Concrete Step |
| --- | --- | --- | --- |
| Scene planner panel | In progress | `scene-plan` panel scaffolding exists and can build a preview plan from behavior/action-selection inputs. | Wire one end-to-end happy path (world + NPCs -> request -> plan JSON -> trace/debug notes). |
| Project availability/debug package | In progress | `useProjectAvailability` is integrated in `ProjectPanel` and checks core world/template/pack availability. | Add one compact "debug package" export/readout for reproducible checks. |
| Block primitives cutover finalization | In progress (high impact) | Core flow moved to primitives-first; remaining legacy cleanup is broad (migrations, ID policy, old model references). | Finish one focused cleanup slice at a time (IDs, migrations, docs, then model pruning). |
| Bananza seed + gameplay validation loop | In progress | Seed and behavior-related test setup exists, but workflow is not yet canonicalized as "user-like project flow". | Stabilize one canonical test script: create/load project, seed minimum world/NPC behavior, run planner/generation checks. |

## Recent Completed Anchors

- `074dcfe0`: unified panel world context selection + dock visibility gating.
- `222dcb24`: fixed stale game-system doc paths after graph/feature migration.
- `c17d5b51`: docs cleanup (stale paths, action docs archival/status headers).
- `181f83ee`: HMR persistence for generation singletons/scope context.

## Working Rules

1. Keep commits lane-scoped (avoid mixed backend/frontend/docs commits).
2. Prefer one canonical path per feature, then archive legacy paths.
3. Update this file when a lane changes state or is split.

## Exit Criteria Per Lane

- Scene planner panel: one deterministic testable flow documented and runnable.
- Project availability/debug package: repeatable diagnostics output for any selected world/project.
- Block primitives cutover: no runtime dependency on legacy PromptBlock/ActionEngine paths.
- Bananza validation loop: reproducible setup path with minimal manual steps.
