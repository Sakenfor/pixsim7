"""
Tests for StatDelta and apply_stat_deltas functionality.

These tests ensure that the generic stat delta system correctly applies
stat changes through the StatEngine, replacing hardcoded clamping logic.
"""

import asyncio
import pytest
from pixsim7.backend.main.domain.game.core.models import GameSession, GameWorld
from pixsim7.backend.main.domain.game.interactions.npc_interactions import (
    StatDelta,
)
from pixsim7.backend.main.domain.game.interactions.interaction_execution import (
    apply_stat_deltas,
)
from pixsim7.backend.main.domain.game.stats import (
    register_core_stat_packages,
    clear_stat_packages,
)


def run_async(coro):
    """Helper to run async functions in sync tests."""
    return asyncio.run(coro)


@pytest.fixture
def session():
    """Create a minimal GameSession for testing."""
    return GameSession(
        id=1,
        world_id=1,
        world_time=0.0,
        stats={},
        flags={},
    )


@pytest.fixture(autouse=True)
def register_stat_packages():
    """Ensure core stat packages are registered for each test."""
    clear_stat_packages()
    register_core_stat_packages()
    yield


@pytest.fixture
def world():
    """Create a minimal GameWorld for testing."""
    return GameWorld(
        id=1,
        name="Test World",
        meta={},
    )


def test_apply_stat_deltas_basic(session, world):
    """apply_stat_deltas should apply deltas and clamp values using StatEngine."""
    # Create a stat delta for relationships
    delta = StatDelta(
        package_id="core.relationships",
        axes={"affinity": 5.0, "trust": 10.0},
        entity_type="npc",
        npc_id=42,
    )

    # Apply the delta
    result = run_async(apply_stat_deltas(session, delta, world))

    # Check that values were applied (starting from default 0)
    assert result["affinity"] == 5.0
    assert result["trust"] == 10.0

    # Check that session.stats was updated
    assert "relationships" in session.stats
    assert "npc:42" in session.stats["relationships"]
    assert session.stats["relationships"]["npc:42"]["affinity"] == 5.0
    assert session.stats["relationships"]["npc:42"]["trust"] == 10.0


def test_apply_stat_deltas_clamping(session, world):
    """apply_stat_deltas should clamp values according to StatDefinition."""
    # Create a delta that would exceed max
    delta = StatDelta(
        package_id="core.relationships",
        axes={"affinity": 150.0},  # Would exceed max of 100
        entity_type="npc",
        npc_id=42,
    )

    result = run_async(apply_stat_deltas(session, delta, world))

    # Should be clamped to max (100)
    assert result["affinity"] == 100.0

    # Create a delta that would go below min
    delta2 = StatDelta(
        package_id="core.relationships",
        axes={"affinity": -200.0},  # Would go below min of 0
        entity_type="npc",
        npc_id=42,
    )

    result2 = run_async(apply_stat_deltas(session, delta2, world))

    # Should be clamped to min (0)
    assert result2["affinity"] == 0.0


def test_apply_stat_deltas_incremental(session, world):
    """apply_stat_deltas should apply deltas incrementally to existing values."""
    # First delta
    delta1 = StatDelta(
        package_id="core.relationships",
        axes={"affinity": 30.0, "trust": 20.0},
        entity_type="npc",
        npc_id=42,
    )
    run_async(apply_stat_deltas(session, delta1, world))

    # Second delta (incremental)
    delta2 = StatDelta(
        package_id="core.relationships",
        axes={"affinity": 15.0, "trust": -5.0},
        entity_type="npc",
        npc_id=42,
    )
    result = run_async(apply_stat_deltas(session, delta2, world))

    # Should add to existing values
    assert result["affinity"] == 45.0  # 30 + 15
    assert result["trust"] == 15.0    # 20 - 5


def test_apply_stat_deltas_multiple_npcs(session, world):
    """apply_stat_deltas should handle multiple NPCs independently."""
    # Delta for NPC 1
    delta1 = StatDelta(
        package_id="core.relationships",
        axes={"affinity": 50.0},
        entity_type="npc",
        npc_id=1,
    )
    run_async(apply_stat_deltas(session, delta1, world))

    # Delta for NPC 2
    delta2 = StatDelta(
        package_id="core.relationships",
        axes={"affinity": 75.0},
        entity_type="npc",
        npc_id=2,
    )
    run_async(apply_stat_deltas(session, delta2, world))

    # Both NPCs should have independent values
    assert session.stats["relationships"]["npc:1"]["affinity"] == 50.0
    assert session.stats["relationships"]["npc:2"]["affinity"] == 75.0


def test_apply_stat_deltas_validates_npc_id(session, world):
    """apply_stat_deltas should require npc_id when entity_type is 'npc'."""
    # Create a delta without npc_id
    with pytest.raises(ValueError, match="npc_id is required"):
        delta = StatDelta(
            package_id="core.relationships",
            axes={"affinity": 5.0},
            entity_type="npc",
            # npc_id is missing
        )


def test_apply_stat_deltas_unsupported_package(session, world):
    """apply_stat_deltas should raise error for unsupported packages."""
    delta = StatDelta(
        package_id="unsupported.package",
        axes={"foo": 5.0},
        entity_type="npc",
        npc_id=42,
    )

    with pytest.raises(ValueError, match="Unknown stat package_id"):
        run_async(apply_stat_deltas(session, delta, world))
