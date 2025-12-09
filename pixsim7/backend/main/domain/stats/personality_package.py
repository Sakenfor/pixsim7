"""
Built-in Personality Stat Package

Provides a Big Five personality traits system as a reusable stat package.
Worlds can opt in by copying or referencing this StatDefinition.

The Big Five model includes:
- Openness: Creativity, curiosity, preference for novelty
- Conscientiousness: Organization, dependability, self-discipline
- Extraversion: Energy, sociability, talkativeness
- Agreeableness: Cooperation, trust, helpfulness
- Neuroticism: Emotional instability, anxiety, moodiness

Each axis has tiers for easy categorization (e.g., "very_low", "low", "moderate", "high", "very_high").
"""

from __future__ import annotations

from .schemas import StatAxis, StatTier, StatDefinition
from .package_registry import StatPackage, register_stat_package


PERSONALITY_PACKAGE_ID = "core.personality"


def get_default_personality_definition() -> StatDefinition:
    """
    Get the default Big Five personality StatDefinition.

    Returns:
        StatDefinition with:
        - 5 axes: openness, conscientiousness, extraversion, agreeableness, neuroticism (0-100)
        - 5 tiers per axis: very_low, low, moderate, high, very_high

    Usage:
        # In GameWorld.meta
        world.meta = {
            "stats_config": {
                "version": 1,
                "definitions": {
                    "personality": get_default_personality_definition().dict()
                }
            }
        }
    """
    # Define the Big Five axes with semantic types
    axes = [
        StatAxis(
            name="openness",
            min_value=0.0,
            max_value=100.0,
            default_value=50.0,
            display_name="Openness",
            description="Creativity, curiosity, and preference for novelty and variety",
            semantic_type="openness_trait",
            semantic_weight=1.0,
        ),
        StatAxis(
            name="conscientiousness",
            min_value=0.0,
            max_value=100.0,
            default_value=50.0,
            display_name="Conscientiousness",
            description="Organization, dependability, and self-discipline",
            semantic_type="conscientiousness_trait",
            semantic_weight=1.0,
        ),
        StatAxis(
            name="extraversion",
            min_value=0.0,
            max_value=100.0,
            default_value=50.0,
            display_name="Extraversion",
            description="Energy, sociability, and tendency to seek stimulation",
            semantic_type="extraversion_trait",
            semantic_weight=1.0,
        ),
        StatAxis(
            name="agreeableness",
            min_value=0.0,
            max_value=100.0,
            default_value=50.0,
            display_name="Agreeableness",
            description="Cooperation, trust, and consideration for others",
            semantic_type="agreeableness_trait",
            semantic_weight=1.0,
        ),
        StatAxis(
            name="neuroticism",
            min_value=0.0,
            max_value=100.0,
            default_value=50.0,
            display_name="Neuroticism",
            description="Emotional instability, anxiety, and tendency toward negative emotions",
            semantic_type="neuroticism_trait",
            semantic_weight=1.0,
        ),
    ]

    # Create tiers for each axis (same tier structure for all)
    tier_ranges = [
        ("very_low", 0.0, 19.99),
        ("low", 20.0, 39.99),
        ("moderate", 40.0, 59.99),
        ("high", 60.0, 79.99),
        ("very_high", 80.0, None),  # No upper bound
    ]

    tiers = []
    for axis in axes:
        for tier_id, min_val, max_val in tier_ranges:
            tiers.append(
                StatTier(
                    id=f"{axis.name}_{tier_id}",
                    axis_name=axis.name,
                    min=min_val,
                    max=max_val,
                    display_name=f"{tier_id.replace('_', ' ').title()} {axis.display_name}",
                )
            )

    return StatDefinition(
        id="personality",
        display_name="Personality (Big Five)",
        description="Big Five personality traits: openness, conscientiousness, extraversion, agreeableness, neuroticism",
        axes=axes,
        tiers=tiers,
        levels=[],  # No multi-axis levels for personality by default
    )


def register_core_personality_package() -> None:
    """Register the built-in core personality stat package."""
    definition = get_default_personality_definition()
    pkg = StatPackage(
        id=PERSONALITY_PACKAGE_ID,
        label="Core Personality (Big Five)",
        description="Big Five personality traits for NPC characterization.",
        category="personality",
        definitions={"personality": definition},
        source_plugin_id=None,
    )
    register_stat_package(pkg)


# NOTE: Package is registered via register_core_stat_packages() in __init__.py
# This allows plugin system to control when packages are loaded.
