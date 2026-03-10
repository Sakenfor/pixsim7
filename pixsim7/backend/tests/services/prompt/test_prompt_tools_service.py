"""Prompt tools service catalog scope and permission tests."""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException

import pixsim7.backend.main.services.prompt.tools.service as prompt_tool_service_module
from pixsim7.backend.main.services.prompt.tools.service import list_prompt_tool_catalog


def _user(*, user_id: int, username: str = "user", is_admin: bool = False) -> SimpleNamespace:
    return SimpleNamespace(
        id=user_id,
        username=username,
        is_admin=(lambda: is_admin),
    )


def _row(
    *,
    owner_user_id: int,
    preset_id: str,
    label: str = "Preset",
    is_public: bool = False,
) -> Any:
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        preset_id=preset_id,
        label=label,
        description=f"{label} description",
        category="rewrite",
        enabled=True,
        requires=["text"],
        defaults={"mode": "append"},
        owner_user_id=owner_user_id,
        owner_payload={"username": f"user-{owner_user_id}"},
        is_public=is_public,
        updated_at=now,
    )


class _PresetServiceCapture:
    def __init__(self, results: list[list[Any]]):
        self.calls: list[dict[str, Any]] = []
        self._results = results

    async def list_presets(self, **kwargs):
        self.calls.append(dict(kwargs))
        index = len(self.calls) - 1
        if index < len(self._results):
            return self._results[index]
        return []


@pytest.mark.asyncio
async def test_catalog_scope_builtin_includes_builtin_registry() -> None:
    result = await list_prompt_tool_catalog(
        scope="builtin",
        current_user=_user(user_id=7),
        db=object(),
    )

    preset_ids = {preset.id for preset in result}
    assert "rewrite/style-shift" in preset_ids
    assert "compose/reference-merge" in preset_ids


@pytest.mark.asyncio
async def test_catalog_scope_self_uses_owner_scope(monkeypatch: pytest.MonkeyPatch) -> None:
    capture = _PresetServiceCapture(
        results=[
            [_row(owner_user_id=7, preset_id="user/self-only", label="Self")],
        ]
    )
    monkeypatch.setattr(prompt_tool_service_module, "PromptToolPresetService", lambda _db: capture)

    result = await list_prompt_tool_catalog(
        scope="self",
        current_user=_user(user_id=7, username="alice"),
        db=object(),
    )

    assert len(capture.calls) == 1
    assert capture.calls[0]["owner_user_id"] == 7
    assert capture.calls[0]["is_public"] is None
    assert capture.calls[0]["include_public_for_owner"] is False
    assert result[0].id == "user/self-only"
    assert result[0].source == "user"


@pytest.mark.asyncio
async def test_catalog_scope_shared_uses_public_scope(monkeypatch: pytest.MonkeyPatch) -> None:
    capture = _PresetServiceCapture(
        results=[
            [_row(owner_user_id=99, preset_id="user/shared-only", label="Shared", is_public=True)],
        ]
    )
    monkeypatch.setattr(prompt_tool_service_module, "PromptToolPresetService", lambda _db: capture)

    result = await list_prompt_tool_catalog(
        scope="shared",
        current_user=_user(user_id=7, username="alice"),
        db=object(),
    )

    assert len(capture.calls) == 1
    assert capture.calls[0]["owner_user_id"] is None
    assert capture.calls[0]["is_public"] is True
    assert result[0].id == "user/shared-only"
    assert result[0].source == "shared"


@pytest.mark.asyncio
async def test_catalog_scope_all_dedupes_self_and_shared_overlap(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    self_row = _row(owner_user_id=7, preset_id="user/overlap", label="Overlap", is_public=True)
    shared_overlap = _row(owner_user_id=7, preset_id="user/overlap", label="Overlap", is_public=True)
    shared_unique = _row(owner_user_id=99, preset_id="user/shared-extra", label="SharedExtra", is_public=True)
    capture = _PresetServiceCapture(results=[[self_row], [shared_overlap, shared_unique]])
    monkeypatch.setattr(prompt_tool_service_module, "PromptToolPresetService", lambda _db: capture)

    result = await list_prompt_tool_catalog(
        scope="all",
        current_user=_user(user_id=7, username="alice"),
        db=object(),
    )

    assert len(capture.calls) == 2
    assert capture.calls[0]["owner_user_id"] == 7
    assert capture.calls[1]["owner_user_id"] is None
    ids = [preset.id for preset in result]
    assert ids.count("user/overlap") == 1
    assert "user/shared-extra" in ids
    assert "rewrite/style-shift" in ids
    assert "compose/reference-merge" in ids


@pytest.mark.asyncio
async def test_catalog_scope_self_requires_authentication() -> None:
    with pytest.raises(HTTPException) as exc:
        await list_prompt_tool_catalog(
            scope="self",
            current_user=None,
            db=object(),
        )
    assert exc.value.status_code == 401
