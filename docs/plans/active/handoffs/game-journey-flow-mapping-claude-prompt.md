# Game Journey Flow Mapping Claude Execution Prompt

Task: `flow-map-v1`  
Date: March 10, 2026  
Primary plan: [`game-journey-flow-mapping.md`](../game-journey-flow-mapping.md)

## Copy-Paste Prompt (for Claude)

```md
You are implementing `flow-map-v1` from the game journey flow mapping plan.

Primary reference:
- `docs/plans/active/game-journey-flow-mapping.md`

Objective:
Build the first usable dynamic journey flow mapping slice for scene/character creation paths:
1) shared + backend flow contracts
2) backend journey template registry
3) `POST /dev/flows/resolve` endpoint
4) frontend AppMap `Journeys` tab skeleton consuming resolve API

Constraints:
1. Keep existing `/dev/architecture/graph` flow untouched.
2. Additive changes only; no broad refactor of AppMap internals.
3. Keep templates manifest-driven; do not hardcode giant arrays directly in route handlers.
4. Deterministic resolver output ordering.

Scope (in):
1. Shared type additions (`FlowGraphV1`, `FlowTemplate`, `FlowNode`, `FlowEdge`, resolve request/response).
2. Backend contracts (Pydantic mirror).
3. Backend template manifest with starter templates:
   - `character.create.basic`
   - `scene.create.from_scene_prep`
   - `scene.create.from_room_nav`
   - `asset.generate.quick`
4. New API module endpoints:
   - `GET /dev/flows/graph` (template graph only is fine in v1)
   - `POST /dev/flows/resolve` (context-aware next steps + blocked reasons)
5. Frontend loader + AppMap `Journeys` tab skeleton:
   - list templates
   - run resolve with sample/current context
   - show next steps and blocked reasons

Scope (out):
1. Persistent trace storage and analytics dashboards.
2. Complex expression engine for edge conditions.
3. Full graph canvas visualization.

Implementation details:
1. Keep conditions simple in v1:
   - named predicates (e.g. `requires_world`, `requires_location`, `requires_character`).
2. Resolver output must include:
   - `candidate_templates`
   - `next_steps`
   - `blocked_steps` with machine-readable reason code + human reason
   - one `suggested_path`
3. Sort order should be stable and deterministic.
4. If context is missing, return blocked reasons rather than empty ambiguous output.

Suggested files:
- `packages/shared/types/src/` (new flow types + exports)
- `pixsim7/backend/main/api/v1/dev_flows.py` (new router)
- `pixsim7/backend/main/api/v1/dev_flows_contract.py` (new)
- `pixsim7/backend/main/api/v1/dev_flows_templates.py` (new)
- `apps/main/src/features/panels/components/dev/AppMapPanel.tsx`
- `apps/main/src/features/panels/components/dev/appMap/` (new loader/UI helpers)

Testing requirements:
1. Backend tests:
   - `GET /dev/flows/graph` returns contract-valid payload.
   - `POST /dev/flows/resolve` returns deterministic next steps for at least:
     - complete context case
     - missing-world/location case
2. Frontend:
   - typecheck passes
   - no regressions in existing AppMap tabs

Acceptance criteria:
1. I can call `/dev/flows/resolve` and get concrete next steps for scene and character goals.
2. AppMap panel has a visible `Journeys` tab showing template list and resolver results.
3. Existing AppMap graph panel behavior is unchanged.
4. Contracts are documented and versioned.

Docs update required:
1. Update `docs/plans/active/game-journey-flow-mapping.md` checklist statuses for completed phase items.
2. Add short implementation notes section with date.

Output format:
1. Summary of changes.
2. Files modified.
3. Test commands + results.
4. Deferred items mapped back to specific phase numbers.
```

## Reviewer Checklist

1. New flow endpoints are additive and isolated from existing architecture endpoints.
2. Template definitions are centralized in manifest module.
3. Resolve output includes blocked reasons with reason codes.
4. AppMap `Journeys` tab works without breaking existing tabs.
5. Contract types are exported and reused, not duplicated ad hoc.
