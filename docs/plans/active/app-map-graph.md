# App Map Unified Architecture Graph Plan

**Status:** Execution Plan (Locked)  
**Date:** March 4, 2026  
**Owner domains:** Frontend modules/registries, backend dev-architecture introspection, launcher consumers

## Context

Architecture visibility is currently split across:

- Frontend runtime registries in `AppMapPanel`.
- Generated artifact `docs/app_map.generated.json`.
- Backend dev endpoints in `pixsim7/backend/main/api/v1/dev_architecture.py`.

This creates duplicated views, drift risk, and unclear authority.

## Problem Statement (Concrete)

We need one contract and one canonical read endpoint that:

1. Keeps ownership boundaries explicit.
2. Is consumable by frontend devtools and launcher.
3. Works with offline fallback.
4. Preserves live backend introspection.
5. Removes hardcoded backend curation from API code.

## Decisions Locked

1. **Federated authority remains**:
   - Frontend module metadata is frontend-owned.
   - Backend routes/plugins/capability APIs are backend-owned.
   - Backend graph endpoint is a read-model aggregator only.
2. **Canonical endpoint is `GET /dev/architecture/graph`**:
   - `GET /dev/architecture/unified` is an alias to the same payload.
   - `/map` and `/frontend` stay as debug sub-views.
3. **Contract is defined once in shared TS types and mirrored in backend Pydantic**:
   - TS: `packages/shared/types/src/appMap.ts`
   - Python: dev architecture API contract module
4. **Frontend runtime overlay is deferred to v2**:
   - v1 uses generated frontend artifact + backend runtime introspection.
5. **Hardcoded capability/service lists are removed in v1**:
   - Replace with manifest-first discovery.

## Current Gap Snapshot (2026-03-04)

- No `/dev/architecture/graph` endpoint exists yet.
- `/dev/architecture/unified` returns a non-final shape.
- `discover_capabilities()` and `discover_services()` use hardcoded descriptor tables.
- `AppMapPanel.tsx` is not centered on backend unified graph consumption.

## Canonical Source-of-Truth Model

- Frontend code + generator (`pnpm docs:app-map`) is authority for frontend metadata.
- Backend runtime is authority for backend discovery.
- Graph endpoint is canonical read contract for consumers.
- Links/metrics/warnings are merger-owned derived data only.

## Target Contract: `ArchitectureGraph v1`

Use this payload shape for `/graph` and `/unified`:

```json
{
  "version": "1.0.0",
  "generated_at": "ISO-8601",
  "sources": {
    "frontend": {
      "kind": "generated_artifact | fallback_local",
      "path": "docs/app_map.generated.json",
      "generated_at": "ISO-8601 | null"
    },
    "backend": {
      "kind": "runtime_introspection",
      "generated_at": "ISO-8601",
      "build_id": "optional"
    }
  },
  "frontend": {
    "entries": []
  },
  "backend": {
    "routes": [],
    "plugins": [],
    "services": [],
    "capability_apis": []
  },
  "links": [],
  "metrics": {
    "total_frontend_features": 0,
    "total_backend_routes": 0,
    "drift_warnings": []
  }
}
```

Rules:

- `links` is derived edge data (`from`, `to`, `kind`, `status`).
- `drift_warnings` includes stale artifact age and unresolved refs.

## API Routing Decision

- `GET /dev/architecture/graph`: canonical.
- `GET /dev/architecture/unified`: alias, identical payload.
- `GET /dev/architecture/map`: backend-only debug view.
- `GET /dev/architecture/frontend`: frontend artifact debug view.

## Concrete Implementation Steps

### Step 1: Lock Contract in Shared Types

Files:

- `packages/shared/types/src/appMap.ts`
- `packages/shared/types/src/index.ts` (export verification)

Changes:

1. Add `ArchitectureGraphV1` and nested interfaces.
2. Reuse existing app-map entry typing where possible.
3. Keep naming API-compatible with backend payload.

Exit criteria:

- Frontend and launcher can import one graph type.
- `npx tsc --noEmit --project apps/main/tsconfig.json` passes.

### Step 2: Add Backend Contract Mirror and Graph Builder

Files:

- `pixsim7/backend/main/api/v1/dev_architecture.py`
- `pixsim7/backend/main/api/v1/dev_architecture_contract.py` (new)
- `pixsim7/backend/main/api/v1/dev_architecture_graph.py` (new)

Changes:

1. Move graph response models into `dev_architecture_contract.py`.
2. Build graph assembly in `dev_architecture_graph.py`:
   - `load_frontend_source()`
   - `discover_backend_source()`
   - `build_links_and_metrics()`
3. Keep legacy `/map` and `/frontend` behavior.
4. Add `/graph`; wire `/unified` as alias.

Exit criteria:

- `/graph` and `/unified` return identical JSON.
- Missing frontend artifact still returns valid graph with warning.

### Step 3: Replace Hardcoded Capability/Service Tables with Manifests

Files:

- `pixsim7/backend/main/infrastructure/plugins/capabilities/manifest.py` (new)
- `pixsim7/backend/main/services/manifest.py` (new)
- `pixsim7/backend/main/api/v1/dev_architecture.py`

Changes:

1. Define capability descriptors in capability manifest.
2. Define service decomposition descriptors in service manifest.
3. Update discoverers to read manifests first.
4. Return drift warnings if manifest load fails.

Exit criteria:

- No hardcoded capability/service arrays remain in `dev_architecture.py`.
- Descriptor updates are centralized in manifest files.

### Step 4: App Map Consumer Cutover

Files:

- `apps/main/src/features/panels/components/dev/AppMapPanel.tsx`
- `apps/main/src/features/panels/components/dev/appMap/loadArchitectureGraph.ts` (new)
- `apps/main/src/features/panels/components/dev/appMap/index.ts`

Changes:

1. Add loader for `/dev/architecture/graph`.
2. Fallback order:
   - backend graph endpoint
   - local generated artifact + local registries (mark `fallback_local`)
3. Keep `BackendArchitecturePanel.tsx` on `/map` for backend drilldown.

Exit criteria:

- AppMap loads with backend online and offline.
- Data source/freshness shown in panel state.

### Step 5: Validation and Drift Guard

Files:

- `pixsim7/backend/main/tests/api/test_dev_architecture_api.py` (new)
- `.github/workflows/contracts-and-typecheck.yml`

Changes:

1. Add endpoint tests for:
   - `/graph` schema
   - `/unified` alias parity
   - missing frontend artifact warning behavior
2. Add CI step: `pnpm docs:app-map:check`.
3. Keep existing typecheck/openapi checks.

Exit criteria:

- CI fails if app-map artifact is stale.
- CI fails if graph payload shape regresses.

## File-Level Task Matrix (Claude Order)

1. **Contract Task**
   - Shared type additions only.
2. **Backend Graph Task**
   - Add contract mirror, graph builder, `/graph`, `/unified` alias.
3. **Discovery Cleanup Task**
   - Add manifests and remove hardcoded descriptor tables.
4. **Frontend Consumer Task**
   - Graph loader + fallback wiring in AppMap panel.
5. **Validation Task**
   - Backend tests + CI drift check.

## Definition of Done (Measurable)

All must pass:

1. `pnpm docs:app-map`
2. `pnpm docs:app-map:check`
3. `python -m pytest pixsim7/backend/main/tests/api/test_dev_architecture_api.py -q`
4. `npx tsc --noEmit --project apps/main/tsconfig.json`
5. Manual endpoint smoke:
   - `/dev/architecture/graph` includes `version`, `sources`, `frontend`, `backend`, `links`, `metrics`.
   - `/dev/architecture/unified` payload equals `/dev/architecture/graph`.

## Deferred Decisions (Explicitly Postponed)

1. Frontend runtime registry push/overlay into backend.
2. Reflection-based auto-discovery beyond manifest-first.
3. Long-term removal timing for `/map` and `/frontend`.
