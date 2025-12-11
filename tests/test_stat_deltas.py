"""
Tests for StatDelta and apply_stat_deltas functionality.

These tests ensure that the generic stat delta system correctly applies
stat changes through the StatEngine, replacing hardcoded clamping logic.
"""

import asyncio
import pytest
from pixsim7.backend.main.domain.game.models import GameSession, GameWorld
from pixsim7.backend.main.domain.game.npc_interactions import (
    StatDelta,
    RelationshipDelta,
)
from pixsim7.backend.main.domain.game.interaction_execution import (
    apply_stat_deltas,
    apply_relationship_deltas,
)
from pixsim7.backend.main.domain.stats import get_default_relationship_definition


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
    # The default relationship definition has min=0, max=100 for all axes
    definition = get_default_relationship_definition()

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

    with pytest.raises(ValueError, match="Unsupported package_id"):
        run_async(apply_stat_deltas(session, delta, world))


def test_apply_relationship_deltas_delegates_to_apply_stat_deltas(session, world):
    """apply_relationship_deltas should delegate to apply_stat_deltas."""
    # Use the legacy RelationshipDelta interface
    deltas = RelationshipDelta(
        affinity=10.0,
        trust=5.0,
        chemistry=3.0,
        tension=-2.0,
    )

    result = run_async(apply_relationship_deltas(session, npc_id=42, deltas=deltas, world=world))

    # Should have applied all deltas
    assert result["affinity"] == 10.0
    assert result["trust"] == 5.0
    assert result["chemistry"] == 3.0
    # Tension starts at 0, -2 would clamp to 0
    assert result["tension"] == 0.0

    # Should have set lastInteractionAt timestamp
    assert "lastInteractionAt" in result


def test_apply_relationship_deltas_preserves_timestamp_behavior(session, world):
    """apply_relationship_deltas should handle world_time vs real-time timestamps."""
    deltas = RelationshipDelta(affinity=5.0)

    # Test with world_time
    result1 = run_async(apply_relationship_deltas(
        session, npc_id=42, deltas=deltas, world_time=12345.0, world=world
    ))
    assert result1["lastInteractionAt"] == 12345.0

    # Test without world_time (should use real-time ISO format)
    result2 = run_async(apply_relationship_deltas(
        session, npc_id=43, deltas=deltas, world=world
    ))
    # Should be an ISO format string
    assert isinstance(result2["lastInteractionAt"], str)
    assert "T" in result2["lastInteractionAt"]  # ISO format contains 'T'


def test_apply_relationship_deltas_backward_compatible(session, world):
    """apply_relationship_deltas should work without 'world' parameter."""
    deltas = RelationshipDelta(affinity=10.0, trust=5.0)

    # Call without world parameter (backward compatibility)
    result = run_async(apply_relationship_deltas(session, npc_id=42, deltas=deltas))

    # Should still work and apply deltas
    assert result["affinity"] == 10.0
    assert result["trust"] == 5.0
    assert "lastInteractionAt" in result


def test_apply_relationship_deltas_uses_stat_definition_ranges(session, world):
    """apply_relationship_deltas should use StatDefinition ranges, not hardcoded 0-100."""
    # Create initial high values
    delta1 = RelationshipDelta(affinity=95.0, trust=95.0)
    run_async(apply_relationship_deltas(session, npc_id=42, deltas=delta1, world=world))

    # Apply delta that would exceed 100
    delta2 = RelationshipDelta(affinity=10.0)
    result = run_async(apply_relationship_deltas(session, npc_id=42, deltas=delta2, world=world))

    # Should be clamped to the stat definition's max (100.0)
    assert result["affinity"] == 100.0

    # Apply delta that would go below 0
    delta3 = RelationshipDelta(affinity=-200.0)
    result2 = run_async(apply_relationship_deltas(session, npc_id=42, deltas=delta3, world=world))

    # Should be clamped to the stat definition's min (0.0)
    assert result2["affinity"] == 0.0


def test_apply_relationship_deltas_empty_deltas(session, world):
    """apply_relationship_deltas should handle empty deltas (just timestamp update)."""
    # Create delta with no axes
    deltas = RelationshipDelta()

    result = run_async(apply_relationship_deltas(
        session, npc_id=42, deltas=deltas, world_time=12345.0, world=world
    ))

    # Should just set timestamp, no stat changes
    assert result["lastInteractionAt"] == 12345.0
    assert "affinity" not in result  # No axes were set
