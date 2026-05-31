"""
Re-mirror tests for StatService.normalize_session_stats.

Plan ``backend-stats-readers-canonical-migration``: when normalization computes
tier/level fields, the npc-scoped normalized entity must be re-mirrored onto the
canonical npc GameObject component ``stats:<def_id>`` so the canonical copy
carries the COMPUTED fields (apply_stat_deltas only mirrors raw axes
pre-normalization). Session/world scopes have no canonical npc entity and stay
in session.stats only.

Uses the repo's sync-test + ``run_async`` convention (see
test_apply_stat_deltas_canonical.py), not ``async def`` tests.
"""
from __future__ import annotations

import asyncio

import pytest

from pixsim7.backend.main.domain.game.core.models import GameSession
from pixsim7.backend.main.services.game.stat import StatService
from pixsim7.backend.main.services.game.game_object_store import get_npc_component
from pixsim7.backend.main.domain.game.stats import (
    WorldStatsConfig,
    StatDefinition,
    StatAxis,
    StatTier,
)


def run_async(coro):
    return asyncio.run(coro)


@pytest.fixture
def relationships_config() -> WorldStatsConfig:
    return WorldStatsConfig(
        definitions={
            "relationships": StatDefinition(
                id="relationships",
                axes=[
                    StatAxis(name="affinity", default_value=50.0, min_value=0.0, max_value=100.0),
                    StatAxis(name="trust", default_value=50.0, min_value=0.0, max_value=100.0),
                ],
                tiers=[
                    StatTier(id="friend", axis_name="affinity", min=70.0, max=100.0),
                    StatTier(id="stranger", axis_name="affinity", min=0.0, max=69.0),
                ],
            ),
        },
    )


def _make_service(monkeypatch, config) -> StatService:
    svc = StatService(db=None)

    async def _fake_config(world_id):
        return config

    async def _no_cache(*args, **kwargs):
        return None

    monkeypatch.setattr(svc, "_get_world_stats_config", _fake_config)
    # Bypass redis cache so normalization always recomputes + re-mirrors.
    monkeypatch.setattr(svc, "_get_cached_stats", _no_cache)
    monkeypatch.setattr(svc, "_cache_stats", _no_cache)
    return svc


def _session(stats=None) -> GameSession:
    return GameSession(
        id=1, user_id=1, world_id=1, scene_id=None, flags={}, stats=stats or {}
    )


def test_npc_normalized_stats_remirrored_to_canonical(monkeypatch, relationships_config):
    svc = _make_service(monkeypatch, relationships_config)
    session = _session(stats={"relationships": {"npc:5": {"affinity": 75.0}}})

    run_async(svc.normalize_session_stats(session, "relationships"))

    comp = get_npc_component(session.flags, session.world_id, 5, "stats:relationships")
    assert comp is not None, "canonical component must be created by re-mirror"
    data = comp["data"]
    # Raw axis preserved.
    assert data["affinity"] == 75.0
    # Computed tier present on canonical (the whole point of the re-mirror:
    # canonical must carry computed fields, not just raw axes). StatEngine
    # stores per-axis tiers as "{axis}TierId".
    assert data.get("affinityTierId") == "friend", (
        f"canonical must carry computed tier; got {data!r}"
    )


def test_session_scope_not_mirrored(monkeypatch, relationships_config):
    # Session/world-scoped entities have no canonical npc home; they must NOT
    # create a spurious npc GameObject.
    svc = _make_service(monkeypatch, relationships_config)
    session = _session(stats={"relationships": {"session": {"affinity": 80.0}}})

    run_async(svc.normalize_session_stats(session, "relationships"))

    objects = (session.flags.get("gameObjects") or {}).get("objects") or {}
    npc_refs = [ref for ref in objects if ref.startswith("npc:")]
    assert npc_refs == [], (
        f"session-scope normalize must not create npc objects; got {npc_refs}"
    )
