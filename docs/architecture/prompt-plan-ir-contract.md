# Prompt Plan IR Contract

Last updated: 2026-03-16

## Overview

The Prompt Plan IR (Intermediate Representation) is a typed, versioned data structure
that captures the full provenance of a prompt composition — from primitive resolution
through to final rendered text.

It wraps the existing `ResolutionRequest → ResolutionResult` flow without replacing
it, providing structured records of what was selected, why, and how it was composed.

## IR Schema (v1.0.0)

### Top-Level: `PromptPlanIR`

| Field | Type | Description |
|-------|------|-------------|
| `ir_version` | string | Schema version (semver) |
| `plan_id` | UUID string | Unique plan identity |
| `created_at` | ISO 8601 | Creation timestamp |
| `selected_primitives` | SelectedPrimitiveRecord[] | Primitives chosen by resolver |
| `slots` | SlotRecord[] | Outcome of each template slot |
| `constraints` | ConstraintRecord[] | Constraints and satisfaction status |
| `resolved_tags` | Dict | Merged tag set from all selected primitives |
| `resolved_ontology_ids` | string[] | ConceptRef strings |
| `render_plan` | RenderPlan | Composition and budget details |
| `provenance` | PlanProvenance | Compiler/resolver/template metadata |
| `deterministic_hash` | string | SHA256 of canonical serialization |

### Deterministic Hash Algorithm

1. Serialize the IR to JSON with `sort_keys=True, separators=(",", ":")`
2. Exclude `plan_id`, `created_at`, and `deterministic_hash` from the serialized form
3. Compute SHA256 hex digest of the UTF-8 encoded JSON

This ensures two IRs with identical resolution content produce the same hash,
regardless of when or where they were created.

### Feature Flag

The IR is opt-in via `template_metadata.emit_plan_ir: true`. When disabled (default),
no IR is constructed and the roll response is unchanged.

## Integration Points

- **Template Service** (`template_service.py`): `_roll_template_object` optionally
  builds IR after resolution + composition when the feature flag is set.
- **Evaluator Service** (`evaluator/__init__.py`): Reads `PromptPlanIR.selected_primitives`
  to record per-run contribution records.
- **Generation Manifest**: Plan hash can be stamped onto generation batch items for
  traceability.

## Serialization

- `serialize_ir(ir) → str`: Canonical JSON with sorted keys
- `deserialize_ir(json_str) → PromptPlanIR`: Parse and validate
- `verify_hash(ir) → bool`: Recompute and compare hash

## Migration / Rollout Strategy

1. **Phase 1**: Feature-flagged, dev-only. Enable via template metadata for testing.
2. **Phase 2**: Enable by default for templates that opt in. Attach to roll response.
3. **Phase 3**: Record IR hashes in generation manifests for traceability.
