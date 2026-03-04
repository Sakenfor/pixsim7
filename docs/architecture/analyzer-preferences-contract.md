# Analyzer Preferences Contract

## Scope

This document defines the canonical analyzer preference shape used by frontend and backend.

## Canonical Keys (`_ids`-only)

Stored under `users.preferences.analyzer`:

- `prompt_default_ids: string[]`
- `asset_default_image_ids: string[]`
- `asset_default_video_ids: string[]`
- `asset_intent_default_ids: Record<string, string[]>`
- `analysis_point_default_ids: Record<string, string[]>`
- `analysis_points_custom: Array<Record<string, unknown>>` (optional custom analysis-point metadata)

## Removed Keys

The following keys are no longer part of the typed API/schema contract:

- `prompt_default_id`
- `asset_default_image_id`
- `asset_default_video_id`
- `asset_intent_defaults`
- `analysis_point_defaults`

## Runtime Behavior

- Resolver path (`analyzer_defaults`) resolves defaults only from `_ids` keys.
- `/users/me/preferences` canonicalizes analyzer payloads before validation and response emission.
- Analysis-point default writes in analyzer API persist only `analysis_point_default_ids`.
- Scalar-only legacy preference payloads are ignored and fall back to registry defaults.

## Validation Coverage

Primary tests:

- `pixsim7/backend/main/tests/services/analysis/test_analyzer_defaults.py`
- `pixsim7/backend/main/tests/services/llm/test_ai_hub_resolution.py`
- `pixsim7/backend/main/tests/services/prompt/test_prompt_analysis_local_routing.py`
