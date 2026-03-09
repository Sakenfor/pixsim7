from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from pixsim7.backend.main.domain.game.core.models import GameWorld
from pixsim7.backend.main.services.ownership.policies import (
    OwnershipPolicy,
    OwnershipScope,
    apply_ownership_filter,
    assert_can_access,
)


def test_assert_can_access_user_scope_requires_auth_when_owner_missing() -> None:
    with pytest.raises(HTTPException) as exc:
        assert_can_access(
            user=None,
            policy=OwnershipPolicy(scope=OwnershipScope.USER, owner_field="owner_user_id"),
            owner_id=None,
        )
    assert exc.value.status_code == 401


def test_apply_ownership_filter_user_scope_requires_auth_when_owner_missing() -> None:
    with pytest.raises(HTTPException) as exc:
        apply_ownership_filter(
            select(GameWorld),
            model=GameWorld,
            policy=OwnershipPolicy(scope=OwnershipScope.USER, owner_field="owner_user_id"),
            user=None,
            owner_id=None,
        )
    assert exc.value.status_code == 401


def test_apply_ownership_filter_user_scope_uses_current_user_id() -> None:
    query = apply_ownership_filter(
        select(GameWorld),
        model=GameWorld,
        policy=OwnershipPolicy(scope=OwnershipScope.USER, owner_field="owner_user_id"),
        user=SimpleNamespace(id=42, is_admin=lambda: False),
        owner_id=None,
    )

    sql = str(query).lower()
    assert "owner_user_id" in sql
