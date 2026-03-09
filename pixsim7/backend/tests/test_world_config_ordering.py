"""
World Config Ordering Parity Tests

Verifies that backend tier/level ordering matches expected behavior.
Frontend has equivalent tests in packages/shared/types/src/__tests__/worldConfig.test.ts
"""

import pytest
from pixsim7.backend.main.domain.game.stats import (
    WorldStatsConfig,
    StatDefinition,
    StatAxis,
    StatTier,
    StatLevel,
    StatCondition,
    register_core_stat_packages,
    get_world_config,
)


@pytest.fixture(autouse=True)
def setup_packages():
    """Ensure core packages are registered."""
    register_core_stat_packages()


class TestTierOrdering:
    """Test tier ordering (sorted by min value)."""

    def test_default_relationship_tiers_order(self):
        """Default tiers should be ordered: stranger < acquaintance < friend < close_friend < lover."""
        config = get_world_config(None)
        tier_order = config.tier_order

        expected = ["stranger", "acquaintance", "friend", "close_friend", "lover"]
        assert tier_order == expected

    def test_replaced_tier_sorted_by_min_value(self):
        """Replaced tier should be sorted by new min value."""
        world_meta = {
            "stats_config": {
                "definitions": {
                    "relationships": {
                        "tiers": [
                            # Replace "lover" tier with higher threshold and add "soulmate"
                            {"id": "lover", "axis_name": "affinity", "min": 80, "max": 94.99},
                            {"id": "soulmate", "axis_name": "affinity", "min": 95, "max": None},
                        ]
                    }
                }
            }
        }
        config = get_world_config(world_meta)
        tier_order = config.tier_order

        # Should include base tiers + new tier, sorted by min value
        # stranger(0) < acquaintance(10) < friend(30) < close_friend(60) < lover(80) < soulmate(95)
        assert "soulmate" in tier_order
        assert tier_order.index("soulmate") > tier_order.index("lover")


class TestLevelOrdering:
    """Test level ordering (sorted by priority)."""

    def test_default_intimacy_levels_order(self):
        """Default levels should be ordered by priority: light_flirt < deep_flirt < intimate < very_intimate < soulmates."""
        config = get_world_config(None)
        level_order = config.level_order

        expected = ["light_flirt", "deep_flirt", "intimate", "very_intimate", "soulmates"]
        assert level_order == expected

    def test_added_levels_sorted_by_priority(self):
        """Added levels should be sorted by priority with existing levels."""
        world_meta = {
            "stats_config": {
                "definitions": {
                    "relationships": {
                        "levels": [
                            # Add a new level with higher priority
                            {
                                "id": "eternal_bond",
                                "conditions": {"affinity": {"type": "min", "min_value": 99}},
                                "priority": 10,  # Between soulmates(5) and higher
                            },
                        ]
                    }
                }
            }
        }
        config = get_world_config(world_meta)
        level_order = config.level_order

        # Should include base levels + new level, sorted by priority
        assert "eternal_bond" in level_order
        assert level_order.index("eternal_bond") > level_order.index("soulmates")


class TestWorldConfigMerging:
    """Test that world overrides merge correctly with base packages."""

    def test_world_override_adds_tier_without_overlap(self):
        """World can add new tiers if they don't overlap with existing ones."""
        world_meta = {
            "stats_config": {
                "definitions": {
                    "relationships": {
                        "tiers": [
                            # Replace lover to make room for soulmate
                            {"id": "lover", "axis_name": "affinity", "min": 80, "max": 94.99},
                            {"id": "soulmate", "axis_name": "affinity", "min": 95, "max": None},
                        ]
                    }
                }
            }
        }
        config = get_world_config(world_meta)

        # Should have base tiers + new soulmate tier
        assert "soulmate" in config.tier_order
        assert "stranger" in config.tier_order  # Base tier still present

    def test_world_override_replaces_tier(self):
        """World can replace existing tier definition thresholds."""
        # Replace the lover tier with a higher threshold
        world_meta = {
            "stats_config": {
                "definitions": {
                    "relationships": {
                        "tiers": [
                            # Just replace 'lover' with higher threshold
                            {"id": "lover", "axis_name": "affinity", "min": 85, "max": None},
                        ]
                    }
                }
            }
        }
        config = get_world_config(world_meta)

        # Check that lover tier was replaced with new threshold
        relationships_def = config.stats_config.definitions.get("relationships")
        assert relationships_def is not None
        lover_tier = next((t for t in relationships_def.tiers if t.id == "lover"), None)
        assert lover_tier is not None
        assert lover_tier.min == 85  # New threshold (was 80)


class TestSchemaVersion:
    """Test schema version handling."""

    def test_config_includes_schema_version(self):
        """Config response should include schema version."""
        config = get_world_config(None)
        assert config.schema_version == 1

    def test_stats_config_version(self):
        """Stats config should include version."""
        config = get_world_config(None)
        assert config.stats_config.version == 1
