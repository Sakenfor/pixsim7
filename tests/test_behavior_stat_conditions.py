"""
Tests for stat-aware behavior conditions (Task 110).

Tests the integration between the behavior system and stat system,
ensuring that stat_axis_* conditions work correctly and that legacy
relationship_* conditions maintain backwards compatibility.
"""

import pytest
from pixsim7.backend.main.domain.game.behavior.conditions import (
    evaluate_condition,
    _eval_stat_axis_gt,
    _eval_stat_axis_lt,
    _eval_stat_axis_between,
    _eval_relationship_gt,
    _eval_relationship_lt,
    _get_stat_value,
)


def _build_context_with_stats(
    session_stats=None,
    npc_stats=None,
    legacy_relationships=None,
):
    """Helper to build evaluation context with stat data."""
    class MockSession:
        def __init__(self, stats):
            self.stats = stats or {}

    return {
        "session": MockSession(session_stats) if session_stats else None,
        "npc_stats": npc_stats or {},
        "relationships": legacy_relationships or {},
    }


# ==================
# Test stat_axis_gt
# ==================


def test_stat_axis_gt_with_session_stats():
    """stat_axis_gt should read from session.stats for relational stats."""
    condition = {
        "type": "stat_axis_gt",
        "statDefinition": "relationships",
        "npcIdOrRole": "npc:5",
        "axis": "affinity",
        "threshold": 50,
    }

    # Value above threshold
    context = _build_context_with_stats(
        session_stats={"relationships": {"npc:5": {"affinity": 60}}}
    )
    assert evaluate_condition(condition, context) is True

    # Value equal to threshold (not greater)
    context = _build_context_with_stats(
        session_stats={"relationships": {"npc:5": {"affinity": 50}}}
    )
    assert evaluate_condition(condition, context) is False

    # Value below threshold
    context = _build_context_with_stats(
        session_stats={"relationships": {"npc:5": {"affinity": 40}}}
    )
    assert evaluate_condition(condition, context) is False


def test_stat_axis_gt_with_entity_stats():
    """stat_axis_gt should read from npc_stats for entity-owned stats."""
    condition = {
        "type": "stat_axis_gt",
        "statDefinition": "mood",
        "axis": "stress",
        "threshold": 30,
    }

    # Value above threshold (no npcIdOrRole for entity stats)
    context = _build_context_with_stats(npc_stats={"mood": {"stress": 40}})
    assert evaluate_condition(condition, context) is True

    # Value below threshold
    context = _build_context_with_stats(npc_stats={"mood": {"stress": 20}})
    assert evaluate_condition(condition, context) is False


def test_stat_axis_gt_fallback_to_legacy():
    """stat_axis_gt should fall back to legacy relationships dict."""
    condition = {
        "type": "stat_axis_gt",
        "statDefinition": "relationships",
        "npcIdOrRole": "npc:5",
        "axis": "affinity",
        "threshold": 50,
    }

    # No stat system data, but legacy relationships exists
    context = _build_context_with_stats(
        legacy_relationships={"npc:5": {"affinity": 60}}
    )
    assert evaluate_condition(condition, context) is True


# ==================
# Test stat_axis_lt
# ==================


def test_stat_axis_lt():
    """stat_axis_lt should check if value < threshold."""
    condition = {
        "type": "stat_axis_lt",
        "statDefinition": "relationships",
        "npcIdOrRole": "npc:5",
        "axis": "trust",
        "threshold": 30,
    }

    # Value below threshold
    context = _build_context_with_stats(
        session_stats={"relationships": {"npc:5": {"trust": 20}}}
    )
    assert evaluate_condition(condition, context) is True

    # Value equal to threshold (not less)
    context = _build_context_with_stats(
        session_stats={"relationships": {"npc:5": {"trust": 30}}}
    )
    assert evaluate_condition(condition, context) is False

    # Value above threshold
    context = _build_context_with_stats(
        session_stats={"relationships": {"npc:5": {"trust": 40}}}
    )
    assert evaluate_condition(condition, context) is False


# ==================
# Test stat_axis_between
# ==================


def test_stat_axis_between():
    """stat_axis_between should check if min <= value <= max."""
    condition = {
        "type": "stat_axis_between",
        "statDefinition": "skills",
        "axis": "strength",
        "min": 40,
        "max": 80,
    }

    # Value in range
    context = _build_context_with_stats(npc_stats={"skills": {"strength": 60}})
    assert evaluate_condition(condition, context) is True

    # Value at min boundary
    context = _build_context_with_stats(npc_stats={"skills": {"strength": 40}})
    assert evaluate_condition(condition, context) is True

    # Value at max boundary
    context = _build_context_with_stats(npc_stats={"skills": {"strength": 80}})
    assert evaluate_condition(condition, context) is True

    # Value below min
    context = _build_context_with_stats(npc_stats={"skills": {"strength": 30}})
    assert evaluate_condition(condition, context) is False

    # Value above max
    context = _build_context_with_stats(npc_stats={"skills": {"strength": 90}})
    assert evaluate_condition(condition, context) is False


# ==================
# Test legacy relationship_gt
# ==================


def test_relationship_gt_backwards_compatible():
    """relationship_gt should work with legacy format using 'metric' field."""
    condition = {
        "type": "relationship_gt",
        "npcIdOrRole": "npc:5",
        "metric": "affinity",
        "threshold": 50,
    }

    # Should work with stat system
    context = _build_context_with_stats(
        session_stats={"relationships": {"npc:5": {"affinity": 60}}}
    )
    assert evaluate_condition(condition, context) is True

    # Should also work with legacy relationships dict
    context = _build_context_with_stats(
        legacy_relationships={"npc:5": {"affinity": 60}}
    )
    assert evaluate_condition(condition, context) is True


def test_relationship_gt_supports_axis_field():
    """relationship_gt should also support 'axis' field (new format)."""
    condition = {
        "type": "relationship_gt",
        "npcIdOrRole": "npc:5",
        "axis": "chemistry",
        "threshold": 40,
    }

    context = _build_context_with_stats(
        session_stats={"relationships": {"npc:5": {"chemistry": 50}}}
    )
    assert evaluate_condition(condition, context) is True


def test_relationship_gt_defaults_to_affinity():
    """relationship_gt should default to 'affinity' axis if neither metric nor axis specified."""
    condition = {
        "type": "relationship_gt",
        "npcIdOrRole": "npc:5",
        "threshold": 50,
    }

    context = _build_context_with_stats(
        session_stats={"relationships": {"npc:5": {"affinity": 60}}}
    )
    assert evaluate_condition(condition, context) is True


# ==================
# Test legacy relationship_lt
# ==================


def test_relationship_lt_backwards_compatible():
    """relationship_lt should work with legacy format."""
    condition = {
        "type": "relationship_lt",
        "npcIdOrRole": "npc:5",
        "metric": "tension",
        "threshold": 30,
    }

    context = _build_context_with_stats(
        session_stats={"relationships": {"npc:5": {"tension": 20}}}
    )
    assert evaluate_condition(condition, context) is True


# ==================
# Test equivalence between legacy and stat-aware conditions
# ==================


def test_legacy_and_stat_aware_are_equivalent():
    """
    Legacy relationship_gt and stat_axis_gt with statDefinition="relationships"
    should produce identical results.
    """
    context = _build_context_with_stats(
        session_stats={"relationships": {"npc:5": {"affinity": 60}}}
    )

    legacy_condition = {
        "type": "relationship_gt",
        "npcIdOrRole": "npc:5",
        "metric": "affinity",
        "threshold": 50,
    }

    stat_aware_condition = {
        "type": "stat_axis_gt",
        "statDefinition": "relationships",
        "npcIdOrRole": "npc:5",
        "axis": "affinity",
        "threshold": 50,
    }

    legacy_result = evaluate_condition(legacy_condition, context)
    stat_aware_result = evaluate_condition(stat_aware_condition, context)

    assert legacy_result == stat_aware_result == True


def test_missing_stat_returns_default():
    """When stat is missing, should return default value (0.0)."""
    condition = {
        "type": "stat_axis_gt",
        "statDefinition": "relationships",
        "npcIdOrRole": "npc:999",  # Nonexistent NPC
        "axis": "affinity",
        "threshold": 50,
    }

    context = _build_context_with_stats(
        session_stats={"relationships": {"npc:5": {"affinity": 60}}}
    )

    # Should return False because default (0) is not > 50
    assert evaluate_condition(condition, context) is False


def test_missing_axis_returns_default():
    """When axis is missing, should return default value (0.0)."""
    condition = {
        "type": "stat_axis_gt",
        "statDefinition": "relationships",
        "npcIdOrRole": "npc:5",
        "axis": "nonexistent_axis",
        "threshold": 50,
    }

    context = _build_context_with_stats(
        session_stats={"relationships": {"npc:5": {"affinity": 60}}}
    )

    # Should return False because default (0) is not > 50
    assert evaluate_condition(condition, context) is False


# ==================
# Test _get_stat_value helper
# ==================


def test_get_stat_value_priority_order():
    """_get_stat_value should check session stats, then entity stats, then legacy, then default."""
    context = _build_context_with_stats(
        session_stats={"relationships": {"npc:5": {"affinity": 100}}},
        npc_stats={"relationships": {"affinity": 50}},
        legacy_relationships={"npc:5": {"affinity": 25}},
    )

    # Should prioritize session stats for relational stats
    value = _get_stat_value("relationships", "affinity", context, "npc:5")
    assert value == 100

    # Entity stats should be used for non-relational stats
    value = _get_stat_value("mood", "stress", context, None)
    assert value == 0.0  # Not present, returns default


def test_get_stat_value_entity_stats():
    """_get_stat_value should read entity stats when no npcIdOrRole."""
    context = _build_context_with_stats(npc_stats={"mood": {"stress": 75}})

    value = _get_stat_value("mood", "stress", context, None)
    assert value == 75


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
