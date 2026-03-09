from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

import pixsim7.backend.main.api.v1.block_templates.routes_templates as routes_templates
from pixsim7.backend.main.api.v1.block_templates.routes_templates import (
    _assert_template_write_access,
    list_templates,
    _template_response_with_hints,
)
from pixsim7.backend.main.services.ownership.user_owned import (
    assert_can_write_user_owned,
    can_write_user_owned,
    resolve_user_owner,
    resolve_user_owned_list_scope,
)


def _template_stub(
    *,
    metadata: dict,
    created_by: str | None,
    owner_user_id: int | None = None,
) -> SimpleNamespace:
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=uuid4(),
        name="Template",
        slug="template",
        description=None,
        slots=[],
        composition_strategy="sequential",
        package_name=None,
        tags=[],
        is_public=True,
        created_by=created_by,
        owner_user_id=owner_user_id,
        roll_count=0,
        template_metadata=metadata,
        character_bindings={},
        created_at=now,
        updated_at=now,
    )


@pytest.mark.asyncio
async def test_template_response_exposes_canonical_owner_fields() -> None:
    template = _template_stub(
        metadata={"owner": {"user_id": 5, "entity_ref": "user:5", "username": "alice"}},
        created_by="alice",
        owner_user_id=5,
    )

    response = await _template_response_with_hints(template, service=None)

    assert response.owner_user_id == 5
    assert response.owner_ref == "user:5"
    assert response.owner_username == "alice"


@pytest.mark.asyncio
async def test_template_response_prefers_owner_user_id_column_over_metadata_id() -> None:
    template = _template_stub(
        metadata={"owner": {"user_id": 5, "entity_ref": "user:5", "username": "alice"}},
        created_by="alice",
        owner_user_id=9,
    )

    response = await _template_response_with_hints(template, service=None)

    assert response.owner_user_id == 9
    assert response.owner_ref == "user:9"


@pytest.mark.asyncio
async def test_template_response_owner_username_falls_back_to_created_by() -> None:
    template = _template_stub(metadata={}, created_by="fallback-user")

    response = await _template_response_with_hints(template, service=None)

    assert response.owner_user_id is None
    assert response.owner_ref is None
    assert response.owner_username == "fallback-user"


def test_resolve_user_owner_prefers_model_owner_and_normalizes_ref() -> None:
    owner = resolve_user_owner(
        model_owner_user_id=9,
        owner_payload={"user_id": 5, "entity_ref": "user:5", "username": "alice"},
        created_by="fallback",
    )

    assert owner["owner_user_id"] == 9
    assert owner["owner_ref"] == "user:9"
    assert owner["owner_username"] == "alice"


def test_can_write_user_owned_allows_created_by_fallback() -> None:
    allowed = can_write_user_owned(
        user=_user(user_id=7, username="alice"),
        owner_user_id=None,
        created_by="alice",
    )
    assert allowed is True


def test_assert_can_write_user_owned_raises_for_non_owner() -> None:
    with pytest.raises(HTTPException) as exc:
        assert_can_write_user_owned(
            user=_user(user_id=8, username="bob"),
            owner_user_id=7,
            created_by="alice",
            denied_detail="denied",
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "denied"


def test_resolve_user_owned_list_scope_mine_requires_auth() -> None:
    with pytest.raises(HTTPException) as exc:
        resolve_user_owned_list_scope(
            current_user=None,
            requested_owner_user_id=None,
            requested_is_public=None,
            mine=True,
            include_public_when_mine=True,
        )

    assert exc.value.status_code == 401


def test_resolve_user_owned_list_scope_mine_uses_current_user() -> None:
    scope = resolve_user_owned_list_scope(
        current_user=_user(user_id=7, username="alice"),
        requested_owner_user_id=None,
        requested_is_public=None,
        mine=True,
        include_public_when_mine=False,
    )

    assert scope.owner_user_id == 7
    assert scope.include_public_for_owner is False
    assert scope.is_public is None


def test_resolve_user_owned_list_scope_foreign_owner_forces_public() -> None:
    scope = resolve_user_owned_list_scope(
        current_user=_user(user_id=7, username="alice"),
        requested_owner_user_id=999,
        requested_is_public=None,
        mine=False,
        include_public_when_mine=True,
    )

    assert scope.owner_user_id == 999
    assert scope.is_public is True
    assert scope.include_public_for_owner is False


def test_resolve_user_owned_list_scope_foreign_owner_private_forbidden() -> None:
    with pytest.raises(HTTPException) as exc:
        resolve_user_owned_list_scope(
            current_user=_user(user_id=7, username="alice"),
            requested_owner_user_id=999,
            requested_is_public=False,
            mine=False,
            include_public_when_mine=True,
        )

    assert exc.value.status_code == 403


def _user(*, user_id: int, username: str, is_admin: bool = False) -> SimpleNamespace:
    return SimpleNamespace(
        id=user_id,
        username=username,
        is_admin=(lambda: is_admin),
    )


class _ListCaptureService:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def search_templates(self, **kwargs):
        self.calls.append(dict(kwargs))
        return []


def test_assert_template_write_access_allows_owner_user_id() -> None:
    template = _template_stub(metadata={}, created_by="alice", owner_user_id=7)
    _assert_template_write_access(template=template, current_user=_user(user_id=7, username="alice"))


def test_assert_template_write_access_blocks_non_owner() -> None:
    template = _template_stub(metadata={}, created_by="alice", owner_user_id=7)
    with pytest.raises(HTTPException) as exc:
        _assert_template_write_access(template=template, current_user=_user(user_id=8, username="bob"))
    assert exc.value.status_code == 403


def test_assert_template_write_access_allows_admin_override() -> None:
    template = _template_stub(metadata={}, created_by="alice", owner_user_id=7)
    _assert_template_write_access(
        template=template,
        current_user=_user(user_id=999, username="admin", is_admin=True),
    )


@pytest.mark.asyncio
async def test_list_templates_mine_requires_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    capture = _ListCaptureService()
    monkeypatch.setattr(routes_templates, "BlockTemplateService", lambda _db: capture)

    with pytest.raises(HTTPException) as exc:
        await list_templates(
            package_name=None,
            is_public=None,
            owner_user_id=None,
            mine=True,
            include_public=True,
            tag=None,
            limit=50,
            offset=0,
            db=None,
            current_user=None,
        )

    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_list_templates_mine_uses_current_user_filter(monkeypatch: pytest.MonkeyPatch) -> None:
    capture = _ListCaptureService()
    monkeypatch.setattr(routes_templates, "BlockTemplateService", lambda _db: capture)

    result = await list_templates(
        package_name=None,
        is_public=None,
        owner_user_id=None,
        mine=True,
        include_public=False,
        tag=None,
        limit=50,
        offset=0,
        db=None,
        current_user=_user(user_id=7, username="alice"),
    )

    assert result == []
    assert capture.calls[0]["owner_user_id"] == 7
    assert capture.calls[0]["include_public_for_owner"] is False


@pytest.mark.asyncio
async def test_list_templates_owner_scope_forces_public_when_foreign_owner(monkeypatch: pytest.MonkeyPatch) -> None:
    capture = _ListCaptureService()
    monkeypatch.setattr(routes_templates, "BlockTemplateService", lambda _db: capture)

    await list_templates(
        package_name=None,
        is_public=None,
        owner_user_id=999,
        mine=False,
        include_public=True,
        tag=None,
        limit=50,
        offset=0,
        db=None,
        current_user=_user(user_id=7, username="alice"),
    )

    assert capture.calls[0]["owner_user_id"] == 999
    assert capture.calls[0]["is_public"] is True


@pytest.mark.asyncio
async def test_list_templates_owner_scope_blocks_private_foreign_owner(monkeypatch: pytest.MonkeyPatch) -> None:
    capture = _ListCaptureService()
    monkeypatch.setattr(routes_templates, "BlockTemplateService", lambda _db: capture)

    with pytest.raises(HTTPException) as exc:
        await list_templates(
            package_name=None,
            is_public=False,
            owner_user_id=999,
            mine=False,
            include_public=True,
            tag=None,
            limit=50,
            offset=0,
            db=None,
            current_user=_user(user_id=7, username="alice"),
        )

    assert exc.value.status_code == 403
