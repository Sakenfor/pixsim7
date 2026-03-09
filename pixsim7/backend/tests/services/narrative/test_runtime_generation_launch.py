from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

import pixsim7.backend.main.services.narrative.runtime as runtime_module
from pixsim7.backend.main.domain import OperationType
from pixsim7.backend.main.domain.narrative.schema import ActionBlockNode
from pixsim7.backend.main.services.narrative.runtime import NarrativeRuntimeEngine


@pytest.mark.asyncio
async def test_launch_action_block_generation_creates_generation_with_canonical_run_context(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_service = SimpleNamespace(
        get_user=AsyncMock(return_value=SimpleNamespace(id=42)),
    )
    generation_service = SimpleNamespace(
        create_generation=AsyncMock(
            return_value=SimpleNamespace(
                id=99,
                status=SimpleNamespace(value="queued"),
            )
        )
    )
    engine = NarrativeRuntimeEngine(
        db=AsyncMock(),
        user_service=user_service,
        generation_service=generation_service,
    )

    monkeypatch.setattr(
        runtime_module,
        "prepare_generation_from_sequence",
        AsyncMock(
            return_value={
                "provider": "default",
                "assembledPrompt": "assembled action prompt",
                "socialContext": {"mood": "tense"},
                "metadata": {"source": "unit_test"},
            }
        ),
    )

    node = ActionBlockNode(
        id="node_1",
        mode="query",
        query={},
        launch_mode="immediate",
        generation_config={
            "generationType": "text_to_video",
            "priority": 7,
        },
    )
    sequence = SimpleNamespace(
        prompts=["first", "second"],
        total_duration=8.5,
        blocks=[{"id": "blk_1"}, {"blockId": "blk_2"}],
        composition="sequential",
        compatibility_score=0.92,
        fallback_reason=None,
    )
    context = {
        "world": {"id": 123},
        "npc": {"name": "Eve"},
        "relationship": {"affinity": 72},
    }
    session = SimpleNamespace(id=55, user_id=42, world_id=123)

    launch = await engine._launch_action_block_generation(
        sequence=sequence,
        node=node,
        context=context,
        session=session,
        npc_id=7,
    )

    assert launch is not None
    assert launch.generation_id == 99
    assert launch.status == "queued"

    user_service.get_user.assert_awaited_once_with(42)
    create_args = generation_service.create_generation.await_args.kwargs
    assert create_args["provider_id"] == "pixverse"
    assert create_args["operation_type"] == OperationType.TEXT_TO_VIDEO

    params = create_args["params"]
    generation_config = params["generation_config"]
    run_context = generation_config["run_context"]
    assert generation_config["prompt"] == "assembled action prompt"
    assert run_context["mode"] == "narrative_runtime"
    assert run_context["item_index"] == 0
    assert run_context["item_total"] == 1
    assert run_context["selected_block_ids"] == ["blk_1", "blk_2"]
    assert params["player_context"]["player_id"] == 42


@pytest.mark.asyncio
async def test_launch_action_block_generation_returns_none_when_generation_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_service = SimpleNamespace(
        get_user=AsyncMock(return_value=SimpleNamespace(id=42)),
    )
    generation_service = SimpleNamespace(
        create_generation=AsyncMock(side_effect=RuntimeError("generation failure")),
    )
    engine = NarrativeRuntimeEngine(
        db=AsyncMock(),
        user_service=user_service,
        generation_service=generation_service,
    )

    monkeypatch.setattr(
        runtime_module,
        "prepare_generation_from_sequence",
        AsyncMock(
            return_value={
                "provider": "pixverse",
                "prompts": [],
                "socialContext": {},
                "metadata": {},
            }
        ),
    )

    node = ActionBlockNode(
        id="node_2",
        mode="direct",
        block_ids=["blk_1"],
        launch_mode="immediate",
    )
    sequence = SimpleNamespace(
        prompts=[],
        total_duration=0.0,
        blocks=[{"id": "blk_1"}],
        composition="sequential",
        compatibility_score=1.0,
        fallback_reason=None,
    )
    context = {"npc": {"name": "Alex"}}
    session = SimpleNamespace(id=56, user_id=42, world_id=456)

    launch = await engine._launch_action_block_generation(
        sequence=sequence,
        node=node,
        context=context,
        session=session,
        npc_id=8,
    )

    assert launch is None
    generation_service.create_generation.assert_awaited_once()
