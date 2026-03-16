from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from pixsim7.backend.main.domain.game.core.models import GameScene
from pixsim7.backend.main.services.game.session import GameSessionService


def _build_scene(scene_id: int, world_id: int) -> GameScene:
    return GameScene(
        id=scene_id,
        world_id=world_id,
        title=f"Scene {scene_id}",
        entry_node_id=scene_id * 10,
    )


@pytest.mark.asyncio
async def test_resolve_scene_returns_requested_scene_when_valid():
    service = GameSessionService(db=MagicMock(), redis=None)
    scene = _build_scene(5, 1)

    service._get_scene = AsyncMock(return_value=scene)  # type: ignore[method-assign]
    service._get_first_world_scene = AsyncMock(return_value=None)  # type: ignore[method-assign]

    resolved = await service._resolve_scene_for_new_session(scene_id=5, world_id=1)

    assert resolved is scene
    service._get_first_world_scene.assert_not_called()


@pytest.mark.asyncio
async def test_resolve_scene_falls_back_to_world_scene_when_requested_scene_missing():
    service = GameSessionService(db=MagicMock(), redis=None)
    fallback_scene = _build_scene(42, 7)

    service._get_scene = AsyncMock(side_effect=ValueError("scene_not_found"))  # type: ignore[method-assign]
    service._get_first_world_scene = AsyncMock(return_value=fallback_scene)  # type: ignore[method-assign]

    resolved = await service._resolve_scene_for_new_session(scene_id=999, world_id=7)

    assert resolved is fallback_scene
    service._get_first_world_scene.assert_awaited_once_with(7)


@pytest.mark.asyncio
async def test_resolve_scene_falls_back_to_world_scene_when_scene_id_non_positive():
    service = GameSessionService(db=MagicMock(), redis=None)
    fallback_scene = _build_scene(42, 7)

    service._get_scene = AsyncMock(return_value=_build_scene(1, 1))  # type: ignore[method-assign]
    service._get_first_world_scene = AsyncMock(return_value=fallback_scene)  # type: ignore[method-assign]

    resolved = await service._resolve_scene_for_new_session(scene_id=0, world_id=7)

    assert resolved is fallback_scene
    service._get_scene.assert_not_called()
    service._get_first_world_scene.assert_awaited_once_with(7)


@pytest.mark.asyncio
async def test_resolve_scene_falls_back_when_scene_belongs_to_different_world():
    service = GameSessionService(db=MagicMock(), redis=None)
    requested_scene = _build_scene(5, 1)
    fallback_scene = _build_scene(42, 7)

    service._get_scene = AsyncMock(return_value=requested_scene)  # type: ignore[method-assign]
    service._get_first_world_scene = AsyncMock(return_value=fallback_scene)  # type: ignore[method-assign]

    resolved = await service._resolve_scene_for_new_session(scene_id=5, world_id=7)

    assert resolved is fallback_scene
    service._get_first_world_scene.assert_awaited_once_with(7)


@pytest.mark.asyncio
async def test_resolve_scene_raises_world_scene_not_found_when_no_fallback_scene_exists():
    service = GameSessionService(db=MagicMock(), redis=None)

    service._get_scene = AsyncMock(side_effect=ValueError("scene_not_found"))  # type: ignore[method-assign]
    service._get_first_world_scene = AsyncMock(return_value=None)  # type: ignore[method-assign]

    with pytest.raises(ValueError, match="world_scene_not_found"):
        await service._resolve_scene_for_new_session(scene_id=999, world_id=3)


@pytest.mark.asyncio
async def test_resolve_scene_does_not_fallback_for_non_missing_scene_errors():
    service = GameSessionService(db=MagicMock(), redis=None)

    service._get_scene = AsyncMock(side_effect=ValueError("scene_missing_entry_node"))  # type: ignore[method-assign]
    service._get_first_world_scene = AsyncMock(return_value=_build_scene(2, 1))  # type: ignore[method-assign]

    with pytest.raises(ValueError, match="scene_missing_entry_node"):
        await service._resolve_scene_for_new_session(scene_id=2, world_id=1)

    service._get_first_world_scene.assert_not_called()
