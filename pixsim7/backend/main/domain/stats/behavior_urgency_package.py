"""
Built-in Behavior Urgency Stat Package

Provides derived urgency scores for behavior/activity selection.
Computed from resources and/or drives - adapts to whatever packages are available.

Output axes represent urgency for different activity categories:
- rest_urgency: Need to rest (from low energy, high rest drive)
- eat_urgency: Need to eat (from low hunger/satiation)
- socialize_urgency: Need to socialize (from social drive)
- relax_urgency: Need to relax (from high stress)
- explore_urgency: Need to explore (from novelty drive)
- achieve_urgency: Need to accomplish (from achievement drive)

All urgency values are 0-100:
- 0 = no urgency (need satisfied)
- 100 = maximum urgency (need critical)

These scores can be used by behavior engines to weight activity selection.
"""

from __future__ import annotations

from .schemas import StatAxis, StatTier, StatLevel, StatCondition, StatDefinition
from .package_registry import StatPackage, register_stat_package
from .derivation_schemas import (
    DerivationCapability,
    DerivationFormula,
    TransformRule,
    TransformCondition,
    ConditionSpec,
)


BEHAVIOR_URGENCY_PACKAGE_ID = "core.behavior_urgency"


def get_behavior_urgency_definition() -> StatDefinition:
    """
    Get the behavior urgency StatDefinition.

    These are derived scores indicating urgency for various activity types.
    """
    axes = [
        StatAxis(
            name="rest_urgency",
            min_value=0.0,
            max_value=100.0,
            default_value=0.0,
            display_name="Rest Urgency",
            description="Urgency to rest/sleep, 0=rested, 100=exhausted",
        ),
        StatAxis(
            name="eat_urgency",
            min_value=0.0,
            max_value=100.0,
            default_value=0.0,
            display_name="Eat Urgency",
            description="Urgency to eat, 0=full, 100=starving",
        ),
        StatAxis(
            name="socialize_urgency",
            min_value=0.0,
            max_value=100.0,
            default_value=0.0,
            display_name="Socialize Urgency",
            description="Urgency to socialize, 0=connected, 100=lonely",
        ),
        StatAxis(
            name="relax_urgency",
            min_value=0.0,
            max_value=100.0,
            default_value=0.0,
            display_name="Relax Urgency",
            description="Urgency to relax/destress, 0=calm, 100=overwhelmed",
        ),
        StatAxis(
            name="explore_urgency",
            min_value=0.0,
            max_value=100.0,
            default_value=0.0,
            display_name="Explore Urgency",
            description="Urgency to explore/seek novelty, 0=stimulated, 100=bored",
        ),
        StatAxis(
            name="achieve_urgency",
            min_value=0.0,
            max_value=100.0,
            default_value=0.0,
            display_name="Achieve Urgency",
            description="Urgency to accomplish/achieve, 0=fulfilled, 100=stagnating",
        ),
    ]

    # Urgency level tiers
    urgency_tier_ranges = [
        ("none", 0.0, 19.99, "No Urgency"),
        ("low", 20.0, 39.99, "Low Urgency"),
        ("moderate", 40.0, 59.99, "Moderate Urgency"),
        ("high", 60.0, 79.99, "High Urgency"),
        ("critical", 80.0, None, "Critical Urgency"),
    ]

    tiers = []
    for axis in axes:
        for tier_id, min_val, max_val, display in urgency_tier_ranges:
            tiers.append(
                StatTier(
                    id=f"{axis.name}_{tier_id}",
                    axis_name=axis.name,
                    min=min_val,
                    max=max_val,
                    display_name=f"{display}",
                )
            )

    # Combined urgency levels
    levels = [
        StatLevel(
            id="crisis",
            conditions={
                "rest_urgency": StatCondition(type="min", min_value=80.0),
                "eat_urgency": StatCondition(type="min", min_value=70.0),
            },
            display_name="Survival Crisis",
            description="Multiple basic needs critically unmet",
            priority=15,
        ),
        StatLevel(
            id="basic_needs",
            conditions={
                "rest_urgency": StatCondition(type="min", min_value=60.0),
            },
            display_name="Basic Needs Priority",
            description="Rest/survival needs take precedence",
            priority=10,
        ),
        StatLevel(
            id="social_needs",
            conditions={
                "socialize_urgency": StatCondition(type="min", min_value=70.0),
                "rest_urgency": StatCondition(type="max", max_value=40.0),
            },
            display_name="Social Needs Priority",
            description="Social connection is priority",
            priority=8,
        ),
        StatLevel(
            id="growth_oriented",
            conditions={
                "achieve_urgency": StatCondition(type="min", min_value=60.0),
                "rest_urgency": StatCondition(type="max", max_value=40.0),
                "eat_urgency": StatCondition(type="max", max_value=40.0),
            },
            display_name="Growth Oriented",
            description="Ready to pursue achievement",
            priority=7,
        ),
        StatLevel(
            id="balanced",
            conditions={
                "rest_urgency": StatCondition(type="max", max_value=30.0),
                "eat_urgency": StatCondition(type="max", max_value=30.0),
                "socialize_urgency": StatCondition(type="max", max_value=40.0),
            },
            display_name="Balanced",
            description="All basic needs satisfied",
            priority=5,
        ),
    ]

    return StatDefinition(
        id="behavior_urgency",
        display_name="Behavior Urgency",
        description="Derived urgency scores for activity selection",
        axes=axes,
        tiers=tiers,
        levels=levels,
    )


def get_urgency_from_resources_derivation() -> DerivationCapability:
    """
    Derivation capability for computing urgency from resources.

    Inverts resource values since low resource = high urgency:
    - rest_urgency = 100 - energy
    - eat_urgency = 100 - satiation
    - relax_urgency = stress (already inverted)
    """
    return DerivationCapability(
        id="urgency_from_resources",
        from_semantic_types=["energy_resource"],  # Minimum: energy
        to_stat_definition="behavior_urgency",
        formulas=[
            # Rest urgency from energy (inverted: low energy = high urgency)
            DerivationFormula(
                source_semantic_types={"energy": "energy_resource"},
                weights={"energy": -1.0},  # Invert
                output_axis="rest_urgency",
                transform="weighted_avg",
                multi_source_strategy="weighted_avg",
                normalize=True,
                offset=100.0,  # 100 - energy
            ),
            # Eat urgency from satiation (inverted)
            DerivationFormula(
                source_semantic_types={"satiation": "satiation_resource"},
                weights={"satiation": -1.0},
                output_axis="eat_urgency",
                transform="weighted_avg",
                multi_source_strategy="weighted_avg",
                normalize=True,
                offset=100.0,
            ),
            # Relax urgency from stress (direct, already 0-100 where 100=stressed)
            DerivationFormula(
                source_semantic_types={"stress": "stress_indicator"},
                weights={"stress": 1.0},
                output_axis="relax_urgency",
                transform="weighted_avg",
                multi_source_strategy="weighted_avg",
                normalize=True,
                offset=0.0,
            ),
        ],
        transforms=[
            TransformRule(
                output_key="priority_need",
                conditions=[
                    TransformCondition(
                        when={"rest_urgency": ConditionSpec(gte=80)},
                        then="rest",
                    ),
                    TransformCondition(
                        when={"eat_urgency": ConditionSpec(gte=80)},
                        then="eat",
                    ),
                    TransformCondition(
                        when={"relax_urgency": ConditionSpec(gte=70)},
                        then="relax",
                    ),
                    TransformCondition(
                        when={"rest_urgency": ConditionSpec(gte=60)},
                        then="rest",
                    ),
                    TransformCondition(
                        when={"eat_urgency": ConditionSpec(gte=60)},
                        then="eat",
                    ),
                ],
                default="none",
            ),
        ],
        priority=60,
        description="Derives urgency scores from resource levels",
        enabled_by_default=True,
    )


def get_urgency_from_drives_derivation() -> DerivationCapability:
    """
    Derivation capability for computing urgency from drives.

    Drive values are already urgency-oriented (0=satisfied, 100=urgent),
    so we map them directly.
    """
    return DerivationCapability(
        id="urgency_from_drives",
        from_semantic_types=["social_drive"],  # Minimum: social drive
        to_stat_definition="behavior_urgency",
        formulas=[
            # Socialize urgency from social drive (direct mapping)
            DerivationFormula(
                source_semantic_types={"social": "social_drive"},
                weights={"social": 1.0},
                output_axis="socialize_urgency",
                transform="weighted_avg",
                multi_source_strategy="weighted_avg",
                normalize=True,
                offset=0.0,
            ),
            # Rest urgency also from rest drive
            DerivationFormula(
                source_semantic_types={"rest": "rest_drive"},
                weights={"rest": 1.0},
                output_axis="rest_urgency",
                transform="weighted_avg",
                multi_source_strategy="weighted_avg",
                normalize=True,
                offset=0.0,
            ),
            # Explore urgency from novelty drive
            DerivationFormula(
                source_semantic_types={"novelty": "novelty_drive"},
                weights={"novelty": 1.0},
                output_axis="explore_urgency",
                transform="weighted_avg",
                multi_source_strategy="weighted_avg",
                normalize=True,
                offset=0.0,
            ),
            # Achieve urgency from achievement drive
            DerivationFormula(
                source_semantic_types={"achievement": "achievement_drive"},
                weights={"achievement": 1.0},
                output_axis="achieve_urgency",
                transform="weighted_avg",
                multi_source_strategy="weighted_avg",
                normalize=True,
                offset=0.0,
            ),
        ],
        transforms=[
            TransformRule(
                output_key="priority_activity",
                conditions=[
                    TransformCondition(
                        when={"socialize_urgency": ConditionSpec(gte=75)},
                        then="socialize",
                    ),
                    TransformCondition(
                        when={"explore_urgency": ConditionSpec(gte=70)},
                        then="explore",
                    ),
                    TransformCondition(
                        when={"achieve_urgency": ConditionSpec(gte=70)},
                        then="achieve",
                    ),
                    TransformCondition(
                        when={"socialize_urgency": ConditionSpec(gte=50)},
                        then="socialize",
                    ),
                ],
                default="none",
            ),
        ],
        priority=65,  # After resource-based urgency
        description="Derives urgency scores from motivational drives",
        enabled_by_default=True,
    )


def register_behavior_urgency_package() -> None:
    """Register the behavior urgency stat package."""
    definition = get_behavior_urgency_definition()
    pkg = StatPackage(
        id=BEHAVIOR_URGENCY_PACKAGE_ID,
        label="Behavior Urgency",
        description="Derived urgency scores for behavior/activity selection.",
        category="behavior",
        definitions={"behavior_urgency": definition},
        source_plugin_id=None,
        derivation_capabilities=[
            get_urgency_from_resources_derivation(),
            get_urgency_from_drives_derivation(),
        ],
    )
    register_stat_package(pkg)


# NOTE: Package is registered via register_core_stat_packages() in __init__.py
# This allows plugin system to control when packages are loaded.
