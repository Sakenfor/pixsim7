"""Prompt analysis contract metadata endpoint tests."""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from pixsim7.backend.main.api.v1.prompts.meta import (
    PROMPT_ANALYSIS_CONTRACT_VERSION,
    get_prompt_analysis_contract,
)


def _user_with_defaults(default_ids: list[str] | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=7,
        username="alice",
        preferences={"analyzer": {"prompt_default_ids": default_ids or []}},
    )


@pytest.mark.asyncio
async def test_prompt_analysis_contract_exposes_endpoint_schema_and_analyzers() -> None:
    result = await get_prompt_analysis_contract(current_user=_user_with_defaults(["prompt:openai"]))

    assert result.version == PROMPT_ANALYSIS_CONTRACT_VERSION
    assert result.endpoint == "/api/v1/prompts/analyze"
    assert "properties" in result.request_schema
    assert "text" in result.request_schema["properties"]
    assert "properties" in result.response_schema
    assert "analysis" in result.response_schema["properties"]
    assert any(analyzer.id == "prompt:simple" for analyzer in result.prompt_analyzers)


@pytest.mark.asyncio
async def test_prompt_analysis_contract_includes_deprecation_and_user_default_note() -> None:
    result = await get_prompt_analysis_contract(current_user=_user_with_defaults(["prompt:local"]))

    assert any(
        item.get("field") == "provider_hints.prompt_analysis" for item in result.deprecations
    )
    user_default_step = next(
        step for step in result.analyzer_resolution_order
        if step.key == "user.preferences.analyzer.prompt_default_ids"
    )
    assert "prompt:local" in user_default_step.description
