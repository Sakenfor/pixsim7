# Pseudo-3D Checkpoint Navigation Plan

**Status:** Proposed (ready to start)  
**Last updated:** March 10, 2026  
**Scope:** Room/environment traversal using 2D images as pseudo-3D views, with AI-generated transition video.

## Goal

Build a room navigation system that feels like pre-rendered 3D games:

1. Each room is authored as connected visual checkpoints.
2. Each checkpoint is rendered from 2D imagery (panorama or directional set), not real 3D meshes.
3. Movement between checkpoints uses generated transition clips (or cached clips when available).

## Product Shape

Player experience:

1. Look around from a checkpoint using yaw/pitch controls.
2. Click a move hotspot or directional action.
3. See transition clip (pre-cached or generated on demand).
4. Arrive at destination checkpoint and continue.

Authoring experience:

1. Create/edit checkpoint graph per location.
2. Assign imagery and hotspot links per checkpoint.
3. Configure transition hints per edge (walk, turn-left, open-door, etc.).

## Current State (facts)

1. 2D location mapping exists via NPC slot tooling in `GameWorld` + `NpcSlotEditor`.
2. Partial 3D navigation exists in model inspector, but it is model/zone oriented.
3. `ScenePlan` already supports anchors/beats and can consume checkpoint-derived anchors later.

## Non-Goals (for this plan)

1. Real-time mesh-based navigation/physics.
2. Full 3D world editor.
3. Analyzer system refactor.

## Canonical Data Contract

Store under location metadata as `room_navigation` (single canonical key).

```ts
type ViewKind = "cylindrical_pano" | "quad_directions";

interface RoomNavigation {
  version: 1;
  room_id: string;
  checkpoints: RoomCheckpoint[];
  edges: RoomEdge[];
  start_checkpoint_id?: string;
}

interface RoomCheckpoint {
  id: string;
  label: string;
  view: {
    kind: ViewKind;
    // cylindrical_pano
    pano_asset_id?: string;
    // quad_directions
    north_asset_id?: string;
    east_asset_id?: string;
    south_asset_id?: string;
    west_asset_id?: string;
    fov_default?: number;
    yaw_default?: number;
    pitch_default?: number;
  };
  hotspots: RoomHotspot[];
  tags?: string[];
}

interface RoomHotspot {
  id: string;
  label?: string;
  screen_hint?: { yaw: number; pitch: number };
  action: "move" | "inspect" | "interact";
  target_checkpoint_id?: string;
}

interface RoomEdge {
  id: string;
  from_checkpoint_id: string;
  to_checkpoint_id: string;
  move_kind: "forward" | "turn_left" | "turn_right" | "door" | "custom";
  transition_profile?: string;
}
```

## Runtime Flow

```text
Checkpoint Graph -> Viewer (look controls) -> Move/Hotspot
        -> Transition Resolver (cache first)
            -> cache hit: play clip
            -> cache miss: enqueue generate job, show fallback, then play
        -> Destination Checkpoint
```

## Transition Cache Contract

Deterministic key:

1. `room_id`
2. `from_checkpoint_id`
3. `to_checkpoint_id`
4. `move_kind`
5. visual style hash (optional)
6. character/state hash (optional)

This enables reuse and prevents re-generation spam.

## Implementation Phases

## Phase 1: Contracts + Persistence

- [x] Add shared types for `RoomNavigation` in `packages/shared/types`.
- [x] Add backend schema validation for `location.meta.room_navigation`.
- [x] Add API read/write helpers (through existing location metadata paths).
- [x] Add migration adapter for any early experimental keys.

Acceptance:

- [x] Room graph can be saved/loaded with validation errors surfaced clearly.

## Phase 2: Authoring UI (GameWorld)

- [x] Add `Room Nav` tab in GameWorld.
- [x] Add checkpoint list + graph links editor.
- [x] Add checkpoint detail form (view kind, asset bindings, defaults).
- [x] Add edge editor (move kind + transition profile).
- [x] Keep existing 2D slot editor untouched.

Acceptance:

- [x] Author can create a full room graph with 3+ checkpoints and links.

## Phase 3: Pseudo-3D Viewer

- [x] Build checkpoint viewer surface (cylindrical pano and quad direction mode).
- [x] Add yaw/pitch look controls and hotspot selection.
- [x] Add directional movement UI fallback if hotspots absent.
- [x] Add lightweight loading/fallback states.

Acceptance:

- [x] User can traverse authored checkpoint graph locally without generation.

## Phase 4: Transition Generation + Cache

- [x] Add transition resolver service (cache lookup, enqueue, poll).
- [x] Define generation payload template from edge/checkpoint context.
- [x] Persist generated transition clip references against cache key.
- [x] Add timeout/degraded mode fallback (crossfade if job fails).

Acceptance:

- [x] First traversal can generate; repeated traversal reuses cached clip.

## Phase 5: Scene Plan Integration

- [x] Expose checkpoints/hotspots as anchor candidates for scene planning.
- [x] Map movement edges to camera/motion op hints in plan derivation.
- [x] Add optional "plan from current checkpoint" entrypoint.

Acceptance:

- [x] Scene plan can consume room navigation context without custom one-off logic.

## Phase 6: Testing + Devtools

- [x] Unit tests for schema validation and cache key generation.
- [x] UI tests for checkpoint editor basic CRUD.
- [x] Runtime tests for traversal + cache hit/miss behavior.
- [x] Devtools panel section for current checkpoint, edge selected, transition cache state.

Acceptance:

- [x] Traversal correctness and cache behavior are test-covered.

## Rollout Strategy

1. Ship phase 1-2 behind a feature flag (`room_navigation_enabled`).
2. Enable local traversal (phase 3) before generator coupling.
3. Enable generated transitions per-project opt-in.
4. Once stable, connect Scene Plan and broader gameplay hooks.

## Risks and Mitigations

1. Generation latency hurts movement feel.
   - Mitigation: cache-first policy + fallback crossfade + optional prewarm queue.
2. Overfitting to one provider profile.
   - Mitigation: transition payload remains provider-agnostic; profile mapping layer per provider.
3. Metadata drift from ad hoc fields.
   - Mitigation: one canonical `room_navigation` contract + strict validator.

## Immediate Next Slice (recommended)

1. Implement Phase 1 contracts and validation.
2. Implement minimal Phase 2 editor (checkpoint CRUD + edge links).
3. Add phase-3 viewer with traversal but no generation yet.

## Implementation Updates (2026-03-10)

1. Added canonical shared room navigation contract in `packages/shared/types/src/roomNavigation.ts`:
   - `ROOM_NAVIGATION_META_KEY = "room_navigation"`
   - room navigation zod schemas/types
   - semantic validation for duplicate IDs and missing checkpoint references.
2. Added backend room navigation schema validation in `domain/game/schemas/room_navigation.py` with:
   - strict shape validation (`version`, `checkpoints`, `edges`, `view.kind` rules)
   - actionable validation issues with per-field paths
   - migration adapter from legacy keys (`roomNavigation`, `room_nav`) to canonical `room_navigation`.
3. Added location metadata write support at `PATCH /api/v1/game/locations/{location_id}` and wired service-level validation:
   - rejects invalid `room_navigation` with `400` and `invalid_room_navigation` details
   - stores canonical `room_navigation` payload.
4. Added canonicalization on location reads so legacy keys are surfaced under canonical `meta.room_navigation`.
5. Added focused tests:
   - `pixsim7/backend/tests/domain/game/test_room_navigation_schema.py`
   - `pixsim7/backend/tests/api/test_game_locations_room_navigation.py`.
6. Deferred to later phases:
   - Phase 3 local traversal viewer
   - Phase 4 transition generation/cache integration.
7. Added Phase 2 authoring UI in `GameWorld`:
   - new `Room Nav (Beta)` tab and `RoomNavigationEditor` with checkpoint CRUD, view config editing, and edge CRUD
   - location metadata save path reuses `PATCH /game/locations/{id}` via `saveGameLocationMeta`
   - existing `2D Layout` tab and `NpcSlotEditor` flow remain unchanged.
8. Added Phase 3 local traversal preview in `RoomNavigationEditor`:
   - checkpoint preview surface for `cylindrical_pano` and `quad_directions` modes
   - yaw/pitch controls and quad turn-left/turn-right controls
   - movement buttons from authored move hotspots and outgoing edges
   - traversal log and checkpoint picker for local, generation-free traversal testing.
9. Added Phase 4 transition resolver wiring:
   - reusable `roomNavigationTransitions` runtime helper with deterministic cache keys
   - cache-first resolution using `meta.room_navigation_transition_cache`
   - generation enqueue/poll via existing generations API on cache miss
   - persisted clip references (`asset:<id>`) for reuse and crossfade fallback on timeout/failure.
10. Added Phase 5 Scene Plan integration in `ScenePlanPanel`:
    - scene-plan preview can include room checkpoint/hotspot anchors as candidate anchors
    - beat derivation maps room edges to path intent and camera motion hints
    - optional "plan from current checkpoint" entrypoint with room-nav status + checkpoint controls.
11. Added Phase 6 tests + devtools slice:
    - added room-navigation editor model helpers + CRUD tests (`roomNavigationEditorModel.test.ts`)
    - added transition resolver tests for cache key generation and cache hit/miss/timeout behavior (`roomNavigationTransitions.test.ts`)
    - added a Room Navigation devtools snapshot section in `RoomNavigationEditor` for current checkpoint, last selected edge/hotspot, and transition cache summary.
