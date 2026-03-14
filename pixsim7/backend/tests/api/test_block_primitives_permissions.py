from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from pixsim7.backend.main.api.v1.block_templates.routes_blocks import (
    _assert_can_write_primitive_block,
)


def _user(user_id: int, *, admin: bool) -> SimpleNamespace:
    return SimpleNamespace(
        id=user_id,
        is_admin=(lambda: admin),
    )


def _block(owner_user_id: int | None) -> SimpleNamespace:
    tags = {}
    if owner_user_id is not None:
        tags["owner_user_id"] = owner_user_id
    return SimpleNamespace(tags=tags)


def test_admin_can_modify_system_owned_primitive() -> None:
    _assert_can_write_primitive_block(
        block=_block(None),
        current_user=_user(1, admin=True),
    )


def test_non_admin_cannot_modify_system_owned_primitive() -> None:
    with pytest.raises(HTTPException) as exc:
        _assert_can_write_primitive_block(
            block=_block(None),
            current_user=_user(7, admin=False),
        )

    assert exc.value.status_code == 403


def test_non_admin_can_modify_owned_primitive() -> None:
    _assert_can_write_primitive_block(
        block=_block(7),
        current_user=_user(7, admin=False),
    )


def test_non_admin_cannot_modify_other_users_primitive() -> None:
    with pytest.raises(HTTPException) as exc:
        _assert_can_write_primitive_block(
            block=_block(17),
            current_user=_user(7, admin=False),
        )

    assert exc.value.status_code == 403
