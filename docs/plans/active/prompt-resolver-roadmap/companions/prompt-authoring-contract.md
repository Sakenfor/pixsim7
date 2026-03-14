# Prompt Authoring Contract Discovery

Last updated: 2026-03-14
Owner: prompt-resolver lane

## Purpose

Provide one machine-readable discovery entrypoint so AI agents and UI wizards
can author prompts (families, versions, edits) without crawling backend code.

## Canonical Discovery Endpoint

- `GET /api/v1/prompts/meta/authoring-contract`
- `GET /api/v1/meta/contracts` (global index)

Query params:
- `audience` — optional filter: `"agent"`, `"user"`, or omit for all.

## Contract Payload (v2026-03-14.4)

| Section | Description |
|---------|-------------|
| `endpoints` | All authoring + discovery endpoints (create, list, analyze, apply-edit, search) |
| `workflows` | Plugin-extensible step sequences with `audience`, `consumes`/`outputs` data flow |
| `valid_values` | Canonical values for `prompt_type`, `category`, tag namespace prefixes |
| `pre_authoring_checks` | Discovery steps before authoring (dedup, vocab, ontology) with `contract_ref` |
| `constraints` | Field size limits (max_length, min_length, required) |
| `error_schema` | Standard error response JSON Schema (code, message, detail, fields, request_id) |
| `idempotency` | Retry/duplicate behavior per operation |
| `authoring_modes` | Named modes with `sequence_role` + `generation_hints` |
| `sequence_roles` | Sequence role definitions (initial, continuation, transition) |
| `field_ownership` | Which fields belong to authoring vs metadata |
| `*_request_schema` | JSON Schema for each endpoint's request body |
| `deprecations` | Deprecated fields/patterns |
| `examples` | Worked examples for each workflow |

## Workflow Registry

Workflows are stored in `AuthoringWorkflowRegistry` (singleton at
`services/prompt/authoring_workflow_registry.py`).

Built-in workflows:
- `quick_draft` — create family + version (agent & user)
- `analyzed_authoring` — create family, analyze, persist with analysis (agent & user)
- `continuation` — add version to existing family (agent & user)
- `iterative_edit` — apply structured edits to existing version (agent & user)

Plugins can register additional workflows via `AUTHORING_WORKFLOWS` module
attribute or `get_authoring_workflows()` function. The `WORKFLOWS_REGISTER`
plugin event fires during plugin load.

## Pre-Authoring Checks

The `pre_authoring_checks` section tells consumers what to do before creating:

| Check ID | Purpose | Endpoint | Contract Ref |
|----------|---------|----------|--------------|
| `dedup_families` | Avoid duplicate families | `GET /api/v1/prompts/families` | `prompts.authoring` |
| `dedup_similar` | Find semantically similar prompts | `GET /api/v1/prompts/search/similar` | `prompts.authoring` |
| `discover_tags` | Browse canonical tag vocabulary | `GET /api/v1/block-templates/meta/blocks/tag-dictionary` | `blocks.discovery` |
| `discover_ontology` | Browse ontology concept IDs | `GET /api/v1/dev/ontology/usage` | — |

## Generation Hints

Each authoring mode carries ranked `generation_hints` — the UI/agent picks
the first compatible option based on available assets:

| Mode | Hints (by priority) | Auto-bind |
|------|---------------------|-----------|
| `scene_setup` | t2i → t2v | — |
| `scene_continuation` | i2v → i2i → t2i | `parent_output` |
| `tool_edit` | i2i | `viewer_asset` |
| `patch_edit` | i2i | `parent_output` |
| `variation` | i2i → t2i | `parent_output` |

## Stability Rules

- Treat endpoint response `version` as source of truth for contract revision.
- Keep this document short and high-level; avoid duplicating schema details.
- If schema/flow changes, update endpoint first, then bump `version`, then update this file.

## Key Files

- Endpoint: `pixsim7/backend/main/api/v1/prompts/meta.py`
- Registry: `pixsim7/backend/main/services/prompt/authoring_workflow_registry.py`
- Plugin hooks: `pixsim7/backend/main/services/prompt/authoring_workflow_plugins.py`
- Meta contract registry: `pixsim7/backend/main/services/meta/contract_registry.py`
- Tests: `pixsim7/backend/tests/api/test_prompts_analysis_contract_meta.py`

## Version Log

| Version | Date | Changes |
|---------|------|---------|
| `2026-03-14.4` | 2026-03-14 | Add `generation_hints` to authoring modes, new `patch_edit` + `variation` modes |
| `2026-03-14.3` | 2026-03-14 | Add `constraints`, `error_schema`, `idempotency` sections |
| `2026-03-14.2` | 2026-03-14 | Add `pre_authoring_checks` with tag vocab + ontology discovery, `contract_ref` links |
| `2026-03-14.1` | 2026-03-14 | Add `workflows` (plugin registry), `valid_values`, `sequence_role` on modes, audience filtering |
| `2026-03-13.3` | 2026-03-13 | Initial authoring contract — endpoints, modes, roles, field ownership, examples |
