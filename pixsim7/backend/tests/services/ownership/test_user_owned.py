from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from pixsim7.backend.main.services.ownership.user_owned import (
    assert_can_write_user_owned,
    can_write_user_owned,
    resolve_user_owner,
    resolve_user_owned_list_scope,
)


def _user(*, user_id: int, username: str = "user", is_admin: bool = False) -> SimpleNamespace:
    return SimpleNamespace(
        id=user_id,
        username=username,
        is_admin=(lambda: is_admin),
    )


def test_resolve_user_owner_prefers_canonical_owner_user_id() -> None:
    resolved = resolve_user_owner(
        model_owner_user_id=7,
        owner_payload={"entity_ref": "user:3", "username": "creator"},
        created_by="fallback",
    )
    assert resolved["owner_user_id"] == 7
    assert resolved["owner_ref"] == "user:7"
    assert resolved["owner_username"] == "creator"


def test_list_scope_foreign_owner_private_forbidden() -> None:
    with pytest.raises(HTTPException) as exc:
        resolve_user_owned_list_scope(
            current_user=_user(user_id=7),
            requested_owner_user_id=9,
            requested_is_public=False,
            mine=False,
            include_public_when_mine=False,
        )
    assert exc.value.status_code == 403


def test_list_scope_foreign_owner_forces_public() -> None:
    scope = resolve_user_owned_list_scope(
        current_user=_user(user_id=7),
        requested_owner_user_id=9,
        requested_is_public=None,
        mine=False,
        include_public_when_mine=False,
    )
    assert scope.owner_user_id == 9
    assert scope.is_public is True


def test_list_scope_mine_uses_current_user_and_include_public_flag() -> None:
    scope = resolve_user_owned_list_scope(
        current_user=_user(user_id=7),
        requested_owner_user_id=None,
        requested_is_public=None,
        mine=True,
        include_public_when_mine=True,
    )
    assert scope.owner_user_id == 7
    assert scope.include_public_for_owner is True


def test_can_write_user_owned_allows_owner_and_created_by_match() -> None:
    assert can_write_user_owned(
        user=_user(user_id=7, username="owner"),
        owner_user_id=7,
    )
    assert can_write_user_owned(
        user=_user(user_id=8, username="creator"),
        owner_user_id=None,
        created_by="creator",
    )


def test_assert_can_write_user_owned_denies_non_owner() -> None:
    with pytest.raises(HTTPException) as exc:
        assert_can_write_user_owned(
            user=_user(user_id=7, username="alice"),
            owner_user_id=9,
            created_by="bob",
        )
    assert exc.value.status_code == 403
