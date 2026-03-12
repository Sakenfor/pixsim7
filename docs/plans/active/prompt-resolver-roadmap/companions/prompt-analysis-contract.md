# Prompt Analysis Contract Discovery

Last updated: 2026-03-12
Owner: prompt-resolver lane

## Purpose

Provide one machine-readable discovery entrypoint so AI agents do not need to crawl
multiple backend files to understand prompt analysis behavior.

## Canonical Discovery Endpoint

- `GET /api/v1/prompts/meta/analysis-contract`
- `GET /api/v1/meta/contracts` (global index)

This endpoint returns:

- contract version
- `/api/v1/prompts/analyze` request/response schemas
- analyzer resolution order
- registered prompt analyzers + builtin presets
- deprecations (`provider_hints.prompt_analysis`)
- concrete examples for preview and persistence flows

## Agent Workflow

1. Call `GET /api/v1/prompts/meta/analysis-contract`
   - or enumerate available contracts first via `GET /api/v1/meta/contracts`
2. Validate payload against `request_schema`
3. Call `POST /api/v1/prompts/analyze` for preview analysis
4. Persist via prompt version APIs using canonical `prompt_analysis` field (not provider hints)

## Stability Rules

- Treat endpoint response `version` as source of truth for contract revision.
- Keep this document short and high-level; avoid duplicating schema details.
- If schema/flow changes, update endpoint first, then bump `version`, then update this file.
