# EP-01.0 Claude Execution Prompt

Task ID: `EP-01.0`  
Program: Extension Platform Unification  
Date: March 5, 2026

## Copy-Paste Prompt (for Claude)

```md
You are implementing EP-01.0 from the extension-platform tracker.

Objective:
Produce a concrete analyzer ID format migration plan that bridges current analyzer IDs (`<target>:<name>`) to canonical extension identity (`<kind>:<scope>.<owner>/<name>[@<version>]`) without breaking existing runtime behavior.

Why this exists:
- EP-01.1 identity adapter attempt was reverted.
- Current analyzer IDs (`prompt:simple`, `asset:object-detection`) are not extension IDs.
- Applying `parse_extension_identity(... expected_kind="analyzer")` directly to analyzer IDs is semantically wrong.

Scope (in):
1. Design and document migration strategy.
2. Inventory impacted backend and frontend surfaces.
3. Define compatibility/alias policy and phased rollout.
4. Define acceptance tests and rollout gates.

Scope (out):
1. No DB migrations in this task.
2. No runtime rewires in this task.
3. No API behavior changes in this task.

Deliverables (required):
1. New architecture doc:
   - `docs/architecture/analyzer-id-format-migration-plan.md`
2. Tracker update:
   - update `docs/architecture/extension-platform-program-tracker.md` with EP-01.0 progress and next step handoff.
3. Optional appendix:
   - compatibility matrix table in the migration doc.

Migration plan must answer:
1. Canonical mapping model:
   - what canonical field(s) are introduced
   - whether `analyzer_id` stays as runtime key during transition
2. Compatibility strategy:
   - dual-read/write plan
   - alias resolution order
   - handling of legacy `parser:*`, `llm:*`, and current `prompt:*`/`asset:*`
3. Data model implications:
   - analyzer definitions
   - analyzer presets
   - analyzer instances
   - preferences keys storing analyzer IDs
4. API contract implications:
   - what remains unchanged in v1
   - what new optional metadata fields can be introduced safely
5. Rollout phases:
   - phase A (no behavior change)
   - phase B (dual identity)
   - phase C (canonical-first with legacy fallback)
   - phase D (deprecation criteria)
6. Test plan:
   - unit vectors
   - integration vectors
   - regression vectors for prompt + asset analyzers
7. Risk controls:
   - feature flags
   - observability counters
   - rollback strategy

Constraints:
1. Do not propose direct replacement of registry runtime keys in one cut.
2. Keep backward compatibility first.
3. Reuse existing analyzer registry concepts (`resolve_legacy`, `is_legacy`) rather than replacing them abruptly.

Acceptance criteria:
1. Migration plan is implementation-ready and references concrete files/tables/endpoints.
2. Plan explicitly explains why analyzer IDs and extension IDs are different and how to bridge them.
3. EP-01 can be unblocked by following the documented sequence.
4. Tracker reflects updated status and next actionable engineering slice (EP-01.1R or equivalent).

Output format:
1. Summary of key decisions.
2. Link to created migration doc.
3. Proposed next coding task prompt derived from the migration plan.
```

## Reviewer Checklist

1. Plan distinguishes analyzer runtime IDs from extension identity.
2. No implicit breaking migration is suggested.
3. Preferences, presets, instances, and definitions are all covered.
4. Rollout includes observability and rollback.

## Suggested Research Files

- `pixsim7/backend/main/services/prompt/parser/registry.py`
- `pixsim7/backend/main/services/analysis/analyzer_definition_service.py`
- `pixsim7/backend/main/services/analysis/analyzer_instance_service.py`
- `pixsim7/backend/main/services/analysis/analyzer_preset_service.py`
- `pixsim7/backend/main/api/v1/analyzers.py`
- `apps/main/src/lib/analyzers/`
- `apps/main/src/features/settings/components/modules/`
