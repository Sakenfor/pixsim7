"""Tests for the canonical-npc-component mirror added to apply_stat_deltas
(checkpoint npc-ecs-on-canonical, relationships half).

apply_stat_deltas continues to write session.stats[<def_id>][<entity_key>]
verbatim (the 20+ existing reader sites in brain/derivations/etc. depend on
that path). It additionally writes a canonical ``stats:<def_id>`` component on
the npc GameObject so the canonical store is also a source of truth.
"""
import asyncio

import pytest

from pixsim7.backend.main.domain.game.core.models import GameSession, GameWorld
from pixsim7.backend.main.domain.game.interactions.interaction_execution import (
    apply_stat_deltas,
)
from pixsim7.backend.main.domain.game.interactions.interactions import StatDelta
from pixsim7.backend.main.domain.game.stats import (
    clear_stat_packages,
    register_core_stat_packages,
)


def run_async(coro):
    return asyncio.run(coro)


@pytest.fixture
def session():
    return GameSession(id=1, world_id=1, world_time=0.0, stats={}, flags={})


@pytest.fixture
def world():
    return GameWorld(id=1, name="Test World", meta={})


@pytest.fixture(autouse=True)
def register_packages():
    clear_stat_packages()
    register_core_stat_packages()
    yield


def _npc_component(session, npc_id, component_type):
    objects = session.flags.get("gameObjects", {}).get("objects", {})
    npc = objects.get(f"npc:{npc_id}")
    if not npc:
        return None
    for comp in npc.get("components") or []:
        if comp.get("type") == component_type:
            return comp
    return None


def test_apply_stat_deltas_writes_canonical_npc_component(session, world):
    delta = StatDelta(
        package_id="core.relationships",
        axes={"affinity": 5.0, "trust": 10.0},
        entity_type="npc",
        npc_id=42,
    )

    run_async(apply_stat_deltas(session, delta, world))

    # Legacy session.stats path still populated (parity for the 20+ readers).
    assert session.stats["relationships"]["npc:42"]["affinity"] == 5.0

    # Canonical npc.components mirror.
    comp = _npc_component(session, 42, "stats:relationships")
    assert comp is not None
    assert comp["enabled"] is True
    assert comp["data"]["affinity"] == 5.0
    assert comp["data"]["trust"] == 10.0


def test_apply_stat_deltas_session_scope_does_not_touch_canonical(session, world):
    delta = StatDelta(
        package_id="core.relationships",
        axes={"affinity": 3.0},
        entity_type="session",
    )

    run_async(apply_stat_deltas(session, delta, world))

    # session.stats populated for session scope.
    assert "session" in session.stats["relationships"]
    # No canonical entity exists for session scope, so the store stays empty.
    assert "gameObjects" not in session.flags


def test_apply_stat_deltas_subsequent_deltas_accumulate_in_both_locations(session, world):
    run_async(apply_stat_deltas(
        session,
        StatDelta(
            package_id="core.relationships",
            axes={"affinity": 5.0},
            entity_type="npc",
            npc_id=7,
        ),
        world,
    ))
    run_async(apply_stat_deltas(
        session,
        StatDelta(
            package_id="core.relationships",
            axes={"affinity": 3.0},
            entity_type="npc",
            npc_id=7,
        ),
        world,
    ))

    assert session.stats["relationships"]["npc:7"]["affinity"] == 8.0
    comp = _npc_component(session, 7, "stats:relationships")
    assert comp["data"]["affinity"] == 8.0


def test_apply_stat_deltas_preserves_legacy_npc_fields_via_hydration(session, world):
    # Seed a legacy flags.npcs entry. The canonical npc created by the mirror
    # should preserve the legacy role/locationId via the store's hydration spread.
    session.flags = {"npcs": {"npc:5": {"name": "Alex", "role": "barista", "locationId": 3}}}

    run_async(apply_stat_deltas(
        session,
        StatDelta(
            package_id="core.relationships",
            axes={"affinity": 4.0},
            entity_type="npc",
            npc_id=5,
        ),
        world,
    ))

    npc = session.flags["gameObjects"]["objects"]["npc:5"]
    assert npc["name"] == "Alex"
    assert npc["npcData"]["role"] == "barista"
    assert npc["transform"]["locationId"] == 3
    # And the stats component is on it.
    assert _npc_component(session, 5, "stats:relationships")["data"]["affinity"] == 4.0
