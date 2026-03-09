# Analyzer + AI Hub LLM Resolution Policy

## Goal

Prevent runtime drift between AI Hub and analyzer-backed LLM execution by enforcing one provider/model fallback policy in `AiHubService`.

## Single Runtime Authority

- Runtime resolver: `pixsim7/backend/main/services/llm/ai_hub_service.py`
- Core method: `AiHubService._resolve_provider_and_model(...)`
- Execution entrypoint: `AiHubService.execute_prompt(...)`

Prompt analyzers now delegate to this runtime path via:

- `PromptAnalysisService._run_analyzer(...)`
- `analyze_prompt_with_llm(..., db=..., user_id=...)`

## Resolution Rules (enforced)

1. If `model_id` is known in AI model catalog and `provider_id` is missing, infer provider from model.
2. If both provider and model are present but conflict, provider wins and model is replaced with provider default.
3. If provider is known and model is missing, use provider default model map.
4. Only when both provider and model are missing, use AI-model capability default (`PROMPT_EDIT`).
5. If still unresolved, fallback to `openai-llm` + provider default model map.

## Why this avoids drift

- Analyzer calls are provider-bound (from analyzer pipeline), so they no longer accidentally inherit unrelated global capability models.
- AI Hub interactive calls still support global AI-model defaults when users do not specify provider/model.
- Both paths share identical credential and instance-config injection behavior through `execute_prompt(...)`.

## Tests

Policy coverage lives in:

- `pixsim7/backend/tests/services/llm/test_ai_hub_resolution.py`

Regression coverage for prompt analyzer routing remains in:

- `pixsim7/backend/tests/services/prompt/test_prompt_analysis_local_routing.py`

## Analyzer Preference Contract (`_ids`-only)

As of **March 4, 2026**, analyzer preference storage and API contracts are `_ids`-only.

Canonical keys:

- `prompt_default_ids: string[]`
- `asset_default_image_ids: string[]`
- `asset_default_video_ids: string[]`
- `asset_intent_default_ids: Record<string, string[]>`
- `analysis_point_default_ids: Record<string, string[]>`

Removed legacy scalar keys:

- `prompt_default_id`
- `asset_default_image_id`
- `asset_default_video_id`
- `asset_intent_defaults`
- `analysis_point_defaults`

Implementation notes:

- `/users/me/preferences` canonicalizes analyzer preferences before validation/response.
- Resolver logic reads only canonical `_ids` keys.
- Analysis point default persistence writes only `analysis_point_default_ids`.
- Legacy scalar keys are stripped and ignored by canonicalization.
