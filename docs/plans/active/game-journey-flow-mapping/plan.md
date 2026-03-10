# Game Journey Flow Mapping Plan

Last updated: 2026-03-10
Owner: journey-map lane
Status: active
Stage: phase_7_complete
Scope: Dynamic mapping of game-related creation flows (scene, character, generation) for both user overview and AI-agent planning.

## Problem

We have many valid creation paths (scene prep, game world, quickgen, role bindings, generation routes), but we do not expose one dynamic map of:

1. possible paths
2. valid next steps from current context
3. actual paths users/agents took

Result: discoverability drops for users and AI agents need ad hoc repo knowledge.

## Goal

Add a dynamic **Journey Flow Graph** layer on top of existing architecture graph so we can answer:

1. "How can I create a scene from here?"
2. "What are valid next actions now?"
3. "Which flow is most used / blocked?"

## Current Foundation (already in repo)

1. Canonical architecture topology endpoint exists:
   - `GET /dev/architecture/graph`
2. Canonical backend contract exists:
   - `pixsim7/backend/main/api/v1/dev_architecture_contract.py`
3. Frontend AppMap consumer exists:
   - `AppMapPanel` + `loadArchitectureGraph()`

This plan is additive and should not replace architecture graph.

## Key Decision: 3-Layer Model

1. **Topology layer** (existing)
   - static-ish feature/route/plugin/service graph
2. **Journey template layer** (new)
   - curated path definitions ("character.create", "scene.create.from_room_nav")
3. **Runtime trace layer** (new)
   - observed path transitions from real usage

## Canonical Contract: `FlowGraphV1`

```ts
interface FlowGraphV1 {
  version: "1.0.0";
  generated_at: string;
  templates: FlowTemplate[];
  runs: FlowRunSummary[];
  metrics: {
    total_templates: number;
    total_runs: number;
    blocked_edges_24h: number;
  };
}

interface FlowTemplate {
  id: string; // e.g. scene.create.from_room_nav
  label: string;
  domain: "scene" | "character" | "generation" | "world";
  start_node_id: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  tags?: string[];
}

interface FlowNode {
  id: string;
  kind: "panel" | "action" | "api" | "job" | "artifact" | "gate";
  label: string;
  ref?: string; // panel id, endpoint path, artifact type, etc.
  required_caps?: string[];
}

interface FlowEdge {
  id: string;
  from: string;
  to: string;
  condition?: string; // lightweight expression or named predicate
  on_fail_reason?: string;
}

interface FlowRunSummary {
  template_id: string;
  started_at: string;
  ended_at?: string;
  status: "in_progress" | "completed" | "blocked" | "abandoned";
  last_node_id?: string;
}
```

## Resolve API (for user + agent)

Add resolver endpoint:

- `POST /dev/flows/resolve`

Input:

```json
{
  "goal": "scene.create",
  "context": {
    "project_id": "optional",
    "world_id": "optional",
    "location_id": "optional",
    "active_character_id": "optional",
    "capabilities": ["scene_prep", "generation"],
    "flags": ["room_navigation_enabled"]
  }
}
```

Output:

1. candidate templates
2. valid next steps now
3. blocked steps with reasons
4. suggested shortest path

## Trace API

Add trace ingestion endpoint:

- `POST /dev/flows/trace`

Write minimal events:

1. flow template
2. node entered
3. success/failure
4. reason if blocked

Do not start with heavy analytics pipeline; store compact records first.

## Starter Templates (v1)

Ship these first:

1. `character.create.basic`
   - Character Creator -> Portrait/Assets -> Roles/Bindings -> Ready
2. `scene.create.from_scene_prep`
   - Scene Prep -> Generation -> Select outputs -> Create/Update GameScene
3. `scene.create.from_room_nav`
   - GameWorld RoomNav -> Checkpoint traversal -> Scene Plan -> Generation
4. `asset.generate.quick`
   - QuickGen Prompt/Asset/Settings -> Generate -> Gallery -> Reuse

## Frontend UX

Extend `AppMapPanel` with a new tab: `Journeys`.

Views:

1. Template list + status badges (completed/blocked usage ratios)
2. Current context next-step assistant
3. Path preview (node/edge sequence with block reasons)

The tab should consume `/dev/flows/resolve` + optional `/dev/flows/graph`.

## Backend Ownership

1. Flow template definitions live in backend manifest module (not hardcoded in API handler body).
2. Resolver logic is deterministic and stateless per request.
3. Trace storage can start as lightweight table or log-backed sink; choose minimal change path first.

## Implementation Phases

## Phase 1: Contract + Template Registry

- [x] Add shared TS type `FlowGraphV1` and related types.
- [x] Add backend Pydantic mirror for flow graph/resolve payloads.
- [x] Add template manifest module with 4 starter templates.

Acceptance:

- [x] One source of truth for template definitions exists.

## Phase 2: Resolve Endpoint

- [x] Add `POST /dev/flows/resolve`.
- [x] Implement context filtering and blocked-reason reporting.
- [x] Return ordered `next_steps` and `candidate_paths`.

Acceptance:

- [x] Given context, endpoint returns deterministic next-step suggestions.

## Phase 3: Trace Endpoint + Basic Metrics

- [x] Add `POST /dev/flows/trace`.
- [x] Persist or sink trace events.
- [x] Expose basic run summaries and blocked-edge counts.

Acceptance:

- [x] We can see real run summaries per template.

## Phase 4: AppMap Journeys Tab

- [x] Add `Journeys` tab in AppMap panel.
- [x] Show template catalog + next-step resolver UI.
- [x] Show blocked reasons and path preview.

Acceptance:

- [x] User can ask "what can I do next?" from current context and get concrete paths.

## Phase 5: Agent-Focused API Stability

- [x] Add response fields for machine consumption stability (`id`, `kind`, `reason_code`).
- [x] Add endpoint tests for contract stability and deterministic ordering.
- [x] Document AI-agent usage examples.

Acceptance:

- [x] External AI agent can consume resolve API without repo-specific custom logic.

## Phase 6: Persistent Trace Storage

- [x] Replace process-local trace sink with a persistent lightweight storage backend.
- [x] Keep run summaries and `blocked_edges_24h` metrics compatible with existing graph contract.
- [x] Preserve deterministic ordering and test reset isolation.

Acceptance:

- [x] Trace events survive process restarts while existing API response shapes remain unchanged.

## Phase 7: Journey Graph Visualization

- [x] Add a canvas-style journey template graph view in AppMap `Journeys`.
- [x] Support template selection and graph highlighting from resolve output (`progressed`, `next`, `blocked`, `suggested`).
- [x] Keep existing resolve panels and contract usage unchanged.

Acceptance:

- [x] Users can inspect a selected template as a node/edge graph and correlate it with resolver output without leaving the panel.

## Routing and File Anchors

Backend:

- `pixsim7/backend/main/api/v1/dev_flows.py` (new)
- `pixsim7/backend/main/api/v1/dev_flows_contract.py` (new)
- `pixsim7/backend/main/api/v1/dev_flows_templates.py` (new)

Frontend:

- `apps/main/src/features/panels/components/dev/AppMapPanel.tsx`
- `apps/main/src/features/panels/components/dev/appMap/` (new journey loader/ui helpers)

Shared:

- `packages/shared/types/src/` (flow contract)

## Risks and Mitigations

1. Drift between templates and real product behavior.
   - Mitigation: trace-based drift warnings; periodic template review.
2. Over-modeling too early.
   - Mitigation: start with 4 templates and minimal predicates.
3. Agent confusion from unstable response shapes.
   - Mitigation: strict contract tests + versioned payload.

## Definition of Done (initial milestone)

1. `resolve` endpoint returns valid next-step candidates for scene + character flows.
2. AppMap `Journeys` tab renders templates and context-aware next steps.
3. Basic trace events can be recorded and surfaced as run summaries.
4. Existing AppMap graph features continue working unchanged.

## Implementation Notes

### March 10, 2026 (flow-map-v1 initial slice)

Completed in this pass:

1. Added shared flow contracts in `packages/shared/types/src/flowMap.ts` and exports in `index.ts`.
2. Added backend modules:
   - `pixsim7/backend/main/api/v1/dev_flows_contract.py`
   - `pixsim7/backend/main/api/v1/dev_flows_templates.py`
   - `pixsim7/backend/main/api/v1/dev_flows.py`
   - `pixsim7/backend/main/routes/dev_flows/manifest.py`
3. Added endpoints:
   - `GET /dev/flows/graph`
   - `POST /dev/flows/resolve`
4. Added AppMap `Journeys` tab skeleton with template list + resolve output views.
5. Added backend API tests in `pixsim7/backend/tests/api/test_dev_flows_api.py`.
6. Added `POST /dev/flows/trace` with a lightweight trace sink.
7. `GET /dev/flows/graph` now reports trace-derived run summaries and `blocked_edges_24h`.
8. Journeys resolver now supports active app context (project/world/location/character) with one-click "What can I do next?" execution.
9. Resolve response now includes machine-stable `id` + `kind` fields and normalized `reason_code` fields for blocked states/paths.
10. Added contract/determinism assertions for these fields in backend API tests.

### March 10, 2026 (persistent trace storage follow-up)

Completed in this pass:

1. Replaced the process-local flow trace sink with a persistent SQLite-backed sink in `pixsim_home/cache/flow_traces.sqlite3`.
2. Preserved graph metrics and run summaries by replaying from persistent storage with deterministic ordering.
3. Kept pruning limits (`_TRACE_MAX_EVENTS`, `_TRACE_MAX_RUNS`) and test reset behavior for deterministic tests.

### March 10, 2026 (journey canvas follow-up)

Completed in this pass:

1. Added `JourneyTemplateCanvas` renderer for flow template node/edge visualization with state legend and edge condition annotations.
2. Updated `JourneysView` with active template selection (catalog click + dropdown) and canvas wiring.
3. Added resolver-driven visual highlighting for progressed nodes, next step, blocked step, and suggested path.

## AI-Agent Usage Examples (Phase 5)

### Example A: Resolve next steps for scene creation

Request:

```json
{
  "goal": "scene.create",
  "context": {
    "project_id": "42",
    "world_id": "7",
    "location_id": "105",
    "active_character_id": "char:alexa",
    "capabilities": ["scene_prep", "generation"],
    "flags": ["room_navigation_enabled"]
  }
}
```

Agent interpretation guidance:

1. Iterate `candidate_templates` in returned order (already deterministic).
2. Prefer first `status = "ready"` candidate.
3. Execute `next_steps[*]` in order; each item has stable `id`, `template_id`, `node_id`, and `kind`.
4. If `suggested_path.blocked = true`, inspect `suggested_path.reason_code` before retrying.

### Example B: Handle blocked context deterministically

When `blocked_steps` is non-empty:

1. Group by `reason_code` (machine key), not human `reason`.
2. Resolve blockers in this order:
   - `missing_world`
   - `missing_location`
   - `missing_generation_capability`
   - `room_navigation_not_enabled`
3. Re-call `/dev/flows/resolve` with updated context and compare `candidate_templates[*].id` ordering to confirm deterministic progression.

## Update Log

- 2026-03-10: Normalized plan metadata to template contract and added update-log governance section.
