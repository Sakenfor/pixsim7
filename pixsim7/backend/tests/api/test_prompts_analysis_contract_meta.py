"""Prompt analysis contract metadata endpoint tests."""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from pixsim7.backend.main.api.v1.prompts.meta import (
    PROMPT_ANALYSIS_CONTRACT_VERSION,
    PROMPT_AUTHORING_CONTRACT_VERSION,
    get_prompt_analysis_contract,
    get_prompt_authoring_contract,
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


@pytest.mark.asyncio
async def test_prompt_authoring_contract_exposes_family_version_and_analyze_schemas() -> None:
    result = await get_prompt_authoring_contract(current_user=_user_with_defaults())

    assert result.version == PROMPT_AUTHORING_CONTRACT_VERSION
    assert "properties" in result.create_family_request_schema
    assert "title" in result.create_family_request_schema["properties"]
    assert "properties" in result.create_version_request_schema
    assert "prompt_text" in result.create_version_request_schema["properties"]
    assert "properties" in result.apply_edit_request_schema
    assert "edit_ops" in result.apply_edit_request_schema["properties"]
    assert "properties" in result.analyze_request_schema
    assert "text" in result.analyze_request_schema["properties"]
    assert any(endpoint.id == "prompts.create_version" for endpoint in result.endpoints)
    assert any(endpoint.id == "prompts.apply_edit" for endpoint in result.endpoints)


@pytest.mark.asyncio
async def test_prompt_authoring_contract_has_modes_roles_and_deprecation() -> None:
    result = await get_prompt_authoring_contract(current_user=_user_with_defaults())

    assert any(mode.id == "scene_setup" for mode in result.authoring_modes)
    assert any(mode.id == "scene_continuation" for mode in result.authoring_modes)
    assert any(role.id == "initial" for role in result.sequence_roles)
    assert any(role.id == "continuation" for role in result.sequence_roles)
    assert any(
        item.get("field") == "provider_hints.prompt_analysis" for item in result.deprecations
    )
    assert any(item.get("field") == "prompt_text" for item in result.field_ownership)
    assert any(
        item.get("field") == "prompt_analysis.authoring.history[].edit_ops"
        for item in result.field_ownership
    )
