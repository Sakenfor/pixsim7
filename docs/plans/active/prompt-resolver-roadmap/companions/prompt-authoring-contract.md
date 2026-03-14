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

## Contract Payload (v2026-03-14.3)

| Section | Description |
|---------|-------------|
| Section | Description |
|---------|-------------|
| `endpoints` | All authoring + discovery endpoints (create, list, analyze, apply-edit, search) |
| `workflows` | Plugin-extensible step sequences with `audience`, `consumes`/`outputs` data flow |
| `valid_values` | Canonical values for `prompt_type`, `category`, tag namespace prefixes |
| `pre_authoring_checks` | Discovery steps before authoring (dedup, vocab, ontology) |
| `constraints` | Field size limits (max_length, min_length, required) |
| `error_schema` | Standard error response JSON Schema (code, message, detail, fields, request_id) |
| `idempotency` | Retry/duplicate behavior per operation |
| `authoring_modes` | Named authoring modes with `sequence_role` mapping |
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

## Pre-Authoring Checks (v2026-03-14.2)

The `pre_authoring_checks` section tells consumers what to do before creating:

| Check ID | Purpose | Endpoint |
|----------|---------|----------|
| `dedup_families` | Avoid duplicate families | `GET /api/v1/prompts/families` |
| `dedup_similar` | Find semantically similar prompts | `GET /api/v1/prompts/search/similar` |
| `discover_tags` | Browse canonical tag vocabulary | `GET /api/v1/block-templates/meta/blocks/tag-dictionary` |
| `discover_ontology` | Browse ontology concept IDs | `GET /api/v1/dev/ontology/usage` |

Each check includes `when` guidance and `example_params`.

## Completed Work

All 8 original suggestions implemented:

1. [x] Dynamic workflow sequences (plugin-extensible registry)
2. [x] Valid values for prompt_type/category/tag namespaces
3. [x] Tag vocabulary + ontology discovery endpoints
4. [x] Error shape contract (ErrorResponse JSON Schema)
5. [x] Size/limit constraints (field max_length, min_length, required)
6. [x] Authoring mode → sequence role mapping
7. [x] Pre-authoring checks (dedup + vocab discovery)
8. [x] Idempotency guidance (slug uniqueness, retry behavior per operation)
9. [x] Audience filtering (agent/user) on workflows

## Stability Rules

- Treat endpoint response `version` as source of truth for contract revision.
- Keep this document short and high-level; avoid duplicating schema details.
- If schema/flow changes, update endpoint first, then bump `version`, then update this file.

## Key Files

- Endpoint: `pixsim7/backend/main/api/v1/prompts/meta.py`
- Registry: `pixsim7/backend/main/services/prompt/authoring_workflow_registry.py`
- Plugin hooks: `pixsim7/backend/main/services/prompt/authoring_workflow_plugins.py`
- Tests: `pixsim7/backend/tests/api/test_prompts_analysis_contract_meta.py`
