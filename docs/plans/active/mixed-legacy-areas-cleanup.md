# Mixed Legacy Areas Cleanup Plan

**Status:** Proposed  
**Date:** 2026-03-05  
**Scope:** Clarify and reduce mixed legacy boundaries identified during analyzer and architecture review.

## Findings

### 1. Frontend ownership is split across old and new structures

- Modern feature modules live under `features/*`, but shared and legacy feature-specific UI still lives in `components/*`.
- Panel UIs are still grouped under `components/panels/*`.

Evidence:

- `docs/repo-map.md` lines 22-23

Risk:

- Unclear ownership and repeated logic when both paths keep evolving.

Suggestion:

1. Freeze placement: all new feature UI goes in `features/*` only.
2. Add a migration queue for `components/*` entries that are feature-owned.
3. Keep only truly shared primitives in `components/*`.

### 2. App-map metadata still has fallback-era behavior

- Canonical metadata path exists, but deprecated fallback loading is still supported (`page.appMap`, `docs/app_map.sources.json`).

Evidence:

- `docs/APP_MAP.md` lines 52, 55, 100, 101, 112

Risk:

- Multiple metadata sources allow drift and hard-to-debug mismatches.

Suggestion:

1. Keep one canonical metadata contract (`@appMap`) as write path.
2. Keep fallback read path only behind an explicit temporary compatibility gate.
3. Remove fallback path after one cleanup cycle and CI enforcement.

### 3. Backend route wiring is a two-layer hybrid

- Route loading is plugin-manifest oriented, but handlers still mostly live in legacy `api/v1/*` modules.

Evidence:

- `pixsim7/backend/main/main.py` lines 224-225

Risk:

- Discovery and handler ownership are split, increasing refactor cost and onboarding confusion.

Suggestion:

1. Decide authority:
   - Option A (recommended): plugin route manifests are authority; handlers are incrementally co-located per domain.
   - Option B: keep `api/v1/*` as authority and generate/manufacture manifest layer from it.
2. Pick one direction and enforce it for all new endpoints.

## Recommended Execution Order

1. Lock conventions in docs and lint checks (no behavior change).
2. Enforce frontend placement rule (`features/*` for feature-owned UI).
3. Enforce app-map canonical write path and add fallback usage telemetry.
4. Choose backend routing authority and migrate one vertical slice.
5. Remove deprecated app-map fallback once telemetry shows no usage.

## Quick Wins (Low Risk)

1. Add PR checklist items for frontend ownership and app-map source-of-truth.
2. Add runtime warning when deprecated app-map fallback is used.
3. Add "new endpoint policy" note in backend architecture docs.

## Definition of Done

1. New feature UI lands only under `features/*`.
2. App-map metadata has one write-path and no implicit fallback drift.
3. Backend endpoint ownership model is explicit and consistently applied.
