"""
Tests for ``get_npc_stat_data`` — the shared canonical-first per-npc stat reader.

Plan ``backend-stats-readers-canonical-migration`` (checkpoints
migrate-misc-readers / migrate-context-snapshots-plugins): the relationship
readers across context builders, metrics/scoring, snapshots and plugin
capabilities now funnel their per-npc lookups through this helper, which prefers
the canonical ``stats:<def_id>`` GameObject component and falls back to the
legacy ``session.stats[def_id]['npc:<id>']`` copy.

``get_npc_stat_data`` is sync, so these are plain sync tests.
"""
from __future__ import annotations

from pixsim7.backend.main.domain.game.core.models import GameSession
from pixsim7.backend.main.services.game.game_object_store import (
    get_npc_stat_data,
    set_npc_component,
)


def _session(flags=None, stats=None) -> GameSession:
    return GameSession(
        id=1, user_id=1, world_id=1, scene_id=None, flags=flags or {}, stats=stats or {}
    )


def test_reads_from_canonical_component():
    session = _session()
    set_npc_component(
        session.flags, session.world_id, 5, "stats:relationships",
        {"affinity": 72.0, "trust": 60.0, "tierId": "friend"},
    )

    data = get_npc_stat_data(session, 5, "relationships")

    assert data == {"affinity": 72.0, "trust": 60.0, "tierId": "friend"}


def test_canonical_takes_precedence_over_legacy():
    session = _session(stats={"relationships": {"npc:5": {"affinity": 10.0}}})
    set_npc_component(
        session.flags, session.world_id, 5, "stats:relationships",
        {"affinity": 90.0},
    )

    assert get_npc_stat_data(session, 5, "relationships")["affinity"] == 90.0


def test_falls_back_to_legacy_when_no_canonical():
    session = _session(stats={"relationships": {"npc:7": {"affinity": 33.0}}})

    assert get_npc_stat_data(session, 7, "relationships") == {"affinity": 33.0}


def test_accepts_prefixed_and_int_npc_ids():
    session = _session(stats={"relationships": {"npc:7": {"affinity": 33.0}}})

    assert get_npc_stat_data(session, "npc:7", "relationships") == {"affinity": 33.0}
    assert get_npc_stat_data(session, 7, "relationships") == {"affinity": 33.0}


def test_returns_empty_when_no_source_has_data():
    assert get_npc_stat_data(_session(), 5, "relationships") == {}
    # Empty canonical data dict must not shadow a legacy fallback.
    session = _session(stats={"relationships": {"npc:5": {"affinity": 1.0}}})
    set_npc_component(session.flags, session.world_id, 5, "stats:relationships", {})
    assert get_npc_stat_data(session, 5, "relationships") == {"affinity": 1.0}
