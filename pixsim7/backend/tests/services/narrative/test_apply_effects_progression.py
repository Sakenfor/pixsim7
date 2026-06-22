"""
Tests for NarrativeRuntimeEngine._apply_effects arc/quest/event/component routing.

These categories were previously only handled by the retired frontend
effectApplicator; this verifies the backend engine now applies them through the
canonical writers (apply_flag_changes fields + set_npc_component).
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from pixsim7.backend.main.domain.narrative.schema import StateEffects
from pixsim7.backend.main.services.game.game_object_store import get_npc_component
from pixsim7.backend.main.services.narrative.runtime import NarrativeRuntimeEngine


def _engine() -> NarrativeRuntimeEngine:
    return NarrativeRuntimeEngine(
        db=AsyncMock(),
        user_service=SimpleNamespace(),
        generation_service=SimpleNamespace(),
    )


def _session():
    return SimpleNamespace(flags={}, world_id=1, stats={})


NPC_ID = 7


@pytest.mark.asyncio
async def test_numeric_arc_stage_routes_to_canonical_flags():
    engine, session = _engine(), _session()
    await engine._apply_effects(
        StateEffects(arcs={"romance_alex": "2"}), session, NPC_ID, context={}
    )
    assert session.flags["arcs"]["romance_alex"]["stage"] == 2


@pytest.mark.asyncio
async def test_named_arc_stage_preserved_as_stage_name():
    engine, session = _engine(), _session()
    await engine._apply_effects(
        StateEffects(arcs={"jealousy": "rising"}), session, NPC_ID, context={}
    )
    arc = session.flags["arcs"]["jealousy"]
    assert arc["stageName"] == "rising"
    assert arc["stage"] == 0


@pytest.mark.asyncio
async def test_quest_status_update():
    engine, session = _engine(), _session()
    await engine._apply_effects(
        StateEffects(quests={"find_ring": "active"}), session, NPC_ID, context={}
    )
    assert session.flags["quests"]["find_ring"]["status"] == "active"


@pytest.mark.asyncio
async def test_event_trigger_then_end():
    engine, session = _engine(), _session()

    await engine._apply_effects(
        StateEffects(events={"trigger": ["festival"]}), session, NPC_ID, context={}
    )
    assert session.flags["events"]["festival"]["active"] is True

    await engine._apply_effects(
        StateEffects(events={"end": ["festival"]}), session, NPC_ID, context={}
    )
    assert session.flags["events"]["festival"]["active"] is False


@pytest.mark.asyncio
async def test_component_effect_upserts_canonical_npc_component_with_merge():
    engine, session = _engine(), _session()

    await engine._apply_effects(
        StateEffects(components={"mood": {"valence": 0.5}}), session, NPC_ID, context={}
    )
    comp = get_npc_component(session.flags, session.world_id, NPC_ID, "mood")
    assert comp is not None
    assert comp["data"]["valence"] == 0.5

    # Second apply shallow-merges over existing component data.
    await engine._apply_effects(
        StateEffects(components={"mood": {"arousal": 0.3}}), session, NPC_ID, context={}
    )
    comp = get_npc_component(session.flags, session.world_id, NPC_ID, "mood")
    assert comp["data"] == {"valence": 0.5, "arousal": 0.3}
