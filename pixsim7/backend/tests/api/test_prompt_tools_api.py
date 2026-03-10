"""Prompt tools API scope and execution contract tests."""
from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import pixsim7.backend.main.api.v1.prompt_tools as prompt_tools_module
from pixsim7.backend.main.api.v1.prompt_tools import (
    PromptToolCatalogScope,
    PromptToolExecuteRequest,
    execute_prompt_tool,
    list_prompt_tool_catalog_route,
)
from pixsim7.backend.main.services.prompt.tools import PromptToolPresetRecord


def _user(*, user_id: int, username: str = "user", is_admin: bool = False) -> SimpleNamespace:
    return SimpleNamespace(
        id=user_id,
        username=username,
        is_admin=(lambda: is_admin),
    )


@pytest.mark.asyncio
async def test_catalog_scope_builtin_lists_builtin_presets() -> None:
    result = await list_prompt_tool_catalog_route(
        scope=PromptToolCatalogScope.BUILTIN,
        current_user=_user(user_id=7, username="alice"),
    )

    preset_ids = {preset.id for preset in result.presets}
    assert "rewrite/style-shift" in preset_ids
    assert "compose/reference-merge" in preset_ids
    assert result.scope == "builtin"


@pytest.mark.asyncio
async def test_catalog_scope_self_and_shared_empty_for_phase_one() -> None:
    user = _user(user_id=7, username="alice")
    self_result = await list_prompt_tool_catalog_route(
        scope=PromptToolCatalogScope.SELF,
        current_user=user,
    )
    shared_result = await list_prompt_tool_catalog_route(
        scope=PromptToolCatalogScope.SHARED,
        current_user=user,
    )

    assert self_result.presets == []
    assert shared_result.presets == []


@pytest.mark.asyncio
async def test_catalog_scope_all_includes_builtin_presets() -> None:
    result = await list_prompt_tool_catalog_route(
        scope=PromptToolCatalogScope.ALL,
        current_user=_user(user_id=11, username="owner"),
    )

    preset_ids = {preset.id for preset in result.presets}
    assert "rewrite/style-shift" in preset_ids
    assert "compose/reference-merge" in preset_ids
    assert result.scope == "all"


@pytest.mark.asyncio
async def test_catalog_scope_self_requires_authenticated_user() -> None:
    with pytest.raises(HTTPException) as exc:
        await list_prompt_tool_catalog_route(
            scope=PromptToolCatalogScope.SELF,
            current_user=None,  # type: ignore[arg-type]
        )

    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_execute_invalid_preset_returns_404() -> None:
    with pytest.raises(HTTPException) as exc:
        await execute_prompt_tool(
            request=PromptToolExecuteRequest(
                preset_id="rewrite/missing",
                prompt_text="test prompt",
            ),
            current_user=_user(user_id=7, username="alice"),
        )

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_execute_normalizes_prompt_text_when_handler_omits_field(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        prompt_tools_module,
        "dispatch_prompt_tool_execution",
        lambda **kwargs: {
            "warnings": ["handler omitted prompt text"],
            "provenance": {"model_id": "custom/model"},
        },
    )

    result = await execute_prompt_tool(
        request=PromptToolExecuteRequest(
            preset_id="rewrite/style-shift",
            prompt_text="base prompt",
        ),
        current_user=_user(user_id=7, username="alice"),
    )

    assert result.prompt_text == "base prompt"
    assert result.warnings == ["handler omitted prompt text"]
    assert result.provenance.preset_id == "rewrite/style-shift"
    assert result.provenance.model_id == "custom/model"


@pytest.mark.asyncio
async def test_execute_rejects_foreign_user_owned_preset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    preset = PromptToolPresetRecord(
        id="user/custom-rewrite",
        label="Custom Rewrite",
        description="User-owned rewrite preset",
        source="user",
        category="rewrite",
        enabled=True,
        requires=("text",),
        owner_user_id=99,
        owner_payload={"username": "owner"},
    )
    dispatch_called = {"value": False}

    def _dispatch_stub(**kwargs):
        dispatch_called["value"] = True
        return {"prompt_text": "should not execute"}

    monkeypatch.setattr(
        prompt_tools_module,
        "resolve_prompt_tool_preset",
        lambda **kwargs: preset,
    )
    monkeypatch.setattr(
        prompt_tools_module,
        "dispatch_prompt_tool_execution",
        _dispatch_stub,
    )

    with pytest.raises(HTTPException) as exc:
        await execute_prompt_tool(
            request=PromptToolExecuteRequest(
                preset_id=preset.id,
                prompt_text="base prompt",
            ),
            current_user=_user(user_id=7, username="alice"),
        )

    assert exc.value.status_code == 403
    assert dispatch_called["value"] is False


@pytest.mark.asyncio
async def test_execute_allows_owner_for_user_owned_preset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    preset = PromptToolPresetRecord(
        id="user/custom-rewrite",
        label="Custom Rewrite",
        description="User-owned rewrite preset",
        source="user",
        category="rewrite",
        enabled=True,
        requires=("text",),
        owner_user_id=7,
        owner_payload={"username": "alice"},
    )

    monkeypatch.setattr(
        prompt_tools_module,
        "resolve_prompt_tool_preset",
        lambda **kwargs: preset,
    )
    monkeypatch.setattr(
        prompt_tools_module,
        "dispatch_prompt_tool_execution",
        lambda **kwargs: {
            "prompt_text": "owner execution result",
            "provenance": {},
        },
    )

    result = await execute_prompt_tool(
        request=PromptToolExecuteRequest(
            preset_id=preset.id,
            prompt_text="base prompt",
        ),
        current_user=_user(user_id=7, username="alice"),
    )

    assert result.prompt_text == "owner execution result"
    assert result.provenance.preset_id == preset.id
