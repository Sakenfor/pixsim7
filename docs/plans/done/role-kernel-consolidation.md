# Role Kernel Consolidation Task (Claude Handoff)

Status: Planned  
Owner: Next agent (Claude)  
Scope: Prompt/block role stack only (no analyzer/domain changes)

## Goal
Consolidate prompt-role and composition-role behavior around one runtime authority (VocabularyRegistry + Concepts API), while removing or shrinking legacy duplicated mappings that can drift.

## Why This Exists
Current stack has overlap:

1. Hardcoded composition-role inference tables in backend.
2. Rich fallback defaults in prompt role registry (beyond minimal bootstrap).
3. Deprecated `role` alias still carried in block template matrix APIs.
4. Composition role codegen reads `starter_pack/roles.yaml` directly instead of plugin-merged authority.

This creates parallel truth paths and drift risk.

## Non-Goals

- No analyzer refactor.
- No UI redesign.
- No behavior change to prompt parser scoring logic, except source-of-truth cleanup.
- No migration of archived prompt content packs in this task.

## Source-of-Truth Target

Runtime authority:

- `pixsim7/backend/main/shared/ontology/vocabularies/registry.py`
- `/api/v1/concepts/role`
- `/api/v1/concepts/prompt_role` (or equivalent concepts API kind routing)

Generated TS files are fallback/type artifacts only, not primary runtime authority.

## Work Plan (Ordered)

### 1) Replace hardcoded composition inference tables

Files:

- `pixsim7/backend/main/services/prompt/block/composition_role_inference.py`
- `pixsim7/backend/main/shared/composition.py`
- `pixsim7/backend/tests/test_composition_role_inference.py`

Tasks:

1. Rework inference to use registry-driven mappings first:
   - prompt-role -> composition-role map
   - tag slug/namespace mappings
   - role aliases/priority
2. Keep only a minimal fallback map for safety (small, explicitly marked).
3. Remove large static mapping tables that mirror vocab content.
4. Update tests to assert registry-driven behavior and minimal fallback only.

Acceptance:

- Inference works with plugin-contributed role mappings without code edits.
- No large hardcoded role/category mapping table remains.

### 2) Slim prompt role registry fallback

Files:

- `pixsim7/backend/main/services/prompt/role_registry.py`
- `pixsim7/backend/tests/test_prompt_parser_authority.py`
- `pixsim7/backend/tests/test_prompt_role_pack_authority.py`

Tasks:

1. Keep bootstrap fallback minimal (`other` and minimal safe defaults only).
2. Remove rich hardcoded role descriptions/priorities as primary behavior.
3. Ensure normal path is vocab-driven (`registry.all_prompt_roles()`).
4. Preserve backward safety if vocab load fails.

Acceptance:

- Prompt role behavior remains stable when vocab is present.
- Fallback path is tiny and explicit.

### 3) Finish `composition_role` canonicalization in block APIs

Files:

- `pixsim7/backend/main/api/v1/block_templates.py`
- `packages/shared/api/client/src/domains/blockTemplates.ts`
- `apps/main/src/lib/api/blockTemplates.ts`

Tasks:

1. Keep reading `role` only as compatibility input for one deprecation window.
2. Canonicalize internally to `composition_role`.
3. Stop emitting duplicated `role` in response payloads where safe.
4. Add deprecation note in API docs/comments and client types.

Acceptance:

- Matrix/filter functionality works with `composition_role`.
- Legacy `role` still accepted short-term, but not primary in responses/docs.

### 4) Fix composition-role codegen input authority

Files:

- `tools/codegen/generate-composition-roles.ts`
- `tools/codegen/README.md`
- `packages/shared/types/src/composition-roles.generated.ts` (regenerated)

Tasks:

1. Change generator input from direct `starter_pack/roles.yaml` to plugin-merged role authority (same merge rules as runtime).
2. Fail generation on duplicate role IDs across packs (same behavior class as prompt role generator).
3. Keep output as core fallback/types artifact.
4. Update docs/readme for new source rules.

Acceptance:

- Generated file matches runtime merged role space (for enabled packs in repo).
- CI check mode catches drift reliably.

## Suggested PR Slicing

1. PR-A: inference cleanup + tests
2. PR-B: prompt role fallback slimdown + parser authority tests
3. PR-C: API canonicalization (`composition_role` primary)
4. PR-D: composition codegen authority update + regenerated artifacts

## Validation Checklist

Run at minimum:

1. `pytest -q pixsim7/backend/tests/test_composition.py pixsim7/backend/tests/test_composition_role_inference.py pixsim7/backend/tests/test_prompt_parser_authority.py pixsim7/backend/tests/test_prompt_role_pack_authority.py`
2. `pnpm prompt-roles:check`
3. `pnpm composition-roles:check`

Optional smoke:

1. Hit block matrix endpoint with `composition_role` filter.
2. Confirm frontend role lookups still load via `compositionPackageStore`.

## Risks and Guards

Risks:

1. Hidden dependencies on legacy `role` response fields.
2. Parser behavior shift if vocab is unavailable in local dev.
3. Plugin merge ordering differences between runtime and codegen.

Guards:

1. Keep compatibility alias read path during deprecation window.
2. Keep tiny fallback for parser bootstrap.
3. Add parity tests: runtime registry roles vs generated roles (for core set).

## Done Criteria

Task is done when:

1. Role inference is registry-first with minimal fallback only.
2. Prompt roles are vocab-driven; legacy defaults are reduced to bootstrap.
3. `composition_role` is canonical across block matrix API usage.
4. Composition role codegen uses merged authority, not single-file starter source.
