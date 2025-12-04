# Concept Drift Monitoring

This document defines a lightweight process and structure for checking
whether core concepts in the PixSim7 stack are starting to drift across
layers (frontend ↔ backend ↔ providers ↔ docs), and for recording those
changes over time.

The goal is to keep things like `generation_type`, `OperationType`,
`media_type`, `npc_response`, `variation`, `image_edit`, etc. aligned in
meaning, even as systems evolve.

## Scope

Concept drift monitoring currently focuses on:

- Generation concepts
  - `generation_type` values (e.g. `transition`, `variation`, `npc_response`, `image_edit`, `fusion`)
  - `OperationType` values (e.g. `TEXT_TO_VIDEO`, `IMAGE_TO_VIDEO`, `IMAGE_TO_IMAGE`)
  - Mapping registry in `pixsim7/backend/main/shared/operation_mapping.py`
  - Provider mappings (e.g. Pixverse `supported_operations`, `map_parameters`, `execute`)
- Media concepts
  - `MediaType` (`video`, `image`, `audio`, `3d_model`)
  - How assets are created from submissions (`create_from_submission`)
- Context and purpose
  - `purpose` in `GenerationNodeConfig` (e.g. `gap_fill`, `variation`, `adaptive`)
  - `scene_context`, `player_context`, `social_context`

This can be extended later as other systems (NPCs, arcs, stats) mature.

## When to Run This Task

Run a concept drift check when:

- Introducing a new `generation_type` or `OperationType`
- Changing provider mappings (e.g. wiring new Pixverse operations)
- Adding new major editor / gameplay features that lean on `generation_type`
- Before larger refactors of the generation pipeline

It does **not** need to run on every small change; think of it as a
periodic health check you run consciously when semantics are changing.

## Analysis Checklist (for humans or AI agents)

When you (or an AI agent) run this task, walk through these steps:

1. **Concept inventory**
   - List the current concepts and where they are defined:
     - `generation_type` values in
       - Frontend types (`GenerationNodeConfig` TS)
       - Backend schema (`GenerationNodeConfigSchema`)
     - `OperationType` enum values
     - Provider `supported_operations`
   - Note any `generation_type` seen in JSON or code that is not in the
     registry.

2. **Cross-layer mapping check**
   - Compare:
     - `GENERATION_TYPE_OPERATION_MAP` in `operation_mapping.py`
     - Frontend mapping (e.g. `mapOperationToGenerationType`)
     - Provider `supported_operations` / `map_parameters` / `execute`
   - Flag:
     - Generation types that have no backend mapping
     - Operations supported by providers but never used by the pipeline
     - UI operations that map to surprising backend operations

3. **Invariant check**
   - Infer simple invariants, such as:
     - `"image_edit" → OperationType.IMAGE_TO_IMAGE and media_type IMAGE`
     - `"npc_response" → seed image input is present`
   - Check whether existing code paths and/or recent `Generation` records
     respect these invariants.

4. **Schema alignment**
   - Compare TS generation config types with Pydantic schemas:
     - Ensure allowed values, field names, and shapes match
     - Note fields that exist in TS but not in Python (or vice versa)
   - Cross-check with canonicalization in
     `GenerationCreationService._canonicalize_structured_params` to ensure
     important fields are not ignored.

5. **Logging and events**
   - Inspect structured logs and events around generations:
     - Are `generation_type`, `operation_type`, `media_type` used
       consistently and unambiguously?
     - Are error codes / reasons (e.g. Pixverse ErrCode) surfaced with
       enough context for future analysis?

6. **Summarize drift**
   - For each concept where semantics have changed, write down:
     - What it used to mean (or where it was used differently)
     - What it means now
     - Which layers were updated (or still need updating)

## Drift Log (Versioned History)

Record each analysis run here as a new entry. This gives you a simple
“graph of changes” over time that can be inspected without digging into
git history.

Use the template below for each run.

### Run YYYY-MM-DD – short title

- **Analyst / agent:** (name or tool)
- **Scope:** (e.g., image ops + Pixverse, Quick Generate only)
- **Changes observed:**
  - Concept: `generation_type.image_edit`
    - Old: _not used / aliased_
    - New: _maps to OperationType.IMAGE_TO_IMAGE; used for Img→Img_
    - Layers updated: frontend config builder, backend registry,
      Pixverse provider mapping, canonicalization
  - Concept: `npc_response`
    - Old: _used for both video and image_;
      new mapping is video-first
    - Layers still TBD: _game/editor semantics_
- **Invariants established/updated:**
  - `image_edit` must produce `MediaType.IMAGE` assets
  - `npc_response` must have at least one seed image input
- **Follow-ups:** (todo list for next drift run)

Add a new section like the above each time you do a drift analysis,
instead of overwriting prior entries.

## Notes

- This doc is intentionally process-focused, not implementation-heavy.
  For implementation details of the generation config pipeline, see
  `docs/GENERATION_CONFIG_EVOLUTION.md`.
- Git history remains the ultimate source of truth; this log is a
  human/AI-friendly index of concept changes and their rationale.

