from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from pixsim7.backend.main.services.game.world import (
    GameWorldService,
    WORLD_UPSERT_META_KEY,
)


@pytest.mark.asyncio
async def test_get_world_by_owner_and_upsert_key_matches_meta() -> None:
    service = GameWorldService(AsyncMock())
    expected = SimpleNamespace(id=3, meta={WORLD_UPSERT_META_KEY: "bananza.world"})
    service.list_worlds_for_user = AsyncMock(return_value=[expected])

    resolved = await service.get_world_by_owner_and_upsert_key(
        owner_user_id=1,
        upsert_key="  bananza.world ",
    )

    assert resolved is expected
    service.list_worlds_for_user.assert_awaited_once_with(owner_user_id=1)


@pytest.mark.asyncio
async def test_get_world_by_owner_and_upsert_key_skips_blank_key() -> None:
    service = GameWorldService(AsyncMock())
    service.list_worlds_for_user = AsyncMock(return_value=[])

    resolved = await service.get_world_by_owner_and_upsert_key(
        owner_user_id=1,
        upsert_key="   ",
    )

    assert resolved is None
    service.list_worlds_for_user.assert_not_awaited()
