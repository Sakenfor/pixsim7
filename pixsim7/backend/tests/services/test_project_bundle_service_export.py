from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.exc import ProgrammingError

from pixsim7.backend.main.services.game.project_bundle import GameProjectBundleService


def _result(rows):
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    return result


@pytest.mark.asyncio
async def test_export_world_bundle_tolerates_missing_npc_expressions_table() -> None:
    db = AsyncMock()
    db.get = AsyncMock(
        side_effect=[
            SimpleNamespace(id=1, name="W", meta={}),
            SimpleNamespace(world_time=0.0),
        ]
    )

    npc = SimpleNamespace(
        id=1,
        name="NPC 1",
        personality={},
        home_location_id=None,
        stats={},
    )
    missing_table_error = ProgrammingError(
        "SELECT * FROM npc_expressions",
        {},
        Exception('relation "npc_expressions" does not exist'),
    )
    db.execute = AsyncMock(
        side_effect=[
            _result([]),          # locations
            _result([npc]),       # npcs
            _result([]),          # schedules
            missing_table_error,  # expressions
            _result([]),          # scenes
            _result([]),          # items
        ]
    )

    service = GameProjectBundleService(db)
    bundle = await service.export_world_bundle(world_id=1)

    assert bundle.core.world.name == "W"
    assert len(bundle.core.npcs) == 1
    assert bundle.core.npcs[0].name == "NPC 1"
    assert bundle.core.npcs[0].expressions == []
