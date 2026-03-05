# Analyzer ID Format Migration Plan

Task ID: `EP-01.0`
Program: Extension Platform Unification
Date: March 5, 2026

## Problem Statement

Analyzer IDs use `<target>:<name>` format (`prompt:simple`, `asset:object-detection`).
Extension identity uses `<kind>:<scope>.<owner>/<name>[@<version>]` (`analyzer:core.pixsim/object-detection`).

These are structurally incompatible:

| Dimension | Analyzer ID prefix | Extension ID prefix |
|---|---|---|
| What it encodes | **target** (prompt/asset) | **kind** (analyzer) |
| Example | `prompt:simple` | `analyzer:core.pixsim/simple` |
| Scope/owner | Not present | `core.pixsim` |
| Version | Not present | `@1.0.0` |

Applying `parse_extension_identity(... expected_kind="analyzer")` to `prompt:simple` produces the meaningless key `analyzer:legacy.legacy/prompt:simple`.

**Note on legacy IDs:** Old formats (`parser:simple`, `llm:claude`, bare `face_detection`) were already migrated to `<target>:<name>` in the DB via `20260216_0001_asset_analysis_use_analyzer_id`. The `resolve_legacy()` map and `is_legacy` registrations in the registry are dead defensive code — no production data uses those formats. They can be cleaned up independently but are not a concern for this migration.

## Key Design Decision: Sidecar Extension ID

**Do not replace `analyzer_id`.** It is the runtime key across the entire system.

Instead, introduce an optional `extension_id` **alongside** `analyzer_id`:
- `analyzer_id` remains the runtime/lookup key (unchanged in all runtime paths)
- `extension_id` is the canonical extension identity for catalog/governance/discovery
- A deterministic mapping function converts between them

This avoids touching runtime resolution, chain execution, preference storage, and frontend constants in the first phases.

## Canonical Mapping Model

### Mapping function

```
analyzer_id → extension_id

prompt:simple       → analyzer:core.pixsim/prompt-simple
prompt:claude       → analyzer:core.pixsim/prompt-claude
prompt:openai       → analyzer:core.pixsim/prompt-openai
prompt:local        → analyzer:core.pixsim/prompt-local
asset:object-detection → analyzer:core.pixsim/asset-object-detection
asset:face-detection   → analyzer:core.pixsim/asset-face-detection
asset:scene-tagging    → analyzer:core.pixsim/asset-scene-tagging
asset:content-moderation → analyzer:core.pixsim/asset-content-moderation
asset:ocr              → analyzer:core.pixsim/asset-ocr
asset:caption          → analyzer:core.pixsim/asset-caption
asset:embedding        → analyzer:core.pixsim/asset-embedding
asset:custom           → analyzer:core.pixsim/asset-custom
```

Pattern: `analyzer:<scope>.<owner>/<target>-<name>`

- Core analyzers: `scope=core`, `owner=pixsim`
- API-created analyzers: `scope=user`, `owner=<creator_username_or_id>`
- Plugin-provided analyzers: `scope=org` or `user`, `owner=<plugin_namespace>`

The target is preserved in the name segment (e.g. `prompt-simple`) so that the extension ID remains unique and the original target is recoverable.

### Mapping helpers (new)

Location: `pixsim7/backend/main/shared/extension_contract.py`

```python
def analyzer_id_to_extension_id(
    analyzer_id: str,
    *,
    scope: str = "core",
    owner: str = "pixsim",
) -> str:
    """Convert runtime analyzer_id to canonical extension_id."""
    canonical = analyzer_id.replace(":", "-", 1)  # prompt:simple → prompt-simple
    return f"analyzer:{scope}.{owner}/{canonical}"

def extension_id_to_analyzer_id(extension_id: str) -> str | None:
    """Extract runtime analyzer_id from canonical extension_id, if possible."""
    identity = parse_extension_identity(extension_id, expected_kind="analyzer")
    if not identity.canonical:
        return None
    # Reverse the encoding: prompt-simple → prompt:simple
    name = identity.name
    for prefix in ("prompt-", "asset-"):
        if name.startswith(prefix):
            target = prefix[:-1]  # "prompt" or "asset"
            rest = name[len(prefix):]
            return f"{target}:{rest}"
    return name  # Custom/unknown shape
```

## Compatibility Strategy

### Dual-read/write plan

| Phase | `analyzer_id` column | `extension_id` column | Runtime key |
|---|---|---|---|
| A (current) | Source of truth | Does not exist | `analyzer_id` |
| B (sidecar) | Source of truth | Populated on write, backfilled | `analyzer_id` |
| C (canonical-first) | Kept for compat, derived from extension_id | Source of truth | Either (prefer extension_id for catalog) |
| D (deprecation) | Removed after full migration | Source of truth | `extension_id` |

**Phase B is the target for EP-01.** Phase C/D are future and optional.

### Resolution order

Input to any endpoint is always `analyzer_id` (the only format clients use today). In Phase C, endpoints would also accept `extension_id` and resolve it via `extension_id_to_analyzer_id()`.

## Data Model Implications

### `analyzer_definitions` table

| Change | Column | Notes |
|---|---|---|
| Add | `extension_id: Optional[str]` | Nullable, unique, indexed. Populated by mapping function on create/update. |
| Keep | `analyzer_id: str` | Unchanged. Remains primary runtime key. |
| Keep | `base_analyzer_id: Optional[str]` | Still references `analyzer_id`. No change. |

Migration: `ALTER TABLE analyzer_definitions ADD COLUMN extension_id VARCHAR(200) UNIQUE;`
Backfill: deterministic from `analyzer_id` + known scope/owner.

### `analyzer_presets` table

No change. Presets reference analyzers by `analyzer_id`. Join through `analyzer_definitions.extension_id` when needed for catalog views.

### `asset_analyses` table

No change. Immutable historical records keep their original `analyzer_id`.

### `analysis_backfill_runs` table

No change. Runtime reference.

### `provider_instance_configs` table

No change. Runtime reference for kind=ANALYZER instances.

### User preferences (JSON in `users.preferences`)

No change in Phase B. Preferences store `analyzer_id` values. Mapping to extension identity happens at the API/catalog layer.

### Frontend localStorage (`pixsim7:analyzerSettings`)

No change in Phase B. The Zustand store persists `analyzer_id` strings.

## API Contract Implications

### Unchanged in v1 (Phase B)

All existing request/response fields that use `analyzer_id` remain unchanged:
- `AnalyzerResponse.id` — still `analyzer_id`
- `AnalyzerPresetResponse.analyzer_id`
- `AnalyzerInstanceResponse.analyzer_id`
- `AnalysisResponse.analyzer_id`
- `CreateAnalysisRequest.analyzer_id`
- `AnalyzerPresetCreate.analyzer_id`
- All query parameters accepting `analyzer_id`

### New optional metadata (Phase B)

Add to `AnalyzerResponse` (non-breaking):
```python
extension_id: Optional[str] = None
```

Optional. Populated from the mapping function. Existing clients ignore it.

### New optional input (Phase C, future)

Endpoints that accept `analyzer_id` would also accept `extension_id` as an alternative input, with `extension_id_to_analyzer_id()` resolving to the runtime key.

## Impacted Files Inventory

### Backend — Phase B changes

| File | Change |
|---|---|
| `shared/extension_contract.py` | Add `analyzer_id_to_extension_id()`, `extension_id_to_analyzer_id()` |
| `domain/analyzer_definition.py` | Add `extension_id` column |
| `services/analysis/analyzer_definition_service.py` | Populate `extension_id` on create/update |
| `api/v1/analyzers.py` | Add `extension_id` to `AnalyzerResponse`, populate in response builder |
| New migration file | `ALTER TABLE` for `extension_id` column + backfill |

### No changes needed

| File | Why |
|---|---|
| `services/prompt/parser/registry.py` | Runtime key unchanged |
| `services/analysis/analyzer_preset_service.py` | Uses `analyzer_id` |
| `services/analysis/analyzer_pipeline.py` | Uses `analyzer_id` |
| `services/analysis/chain_executor.py` | Uses `analyzer_id` |
| `services/analysis/analyzer_defaults.py` | Uses `analyzer_id` |
| `lib/analyzers/constants.ts` | Frontend unchanged in Phase B |
| `lib/analyzers/settingsStore.ts` | Frontend unchanged in Phase B |

## Rollout Phases

### Phase A — No behavior change (current state)

- Extension contract scaffold exists (`shared/extension_contract.py`)
- Analyzer IDs are `<target>:<name>` everywhere
- No `extension_id` field anywhere

### Phase B — Sidecar identity (EP-01.1R target)

**Scope:**
1. Add mapping helpers to `extension_contract.py`
2. Add `extension_id` column to `analyzer_definitions`
3. Populate on create/update in `analyzer_definition_service.py`
4. Backfill existing rows via data migration
5. Expose `extension_id` in `AnalyzerResponse` (optional field)
6. Tests for mapping helpers + response enrichment

**Behavior change:** None. All runtime paths use `analyzer_id`.

**Exit criteria:** Every analyzer definition has a populated `extension_id`. API responses include it. No runtime behavior change.

### Phase C — Dual identity (future)

API endpoints accept `extension_id` as alternative input. Catalog/discovery can filter by extension identity. Frontend receives and optionally uses extension IDs.

### Phase D — Deprecation (future, gated)

Prerequisites: all clients migrated. `analyzer_id` becomes derived from `extension_id`.

## Test Plan

### Unit vectors

| Test | Input | Expected |
|---|---|---|
| Core prompt mapping | `prompt:simple` | `analyzer:core.pixsim/prompt-simple` |
| Core asset mapping | `asset:object-detection` | `analyzer:core.pixsim/asset-object-detection` |
| User-created mapping | `prompt:my-custom`, scope=user, owner=stefan | `analyzer:user.stefan/prompt-my-custom` |
| Reverse mapping | `analyzer:core.pixsim/prompt-simple` | `prompt:simple` |
| Reverse mapping (asset) | `analyzer:core.pixsim/asset-ocr` | `asset:ocr` |

### Integration vectors

| Test | Scope |
|---|---|
| Create analyzer definition → `extension_id` populated | Service + DB |
| Update analyzer definition → `extension_id` updated | Service + DB |
| List analyzers API → `extension_id` in response | API |
| Backfill migration → all existing rows get `extension_id` | Migration |

### Regression vectors

| Test | Assertion |
|---|---|
| Create preset with `prompt:simple` | Still works, no change |
| Run analysis with `asset:object-detection` | Pipeline resolves normally |
| Frontend preference `["asset:object-detection"]` | Unchanged behavior |

## Risk Controls

### Rollback strategy

Phase B is fully additive:
- `extension_id` column is nullable — can be ignored
- Response field is optional — clients already handle absence
- No runtime path depends on `extension_id`
- Rollback = deploy previous code. Column remains harmless.

## Summary of Key Decisions

1. **Sidecar, not replacement.** `extension_id` is added alongside `analyzer_id`, not instead of it.
2. **Deterministic mapping.** `<target>:<name>` → `analyzer:<scope>.<owner>/<target>-<name>`. Reversible.
3. **Target preserved in name.** The extension ID name segment encodes the original target prefix to maintain uniqueness and reversibility.
4. **Runtime unchanged in Phase B.** No changes to registry, pipeline, chain executor, preferences, or frontend.
5. **Only `analyzer_definitions` gets the column.** Presets, analyses, and instances reference analyzers by `analyzer_id` and don't need their own `extension_id`.
6. **No legacy ID concern.** DB already migrated to `<target>:<name>`. Legacy aliases in registry are dead code, cleanable independently.

## Next Coding Task: EP-01.1R

1. Add `analyzer_id_to_extension_id()` and `extension_id_to_analyzer_id()` to `shared/extension_contract.py`
2. Add `extension_id` column to `AnalyzerDefinition` model
3. Write Alembic migration for the column
4. Populate `extension_id` in `AnalyzerDefinitionService.create_definition()` and `update_definition()`
5. Add `extension_id` to `AnalyzerResponse` in `api/v1/analyzers.py`
6. Write tests for mapping helpers + response enrichment
7. Update tracker
