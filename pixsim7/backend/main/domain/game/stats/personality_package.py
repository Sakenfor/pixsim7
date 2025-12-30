"""
Built-in Personality Stat Package

Provides a Big Five personality traits system as a reusable stat package.
Worlds can opt in by copying or referencing this StatDefinition.

Uses canonical trait definitions from domain/game/personality/traits.py.
See that module for the single source of truth on trait names, descriptions, etc.
"""

from __future__ import annotations

from .schemas import StatAxis, StatTier, StatDefinition
from .package_registry import StatPackage, register_stat_package

from ..personality import (
    PersonalityTrait,
    PERSONALITY_TRAITS,
    PERSONALITY_TIER_IDS,
    get_trait_info,
)


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
    # Build axes from canonical trait definitions
    axes = []
    for trait in PERSONALITY_TRAITS:
        info = get_trait_info(trait)
        axes.append(
            StatAxis(
                name=info.name,
                min_value=0.0,
                max_value=100.0,
                default_value=50.0,
                display_name=info.display_name,
                description=info.description,
                semantic_type=info.semantic_type,
                semantic_weight=1.0,
            )
        )

    # Create tiers for each axis using canonical tier IDs
    # Tier ranges: (tier_id, min, max) - max is None for open-ended
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
