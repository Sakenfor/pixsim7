"""
Built-in Resources Stat Package

Provides common resource stats for life simulation games.
These are consumable/regenerating stats that affect NPC behavior and capabilities.

Axes:
- Energy: Physical/mental energy, depletes with activity, recovers with rest
- Hunger: Satiation level, depletes over time, recovered by eating
- Stamina: Physical endurance, depletes with exertion, recovers with rest
- Health: Physical wellbeing, affected by injuries/illness, recovers over time
- Stress: Mental load, accumulates with pressure, relieved by relaxation

Tiers indicate urgency levels (critical, low, moderate, good, excellent).
Multi-axis levels can define combined states (e.g., "exhausted" = low energy + low stamina).
"""

from __future__ import annotations

from .schemas import StatAxis, StatTier, StatLevel, StatCondition, StatDefinition
from .package_registry import StatPackage, register_stat_package


RESOURCES_PACKAGE_ID = "core.resources"


def get_default_resources_definition() -> StatDefinition:
    """
    Get the default resources StatDefinition for life simulation.

    Returns:
        StatDefinition with:
        - 5 axes: energy, hunger, stamina, health, stress (0-100)
        - Tiers per axis indicating urgency (critical, low, moderate, good, excellent)
        - Multi-axis levels for combined states (exhausted, starving, burnt_out, etc.)

    Usage:
        # In GameWorld.meta
        world.meta = {
            "stats_config": {
                "version": 1,
                "definitions": {
                    "resources": get_default_resources_definition().dict()
                }
            }
        }
    """
    axes = [
        StatAxis(
            name="energy",
            min_value=0.0,
            max_value=100.0,
            default_value=100.0,  # Start fully rested
            display_name="Energy",
            description="Physical and mental energy, depletes with activity",
            semantic_type="energy_resource",
            semantic_weight=1.0,
        ),
        StatAxis(
            name="hunger",
            min_value=0.0,
            max_value=100.0,
            default_value=100.0,  # Start fully fed (100 = full, 0 = starving)
            display_name="Hunger",
            description="Satiation level, 100=full, 0=starving",
            semantic_type="satiation_resource",
            semantic_weight=1.0,
        ),
        StatAxis(
            name="stamina",
            min_value=0.0,
            max_value=100.0,
            default_value=100.0,
            display_name="Stamina",
            description="Physical endurance for sustained activity",
            semantic_type="stamina_resource",
            semantic_weight=1.0,
        ),
        StatAxis(
            name="health",
            min_value=0.0,
            max_value=100.0,
            default_value=100.0,
            display_name="Health",
            description="Physical wellbeing, affected by injuries and illness",
            semantic_type="health_resource",
            semantic_weight=1.0,
        ),
        StatAxis(
            name="stress",
            min_value=0.0,
            max_value=100.0,
            default_value=0.0,  # Start unstressed (0 = calm, 100 = overwhelmed)
            display_name="Stress",
            description="Mental load, 0=relaxed, 100=overwhelmed",
            semantic_type="stress_indicator",
            semantic_weight=1.0,
        ),
    ]

    # Tiers for positive resources (energy, hunger, stamina, health)
    # Higher = better
    positive_tier_ranges = [
        ("critical", 0.0, 9.99, "Critical"),
        ("low", 10.0, 29.99, "Low"),
        ("moderate", 30.0, 59.99, "Moderate"),
        ("good", 60.0, 84.99, "Good"),
        ("excellent", 85.0, None, "Excellent"),
    ]

    # Tiers for stress (inverted - lower = better)
    stress_tier_ranges = [
        ("relaxed", 0.0, 14.99, "Relaxed"),
        ("mild", 15.0, 34.99, "Mild"),
        ("moderate", 35.0, 59.99, "Moderate"),
        ("high", 60.0, 84.99, "High"),
        ("overwhelming", 85.0, None, "Overwhelming"),
    ]

    tiers = []

    # Apply positive tiers to energy, hunger, stamina, health
    for axis_name in ["energy", "hunger", "stamina", "health"]:
        for tier_id, min_val, max_val, display in positive_tier_ranges:
            tiers.append(
                StatTier(
                    id=f"{axis_name}_{tier_id}",
                    axis_name=axis_name,
                    min=min_val,
                    max=max_val,
                    display_name=f"{display} {axis_name.title()}",
                )
            )

    # Apply stress tiers
    for tier_id, min_val, max_val, display in stress_tier_ranges:
        tiers.append(
            StatTier(
                id=f"stress_{tier_id}",
                axis_name="stress",
                min=min_val,
                max=max_val,
                display_name=f"{display} Stress",
            )
        )

    # Multi-axis levels for combined states
    levels = [
        # Critical combined states
        StatLevel(
            id="exhausted",
            conditions={
                "energy": StatCondition(type="max", max_value=20.0),
                "stamina": StatCondition(type="max", max_value=30.0),
            },
            display_name="Exhausted",
            description="Severely depleted energy and stamina",
            priority=10,
        ),
        StatLevel(
            id="starving",
            conditions={
                "hunger": StatCondition(type="max", max_value=15.0),
            },
            display_name="Starving",
            description="Critically low food, needs to eat immediately",
            priority=12,
        ),
        StatLevel(
            id="burnt_out",
            conditions={
                "energy": StatCondition(type="max", max_value=30.0),
                "stress": StatCondition(type="min", min_value=70.0),
            },
            display_name="Burnt Out",
            description="Low energy combined with high stress",
            priority=11,
        ),
        StatLevel(
            id="collapsing",
            conditions={
                "energy": StatCondition(type="max", max_value=10.0),
                "health": StatCondition(type="max", max_value=30.0),
            },
            display_name="Collapsing",
            description="Critical energy and health, needs immediate rest",
            priority=15,
        ),

        # Warning states
        StatLevel(
            id="tired",
            conditions={
                "energy": StatCondition(type="range", min_value=20.0, max_value=40.0),
            },
            display_name="Tired",
            description="Low energy, should rest soon",
            priority=5,
        ),
        StatLevel(
            id="hungry",
            conditions={
                "hunger": StatCondition(type="range", min_value=15.0, max_value=35.0),
            },
            display_name="Hungry",
            description="Getting hungry, should eat soon",
            priority=5,
        ),
        StatLevel(
            id="stressed",
            conditions={
                "stress": StatCondition(type="range", min_value=60.0, max_value=84.99),
            },
            display_name="Stressed",
            description="High stress, needs relaxation",
            priority=6,
        ),
        StatLevel(
            id="unwell",
            conditions={
                "health": StatCondition(type="range", min_value=30.0, max_value=60.0),
            },
            display_name="Unwell",
            description="Health is compromised, needs care",
            priority=7,
        ),

        # Positive combined states
        StatLevel(
            id="peak_condition",
            conditions={
                "energy": StatCondition(type="min", min_value=85.0),
                "health": StatCondition(type="min", min_value=90.0),
                "stamina": StatCondition(type="min", min_value=85.0),
                "stress": StatCondition(type="max", max_value=20.0),
            },
            display_name="Peak Condition",
            description="Excellent physical and mental state",
            priority=10,
        ),
        StatLevel(
            id="well_rested",
            conditions={
                "energy": StatCondition(type="min", min_value=90.0),
                "stress": StatCondition(type="max", max_value=15.0),
            },
            display_name="Well Rested",
            description="High energy and low stress",
            priority=8,
        ),
        StatLevel(
            id="satisfied",
            conditions={
                "hunger": StatCondition(type="min", min_value=80.0),
                "energy": StatCondition(type="min", min_value=60.0),
            },
            display_name="Satisfied",
            description="Well fed and reasonably energetic",
            priority=6,
        ),

        # Neutral/normal state
        StatLevel(
            id="normal",
            conditions={
                "energy": StatCondition(type="range", min_value=40.0, max_value=70.0),
                "hunger": StatCondition(type="min", min_value=35.0),
                "health": StatCondition(type="min", min_value=60.0),
            },
            display_name="Normal",
            description="Baseline functional state",
            priority=1,
        ),
    ]

    return StatDefinition(
        id="resources",
        display_name="Resources",
        description="Life simulation resources: energy, hunger, stamina, health, stress",
        axes=axes,
        tiers=tiers,
        levels=levels,
    )


def register_core_resources_package() -> None:
    """Register the built-in core resources stat package."""
    definition = get_default_resources_definition()
    pkg = StatPackage(
        id=RESOURCES_PACKAGE_ID,
        label="Core Resources",
        description="Life simulation resources: energy, hunger, stamina, health, stress.",
        category="resources",
        definitions={"resources": definition},
        source_plugin_id=None,
    )
    register_stat_package(pkg)


# NOTE: Package is registered via register_core_stat_packages() in __init__.py
# This allows plugin system to control when packages are loaded.
