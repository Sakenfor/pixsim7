## Task 128 – Remove Legacy Flat Generation Payloads

### Goal
Fully migrate the backend to the structured `generation_config` schema and remove the fallback path that accepts legacy flat payloads. All clients (Control Center, presets module, intimacy composer, extensions, scripts) must emit structured requests before this task completes.

### Motivation
CreationService currently canonicalizes two formats:
1. **Structured** – the new `/generations` payload with `generation_config`, `scene_context`, `player_context`, etc.
2. **Legacy flat** – top-level `prompt`, `quality`, `duration`, etc., used by older endpoints.

Maintaining both adds duplication (validation, canonicalization, telemetry) and increases drift risk. Once every caller emits structured configs we can delete the legacy branch and simplify adapters/cost extraction.

### Requirements
1. **Inventory callers**
   - Grep for `createGeneration(` and any direct POSTs to `/api/v1/generations` or `/providers/<id>/generate`.
   - Confirm each caller already builds `generation_config` via `buildGenerationConfig` (Control Center, intimacy composer, dev tools). Update any holdouts.
2. **Backend cleanup**
   - Remove legacy validation logic in `GenerationCreationService.create_generation`.
   - Delete legacy branch in `_canonicalize_params` and collapse `_canonicalize_structured_params` into `_canonicalize_params`.
   - Update unit tests (`test_generation_pipeline.py`) to only cover the structured flow.
3. **Adapter expectations**
   - Ensure every provider adapter path (`map_parameters`, `CostExtractor`, etc.) still receives the same canonical dict after the refactor.
4. **Documentation**
   - Update `docs/SYSTEM_OVERVIEW.md` (generation pipeline section) to state that structured payloads are required.
   - Note the change in `claude-tasks/changelog` or a new summary entry.
5. **Validation**
   - Add a regression test that POSTing a flat payload now returns a 400 with a helpful error (“structured generation_config is required”). This ensures new legacy usage fails loudly.

### Acceptance Criteria
- Legacy flat payloads are rejected at the API layer.
- All upstream callers build structured requests (verified via code search).
- CreationService canonicalization only deals with structured data.
- Tests/documentation updated accordingly.
