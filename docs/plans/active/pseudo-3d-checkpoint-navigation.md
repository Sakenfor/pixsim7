# Pseudo-3D Checkpoint Navigation Plan

Last updated: 2026-03-10
Owner: pseudo-3d navigation lane
Status: in progress
Stage: phase_6_complete_rollout_pending

## Goal

Deliver room traversal for game runtime and authoring using pseudo-3D checkpoints, cache-first transition generation, and scene-plan integration so traversal context is reusable across systems.

## Scope

- In scope:
  - Canonical `room_navigation` metadata contract and validation.
  - GameWorld authoring UI for checkpoint/hotspot/edge CRUD.
  - Local traversal preview (pano + quad directions).
  - Transition resolver with cache keying, generation, and degraded fallback.
  - Scene-plan anchor/camera integration from room graph context.
  - Tests and a devtools snapshot for traversal/cache visibility.
- Out of scope:
  - Real-time mesh/physics navigation.
  - Full 3D world editor.
  - Analyzer architecture refactor.

## Current Baseline

- Relevant files/endpoints/services:
  - `packages/shared/types/src/roomNavigation.ts`
  - `pixsim7/backend/main/domain/game/schemas/room_navigation.py`
  - `pixsim7/backend/main/api/v1/game_locations.py`
  - `apps/main/src/components/game/RoomNavigationEditor.tsx`
  - `apps/main/src/lib/game/runtime/roomNavigationTransitions.ts`
  - `apps/main/src/features/panels/domain/definitions/scene-plan/ScenePlanPanel.tsx`

## Decisions Already Settled

- Canonical location metadata key is `meta.room_navigation`.
- Checkpoint view kinds are `cylindrical_pano` and `quad_directions`.
- Transition cache key shape is deterministic (`room_id`, from/to checkpoint IDs, move kind, optional profile/style/state hashes).
- Resolver behavior is cache-first with generation enqueue/poll and crossfade fallback on timeout/failure/unresolvable inputs.
- Scene plan can consume room checkpoints/hotspots as anchors and optionally start from a selected checkpoint.

## Delivery Phases

### Phase 1: Contracts + Persistence

- [x] Add shared `RoomNavigation` contract/types.
- [x] Add backend schema validation for location metadata.
- [x] Add location read/write helper paths and legacy key migration.

Exit criteria:

- [x] Room graphs save/load with clear validation feedback.

### Phase 2: Authoring UI (GameWorld)

- [x] Add `Room Nav` tab in GameWorld.
- [x] Add checkpoint list/details and graph-link editing.
- [x] Add edge editing (`move_kind`, `transition_profile`).
- [x] Keep existing 2D slot editor flow unchanged.

Exit criteria:

- [x] Author can build/edit a 3+ checkpoint graph end-to-end.

### Phase 3: Pseudo-3D Viewer

- [x] Add checkpoint viewer for pano + quad-direction modes.
- [x] Add yaw/pitch controls and hotspot interaction.
- [x] Add directional fallback movement when hotspots are absent.
- [x] Add loading/fallback states for traversal UX.

Exit criteria:

- [x] Local graph traversal works without generation coupling.

### Phase 4: Transition Generation + Cache

- [x] Add transition resolver service (lookup/enqueue/poll).
- [x] Build generation payload from edge/checkpoint context.
- [x] Persist generated clip refs in transition cache.
- [x] Add degraded timeout/failure fallback behavior.

Exit criteria:

- [x] First traversal can generate and subsequent traversal reuses cache.

### Phase 5: Scene Plan Integration

- [x] Expose checkpoints/hotspots as scene-plan anchor candidates.
- [x] Map movement edges to beat path intent + camera hints.
- [x] Add optional "plan from current checkpoint" entrypoint.

Exit criteria:

- [x] Scene plan builds with room-nav context without ad hoc logic.

### Phase 6: Testing + Devtools

- [x] Cover schema/cache-key behavior with tests.
- [x] Add checkpoint editor CRUD coverage via model tests.
- [x] Add runtime cache hit/miss/timeout transition tests.
- [x] Add devtools snapshot section for current checkpoint, edge/hotspot, cache state.

Exit criteria:

- [x] Traversal correctness and cache behavior are test-covered.

## Risks

- Risk: generation latency can hurt movement feel.
  - Mitigation: cache-first resolver, persisted clip reuse, crossfade fallback.
- Risk: metadata drift from parallel experiments.
  - Mitigation: canonical key + strict schema validation + migration adapter.
- Risk: provider-specific transition behavior divergence.
  - Mitigation: provider-agnostic cache key + payload shaping at resolver boundary.

## Update Log

- 2026-03-10 (`9b830af88`): Completed Phase 2 GameWorld room-nav authoring lane.
- 2026-03-10 (`1434afb75`): Completed Phase 4 transition resolver/cache integration.
- 2026-03-10 (`7e5edae14`): Completed Phase 5 scene-plan integration lane.
- 2026-03-10 (`cb71b93b1`): Completed Phase 6 tests + devtools snapshot implementation.
- 2026-03-10 (`pending`): Reformatted plan to `docs/plans/TEMPLATE.md` structure and synchronized registry metadata/code paths.
