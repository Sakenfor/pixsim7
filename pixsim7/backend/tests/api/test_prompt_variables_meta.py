from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException

from pixsim7.backend.main.api.v1.prompts.meta import (
    RenamePromptVariableRequest,
    UpsertPromptVariableRequest,
    delete_prompt_variable,
    list_prompt_variables,
    rename_prompt_variable,
    upsert_prompt_variable,
)


@dataclass
class _FakeUser:
    id: int
    preferences: dict[str, Any]


class _FakeUserService:
    def __init__(self, user: _FakeUser):
        self._user = user

    async def get_user(self, user_id: int) -> _FakeUser:
        assert user_id == self._user.id
        return self._user

    async def update_user(self, user_id: int, **updates: Any) -> _FakeUser:
        assert user_id == self._user.id
        if "preferences" in updates:
            self._user.preferences = dict(updates["preferences"] or {})
        return self._user


def _principal(user_id: int = 11) -> SimpleNamespace:
    return SimpleNamespace(id=user_id, user_id=user_id)


@pytest.mark.asyncio
async def test_list_prompt_variables_returns_canonical_sorted_names() -> None:
    svc = _FakeUserService(
        _FakeUser(id=11, preferences={"prompt_variables": ["actor1", "GOAL", "ACTOR1", "SCENE_2"]})
    )

    response = await list_prompt_variables(principal=_principal(), user_service=svc)
    assert [item.name for item in response.variables] == ["ACTOR1", "GOAL", "SCENE_2"]


@pytest.mark.asyncio
async def test_upsert_prompt_variable_adds_uppercase_name() -> None:
    svc = _FakeUserService(_FakeUser(id=11, preferences={"prompt_variables": ["GOAL"]}))

    response = await upsert_prompt_variable(
        request=UpsertPromptVariableRequest(name="actor1"),
        principal=_principal(),
        user_service=svc,
    )

    assert [item.name for item in response.variables] == ["ACTOR1", "GOAL"]


@pytest.mark.asyncio
async def test_upsert_prompt_variable_duplicate_requires_allow_existing() -> None:
    svc = _FakeUserService(_FakeUser(id=11, preferences={"prompt_variables": ["ACTOR1"]}))

    with pytest.raises(HTTPException) as exc:
        await upsert_prompt_variable(
            request=UpsertPromptVariableRequest(name="ACTOR1"),
            principal=_principal(),
            user_service=svc,
        )
    assert exc.value.status_code == 409

    response = await upsert_prompt_variable(
        request=UpsertPromptVariableRequest(name="ACTOR1", allow_existing=True),
        principal=_principal(),
        user_service=svc,
    )
    assert [item.name for item in response.variables] == ["ACTOR1"]


@pytest.mark.asyncio
async def test_rename_prompt_variable_updates_name() -> None:
    svc = _FakeUserService(_FakeUser(id=11, preferences={"prompt_variables": ["ACTOR1", "GOAL"]}))

    response = await rename_prompt_variable(
        name="ACTOR1",
        request=RenamePromptVariableRequest(new_name="SCENE"),
        principal=_principal(),
        user_service=svc,
    )
    assert [item.name for item in response.variables] == ["GOAL", "SCENE"]


@pytest.mark.asyncio
async def test_rename_prompt_variable_rejects_duplicate_target() -> None:
    svc = _FakeUserService(_FakeUser(id=11, preferences={"prompt_variables": ["ACTOR1", "GOAL"]}))

    with pytest.raises(HTTPException) as exc:
        await rename_prompt_variable(
            name="ACTOR1",
            request=RenamePromptVariableRequest(new_name="GOAL"),
            principal=_principal(),
            user_service=svc,
        )
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_delete_prompt_variable_removes_name() -> None:
    svc = _FakeUserService(_FakeUser(id=11, preferences={"prompt_variables": ["ACTOR1", "GOAL"]}))

    response = await delete_prompt_variable(
        name="ACTOR1",
        principal=_principal(),
        user_service=svc,
    )
    assert [item.name for item in response.variables] == ["GOAL"]


@pytest.mark.asyncio
async def test_prompt_variables_require_effective_user() -> None:
    svc = _FakeUserService(_FakeUser(id=11, preferences={}))
    principal = SimpleNamespace(id=0, user_id=None)

    with pytest.raises(HTTPException) as exc:
        await list_prompt_variables(principal=principal, user_service=svc)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_upsert_prompt_variable_persists_description() -> None:
    user = _FakeUser(id=11, preferences={})
    svc = _FakeUserService(user)

    response = await upsert_prompt_variable(
        request=UpsertPromptVariableRequest(name="actor1", description="  the   protagonist  "),
        principal=_principal(),
        user_service=svc,
    )

    entry = next(item for item in response.variables if item.name == "ACTOR1")
    assert entry.description == "the protagonist"
    # Persisted as object shape, not a bare string.
    assert user.preferences["prompt_variables"] == [{"name": "ACTOR1", "description": "the protagonist"}]


@pytest.mark.asyncio
async def test_upsert_allow_existing_updates_description() -> None:
    svc = _FakeUserService(
        _FakeUser(
            id=11,
            preferences={"prompt_variables": [{"name": "ACTOR1", "description": "old"}]},
        )
    )

    response = await upsert_prompt_variable(
        request=UpsertPromptVariableRequest(name="ACTOR1", description="new", allow_existing=True),
        principal=_principal(),
        user_service=svc,
    )
    entry = next(item for item in response.variables if item.name == "ACTOR1")
    assert entry.description == "new"


@pytest.mark.asyncio
async def test_rename_prompt_variable_preserves_description() -> None:
    svc = _FakeUserService(
        _FakeUser(
            id=11,
            preferences={"prompt_variables": [{"name": "ACTOR1", "description": "lead"}]},
        )
    )

    response = await rename_prompt_variable(
        name="ACTOR1",
        request=RenamePromptVariableRequest(new_name="HERO"),
        principal=_principal(),
        user_service=svc,
    )
    entry = next(item for item in response.variables if item.name == "HERO")
    assert entry.description == "lead"


@pytest.mark.asyncio
async def test_list_prompt_variables_canonicalizes_legacy_string_entries() -> None:
    # Legacy payloads stored bare strings; they should read back as objects.
    svc = _FakeUserService(
        _FakeUser(id=11, preferences={"prompt_variables": ["goal", "ACTOR1"]})
    )

    response = await list_prompt_variables(principal=_principal(), user_service=svc)
    assert [(item.name, item.description) for item in response.variables] == [
        ("ACTOR1", None),
        ("GOAL", None),
    ]

