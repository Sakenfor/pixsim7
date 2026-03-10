# Pseudo-3D Checkpoint Navigation Claude Execution Prompt

Task: `room-nav-v1`  
Date: March 10, 2026  
Primary plan: [`pseudo-3d-checkpoint-navigation.md`](../pseudo-3d-checkpoint-navigation.md)

## Copy-Paste Prompt (for Claude)

```md
You are implementing `room-nav-v1` from the pseudo-3D checkpoint navigation plan.

Primary reference:
- `docs/plans/active/pseudo-3d-checkpoint-navigation.md`

Objective:
Implement the first vertical slice of pseudo-3D room navigation using 2D checkpoints (not real 3D meshes):
1) canonical room_navigation schema + validation
2) GameWorld authoring tab for checkpoint graph CRUD
3) local traversal viewer (no generation coupling yet)

Product constraints (must keep):
1. This is pre-rendered-style navigation (checkpoint graph), not free mesh navigation.
2. Keep existing 2D slot editor intact and usable.
3. Do not refactor analyzer/AI-hub architecture in this task.
4. Keep changes additive and backward compatible with existing location metadata.

Scope (in):
1. Shared types for `RoomNavigation` contract.
2. Backend validation + metadata read/write support for `location.meta.room_navigation`.
3. New `Room Nav` tab in GameWorld with:
   - checkpoint CRUD
   - edge CRUD (from/to/move kind)
   - checkpoint view config (cylindrical pano or quad directions)
4. Local viewer that can:
   - render current checkpoint view
   - allow yaw/pitch look interaction
   - move along authored edges/hotspots without generation

Scope (out):
1. AI transition generation and caching service.
2. Scene plan integration.
3. Analyzer registry changes.
4. Full visual graph canvas polish.

Required deliverables:
1. Code implementing scope above.
2. Tests for schema validation and basic editor/viewer state flow.
3. Docs update:
   - update `docs/plans/active/pseudo-3d-checkpoint-navigation.md` checklist statuses for completed items
   - add a short "Implementation Updates (YYYY-MM-DD)" section with factual notes

Suggested file anchors (adjust if needed):
- `packages/shared/types/src/*` (new room navigation types)
- `apps/main/src/routes/GameWorld.tsx`
- `apps/main/src/components/*` (new RoomNav editor/viewer components)
- backend location meta handling paths under:
  - `pixsim7/backend/main/api/v1/*`
  - `pixsim7/backend/main/domain/*`
  - `pixsim7/backend/main/services/*`

Implementation guidance:
1. Use one canonical metadata key: `room_navigation`.
2. Contract shape should follow the plan doc:
   - versioned payload
   - checkpoints
   - edges
   - optional start checkpoint
3. Include validation errors that are actionable (missing checkpoint IDs, bad edge references, invalid view kinds).
4. Keep viewer rendering lightweight; placeholder pano rendering is acceptable if architecture is clean.
5. Hide the feature behind a flag if a clean flag path already exists; if not, keep it visible but clearly marked as beta/dev.

Acceptance criteria:
1. I can author at least 3 checkpoints and 2 edges from UI and persist them to location meta.
2. Reloading the page restores authored room_navigation data.
3. Local traversal can move from checkpoint A to B using authored edges.
4. Existing GameWorld tabs and NpcSlotEditor flows still work.
5. Tests pass for new schema validation and key reducer/state helpers.

Output format:
1. Summary of what changed.
2. Files touched list.
3. Test command(s) run and pass/fail results.
4. Any deferred items explicitly mapped back to phase numbers in the plan doc.
```

## Reviewer Checklist

1. `room_navigation` is the only canonical metadata key introduced.
2. Existing 2D layout/slot tooling is unaffected.
3. No accidental coupling to transition generation jobs yet.
4. Validation catches broken edge references and invalid checkpoint view config.
5. Plan doc checklist/status is updated with concrete completion notes.
