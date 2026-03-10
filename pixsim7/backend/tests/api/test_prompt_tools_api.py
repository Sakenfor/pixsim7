"""Prompt tools API scope, CRUD, and execution contract tests."""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

import pixsim7.backend.main.api.v1.prompt_tools as prompt_tools_module
from pixsim7.backend.main.api.v1.prompt_tools import (
    PromptToolCatalogScope,
    PromptToolExecuteRequest,
    PromptToolPresetCreateRequest,
    create_prompt_tool_preset_route,
    delete_prompt_tool_preset_route,
    execute_prompt_tool,
    get_prompt_tool_preset_route,
    list_prompt_tool_catalog_route,
)
from pixsim7.backend.main.domain.prompt import PromptToolPreset
from pixsim7.backend.main.services.prompt.tools import PromptToolPresetRecord


class _DummyDB:
    def __init__(self) -> None:
        self.commits = 0

    async def commit(self) -> None:
        self.commits += 1


def _user(*, user_id: int, username: str = "user", is_admin: bool = False) -> SimpleNamespace:
    return SimpleNamespace(
        id=user_id,
        username=username,
        is_admin=(lambda: is_admin),
    )


def _preset_row(
    *,
    row_id: UUID | None = None,
    owner_user_id: int = 7,
    preset_id: str = "user/custom-rewrite",
    label: str = "Custom Rewrite",
    description: str = "User-owned rewrite preset",
    category: str = "rewrite",
    enabled: bool = True,
    is_public: bool = False,
) -> PromptToolPreset:
    now = datetime.now(timezone.utc)
    return PromptToolPreset(
        id=row_id or uuid4(),
        owner_user_id=owner_user_id,
        preset_id=preset_id,
        label=label,
        description=description,
        category=category,
        enabled=enabled,
        is_public=is_public,
        requires=["text"],
        defaults={"mode": "append"},
        owner_payload={"username": "alice" if owner_user_id == 7 else "owner"},
        created_at=now,
        updated_at=now,
    )


@pytest.mark.asyncio
async def test_catalog_scope_builtin_lists_builtin_presets() -> None:
    result = await list_prompt_tool_catalog_route(
        scope=PromptToolCatalogScope.BUILTIN,
        current_user=_user(user_id=7, username="alice"),
        db=_DummyDB(),
    )

    preset_ids = {preset.id for preset in result.presets}
    assert "rewrite/style-shift" in preset_ids
    assert "compose/reference-merge" in preset_ids
    assert result.scope == "builtin"


@pytest.mark.asyncio
async def test_catalog_scope_self_and_shared_pass_through(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    async def _catalog_stub(**kwargs):
        calls.append(kwargs["scope"])
        return []

    monkeypatch.setattr(prompt_tools_module, "list_prompt_tool_catalog", _catalog_stub)
    user = _user(user_id=7, username="alice")
    self_result = await list_prompt_tool_catalog_route(
        scope=PromptToolCatalogScope.SELF,
        current_user=user,
        db=_DummyDB(),
    )
    shared_result = await list_prompt_tool_catalog_route(
        scope=PromptToolCatalogScope.SHARED,
        current_user=user,
        db=_DummyDB(),
    )

    assert calls == ["self", "shared"]
    assert self_result.presets == []
    assert shared_result.presets == []


@pytest.mark.asyncio
async def test_catalog_scope_self_requires_authenticated_user() -> None:
    with pytest.raises(HTTPException) as exc:
        await list_prompt_tool_catalog_route(
            scope=PromptToolCatalogScope.SELF,
            current_user=None,  # type: ignore[arg-type]
            db=_DummyDB(),
        )

    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_execute_invalid_preset_returns_404(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _resolve_stub(**kwargs):
        return None

    monkeypatch.setattr(prompt_tools_module, "resolve_prompt_tool_preset", _resolve_stub)

    with pytest.raises(HTTPException) as exc:
        await execute_prompt_tool(
            request=PromptToolExecuteRequest(
                preset_id="rewrite/missing",
                prompt_text="test prompt",
            ),
            current_user=_user(user_id=7, username="alice"),
            db=_DummyDB(),
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
        db=_DummyDB(),
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

    async def _resolve_stub(**kwargs):
        return preset

    def _dispatch_stub(**kwargs):
        dispatch_called["value"] = True
        return {"prompt_text": "should not execute"}

    monkeypatch.setattr(prompt_tools_module, "resolve_prompt_tool_preset", _resolve_stub)
    monkeypatch.setattr(prompt_tools_module, "dispatch_prompt_tool_execution", _dispatch_stub)

    with pytest.raises(HTTPException) as exc:
        await execute_prompt_tool(
            request=PromptToolExecuteRequest(
                preset_id=preset.id,
                prompt_text="base prompt",
            ),
            current_user=_user(user_id=7, username="alice"),
            db=_DummyDB(),
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

    async def _resolve_stub(**kwargs):
        return preset

    monkeypatch.setattr(prompt_tools_module, "resolve_prompt_tool_preset", _resolve_stub)
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
        db=_DummyDB(),
    )

    assert result.prompt_text == "owner execution result"
    assert result.provenance.preset_id == preset.id


@pytest.mark.asyncio
async def test_create_preset_route_commits_and_returns_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = _preset_row()

    async def _create_stub(**kwargs):
        return row

    monkeypatch.setattr(prompt_tools_module, "create_prompt_tool_preset", _create_stub)
    db = _DummyDB()

    response = await create_prompt_tool_preset_route(
        request=PromptToolPresetCreateRequest(
            preset_id=row.preset_id,
            label=row.label,
            description=row.description,
            category=row.category,
            enabled=True,
            requires=["text"],
            defaults={"mode": "append"},
            is_public=False,
        ),
        current_user=_user(user_id=7, username="alice"),
        db=db,
    )

    assert db.commits == 1
    assert response.entry_id == row.id
    assert response.id == row.preset_id
    assert response.owner_user_id == 7
    assert response.owner_username == "alice"


@pytest.mark.asyncio
async def test_get_preset_route_not_found_returns_404(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _get_stub(**kwargs):
        return None

    monkeypatch.setattr(prompt_tools_module, "get_prompt_tool_preset", _get_stub)

    with pytest.raises(HTTPException) as exc:
        await get_prompt_tool_preset_route(
            entry_id=uuid4(),
            current_user=_user(user_id=7, username="alice"),
            db=_DummyDB(),
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_delete_preset_route_returns_204_and_commits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _delete_stub(**kwargs):
        return True

    monkeypatch.setattr(prompt_tools_module, "delete_prompt_tool_preset", _delete_stub)
    db = _DummyDB()

    response = await delete_prompt_tool_preset_route(
        entry_id=uuid4(),
        current_user=_user(user_id=7, username="alice"),
        db=db,
    )

    assert db.commits == 1
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_delete_preset_route_not_found_returns_404(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _delete_stub(**kwargs):
        return False

    monkeypatch.setattr(prompt_tools_module, "delete_prompt_tool_preset", _delete_stub)
    db = _DummyDB()

    with pytest.raises(HTTPException) as exc:
        await delete_prompt_tool_preset_route(
            entry_id=uuid4(),
            current_user=_user(user_id=7, username="alice"),
            db=db,
        )
    assert exc.value.status_code == 404
    assert db.commits == 0
