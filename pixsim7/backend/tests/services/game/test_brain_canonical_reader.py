"""
Tests for BrainEngine._get_session_stats canonical-read migration.

Plan ``backend-stats-readers-canonical-migration`` (checkpoint
migrate-brain-derivations): the brain stat loader now prefers the canonical npc
GameObject component ``stats:<def_id>`` (written by apply_stat_deltas), with a
legacy ``session.stats`` fallback for sessions not populated via the canonical
path. The ``session.flags.npcs[*].stats`` per-npc override stays highest
priority.

Migrating this single loader migrates ALL brain derivations, since they read
``BrainContext.stats`` which funnels through here.

``_get_session_stats`` is a sync method, so these are plain sync tests.
"""
from __future__ import annotations

from pixsim7.backend.main.domain.game.brain.engine import BrainEngine
from pixsim7.backend.main.domain.game.core.models import GameSession
from pixsim7.backend.main.services.game.game_object_store import set_npc_component


def _engine() -> BrainEngine:
    return BrainEngine(db=None)


def _session(flags=None, stats=None) -> GameSession:
    return GameSession(
        id=1, user_id=1, world_id=1, scene_id=None, flags=flags or {}, stats=stats or {}
    )


def test_reads_from_canonical_component():
    session = _session()
    set_npc_component(
        session.flags, session.world_id, 5, "stats:relationships",
        {"affinity": 72.0, "trust": 60.0},
    )

    values = _engine()._get_session_stats(session, 5, "relationships")

    assert values == {"affinity": 72.0, "trust": 60.0}


def test_canonical_takes_precedence_over_legacy_session_stats():
    # Canonical has the fresh value; legacy session.stats has a stale one.
    session = _session(stats={"relationships": {"npc:5": {"affinity": 10.0}}})
    set_npc_component(
        session.flags, session.world_id, 5, "stats:relationships",
        {"affinity": 90.0},
    )

    values = _engine()._get_session_stats(session, 5, "relationships")

    assert values["affinity"] == 90.0, "canonical must win over legacy session.stats"


def test_falls_back_to_legacy_session_stats_when_no_canonical():
    # No canonical component -> legacy session.stats still readable (snapshot
    # restore / one-time migration paths).
    session = _session(stats={"relationships": {"npc:7": {"affinity": 33.0}}})

    values = _engine()._get_session_stats(session, 7, "relationships")

    assert values == {"affinity": 33.0}


def test_flags_npc_override_has_highest_priority():
    # session.flags.npcs[*].stats override must still beat canonical.
    session = _session(
        flags={"npcs": {"npc:5": {"stats": {"relationships": {"affinity": 5.0}}}}},
    )
    set_npc_component(
        session.flags, session.world_id, 5, "stats:relationships",
        {"affinity": 99.0},
    )

    values = _engine()._get_session_stats(session, 5, "relationships")

    assert values["affinity"] == 5.0, "flags.npcs override must beat canonical"


def test_returns_empty_when_no_source_has_data():
    session = _session()
    assert _engine()._get_session_stats(session, 5, "relationships") == {}
