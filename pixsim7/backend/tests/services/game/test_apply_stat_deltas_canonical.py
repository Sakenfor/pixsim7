"""Tests for the canonical-primary npc stat write in apply_stat_deltas
(checkpoint drop-legacy-write).

After the reader migration, apply_stat_deltas writes npc-scoped stats ONLY to
the canonical ``stats:<def_id>`` npc GameObject component — the legacy
session.stats[<def_id>]["npc:<id>"] write was DROPPED. Canonical is the source
of truth for npc raw axes; normalize_session_stats recomputes tier/level and
repopulates the session.stats bulk copy that snapshots/plugins still read.
Session/world scopes (no canonical npc entity) continue to live in
session.stats. apply reads npc state canonical-first with a legacy
session.stats fallback for snapshot-restored sessions.
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

    # Canonical npc component is the source of truth.
    comp = _npc_component(session, 42, "stats:relationships")
    assert comp is not None
    assert comp["enabled"] is True
    assert comp["data"]["affinity"] == 5.0
    assert comp["data"]["trust"] == 10.0

    # Legacy npc session.stats write was DROPPED — apply must not populate it.
    assert "npc:42" not in session.stats.get("relationships", {})


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


def test_apply_stat_deltas_subsequent_deltas_accumulate_in_canonical(session, world):
    # The second delta must read its prior value back from canonical (apply is
    # canonical-first), so accumulation works without any session.stats write.
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

    comp = _npc_component(session, 7, "stats:relationships")
    assert comp["data"]["affinity"] == 8.0
    assert "npc:7" not in session.stats.get("relationships", {})


def test_apply_stat_deltas_npc_falls_back_to_legacy_session_stats(session, world):
    # Snapshot-restored sessions carry npc relationships in session.stats but no
    # canonical component yet. apply must read that legacy value (fallback) so
    # the delta accumulates onto it, then write the result to canonical.
    session.stats = {"relationships": {"npc:9": {"affinity": 20.0}}}

    result = run_async(apply_stat_deltas(
        session,
        StatDelta(
            package_id="core.relationships",
            axes={"affinity": 10.0},
            entity_type="npc",
            npc_id=9,
        ),
        world,
    ))

    assert result["affinity"] == 30.0  # 20 (legacy) + 10
    comp = _npc_component(session, 9, "stats:relationships")
    assert comp["data"]["affinity"] == 30.0


