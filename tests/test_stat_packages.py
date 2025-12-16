"""
Tests for the abstract stat system and stat package registry.

These tests focus on pure, world-agnostic behavior so they can run
without a database or plugin manager.
"""

from pixsim7.backend.main.domain.game.stats import (
    StatAxis,
    StatTier,
    StatLevel,
    StatDefinition,
    StatEngine,
    initialize_stat_package_entity,
    merge_stat_package_entity,
    normalize_stat_package_entity,
    normalize_stat_package_all,
)
from pixsim7.backend.main.domain.game.stats.package_registry import (
    list_stat_packages,
    find_stat_definitions,
)
from pixsim7.backend.main.domain.game.stats.relationships_package import (
    RELATIONSHIPS_PACKAGE_ID,
)


def _build_simple_stat_definition() -> StatDefinition:
    """Helper to build a small stat definition for tests."""
    return StatDefinition(
        id="test.stats",
        axes=[
            StatAxis(name="strength", min_value=0, max_value=100, default_value=10),
            StatAxis(name="agility", min_value=0, max_value=100, default_value=5),
        ],
        tiers=[
            StatTier(id="weak", axis_name="strength", min=0, max=39),
            StatTier(id="average", axis_name="strength", min=40, max=69),
            StatTier(id="strong", axis_name="strength", min=70, max=None),
        ],
        levels=[
            StatLevel(
                id="nimble",
                conditions={
                    "strength": {"type": "min", "min_value": 20},
                    "agility": {"type": "min", "min_value": 50},
                },
                priority=1,
            )
        ],
    )


def test_stat_engine_initialize_and_merge():
    """StatEngine should initialize defaults and merge overrides correctly."""
    definition = _build_simple_stat_definition()

    base = StatEngine.initialize_entity_stats(definition)
    # Defaults should match axis defaults
    assert base == {"strength": 10, "agility": 5}

    merged = StatEngine.merge_entity_stats(base, {"strength": 30})
    assert merged["strength"] == 30
    assert merged["agility"] == 5


def test_stat_engine_normalize_clamps_and_computes_tier_and_level():
    """Normalization should clamp values and compute tier/level IDs."""
    definition = _build_simple_stat_definition()

    # Values beyond max should be clamped
    stats = {"strength": 120, "agility": 60}
    normalized = StatEngine.normalize_entity_stats(stats, definition)

    # Strength is clamped to 100 and gets "strong" tier
    assert normalized["strength"] == 100
    assert normalized["strengthTierId"] == "strong"
    # Level "nimble" requires strength>=20 and agility>=50
    assert normalized["levelId"] == "nimble"


def test_stat_package_helpers_wrap_stat_engine():
    """Package helpers should delegate to StatEngine as expected."""
    definition = _build_simple_stat_definition()

    base = initialize_stat_package_entity(definition)
    assert base == {"strength": 10, "agility": 5}

    merged = merge_stat_package_entity(base, {"agility": 80})
    assert merged["strength"] == 10
    assert merged["agility"] == 80

    normalized_one = normalize_stat_package_entity(merged, definition)
    assert "strengthTierId" in normalized_one

    normalized_all = normalize_stat_package_all({"entity:1": merged}, definition)
    assert "entity:1" in normalized_all
    assert "strengthTierId" in normalized_all["entity:1"]


def test_relationships_package_registered_in_registry():
    """
    The relationships stat package should be registered at import time.

    This ensures tools and plugins can discover the built-in relationships
    definition via the registry without requiring a world.
    """
    packages = list_stat_packages()
    assert RELATIONSHIPS_PACKAGE_ID in packages

    # The package should expose a "relationships" StatDefinition
    pkg = packages[RELATIONSHIPS_PACKAGE_ID]
    assert "relationships" in pkg.definitions

    # find_stat_definitions should locate the same definition
    matches = find_stat_definitions("relationships")
    assert any(p.id == RELATIONSHIPS_PACKAGE_ID for p, _ in matches)

