"""
Built-in Drives Stat Package

Provides motivational drives/needs that influence NPC behavior and decision-making.
Based loosely on psychological need theories (Maslow, Self-Determination Theory).

Drives represent internal motivations that push NPCs toward certain activities:
- Social: Need for connection, conversation, belonging
- Rest: Need for sleep, relaxation, recovery
- Achievement: Need for accomplishment, progress, competence
- Autonomy: Need for choice, self-direction, independence
- Novelty: Need for new experiences, exploration, variety
- Safety: Need for security, stability, predictability

High drive values indicate unmet needs (urgency to act).
Low drive values indicate satisfied needs (no urgency).

Drives can be used by behavior systems to weight activity selection:
- High social drive → prefer socializing activities
- High rest drive → prefer sleep/relaxation activities
- etc.
"""

from __future__ import annotations

from .schemas import StatAxis, StatTier, StatLevel, StatCondition, StatDefinition
from .package_registry import StatPackage, register_stat_package


DRIVES_PACKAGE_ID = "core.drives"


def get_default_drives_definition() -> StatDefinition:
    """
    Get the default drives/needs StatDefinition for NPC motivation.

    Drives use inverted semantics:
    - 0 = need fully satisfied, no drive
    - 100 = need completely unmet, maximum drive/urgency

    Returns:
        StatDefinition with:
        - 6 axes: social, rest, achievement, autonomy, novelty, safety (0-100)
        - Tiers per axis indicating urgency level
        - Multi-axis levels for combined motivational states

    Usage:
        # In GameWorld.meta
        world.meta = {
            "stats_config": {
                "version": 1,
                "definitions": {
                    "drives": get_default_drives_definition().dict()
                }
            }
        }
    """
    axes = [
        StatAxis(
            name="social",
            min_value=0.0,
            max_value=100.0,
            default_value=30.0,
            display_name="Social Drive",
            description="Need for connection and belonging, 0=satisfied, 100=lonely",
            semantic_type="social_drive",
            semantic_weight=1.0,
        ),
        StatAxis(
            name="rest",
            min_value=0.0,
            max_value=100.0,
            default_value=20.0,
            display_name="Rest Drive",
            description="Need for sleep and recovery, 0=rested, 100=exhausted",
            semantic_type="rest_drive",
            semantic_weight=1.0,
        ),
        StatAxis(
            name="achievement",
            min_value=0.0,
            max_value=100.0,
            default_value=40.0,
            display_name="Achievement Drive",
            description="Need for accomplishment and progress, 0=fulfilled, 100=stagnating",
            semantic_type="achievement_drive",
            semantic_weight=1.0,
        ),
        StatAxis(
            name="autonomy",
            min_value=0.0,
            max_value=100.0,
            default_value=30.0,
            display_name="Autonomy Drive",
            description="Need for self-direction and choice, 0=free, 100=controlled",
            semantic_type="autonomy_drive",
            semantic_weight=1.0,
        ),
        StatAxis(
            name="novelty",
            min_value=0.0,
            max_value=100.0,
            default_value=40.0,
            display_name="Novelty Drive",
            description="Need for new experiences and variety, 0=stimulated, 100=bored",
            semantic_type="novelty_drive",
            semantic_weight=1.0,
        ),
        StatAxis(
            name="safety",
            min_value=0.0,
            max_value=100.0,
            default_value=10.0,
            display_name="Safety Drive",
            description="Need for security and stability, 0=secure, 100=threatened",
            semantic_type="safety_drive",
            semantic_weight=1.0,
        ),
    ]

    # Urgency tiers (higher value = more urgent)
    urgency_tier_ranges = [
        ("satisfied", 0.0, 19.99, "Satisfied"),
        ("low", 20.0, 39.99, "Low"),
        ("moderate", 40.0, 59.99, "Moderate"),
        ("high", 60.0, 79.99, "High"),
        ("urgent", 80.0, None, "Urgent"),
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
                    display_name=f"{display} {axis.display_name}",
                )
            )

    # Multi-axis levels for combined motivational states
    levels = [
        # Crisis states (multiple urgent needs)
        StatLevel(
            id="crisis",
            conditions={
                "rest": StatCondition(type="min", min_value=80.0),
                "safety": StatCondition(type="min", min_value=70.0),
            },
            display_name="Crisis",
            description="Multiple basic needs critically unmet",
            priority=15,
        ),
        StatLevel(
            id="isolation",
            conditions={
                "social": StatCondition(type="min", min_value=85.0),
                "autonomy": StatCondition(type="min", min_value=60.0),
            },
            display_name="Isolation",
            description="Severe loneliness with feeling of powerlessness",
            priority=12,
        ),
        StatLevel(
            id="burnout",
            conditions={
                "rest": StatCondition(type="min", min_value=75.0),
                "achievement": StatCondition(type="min", min_value=70.0),
            },
            display_name="Burnout",
            description="Exhausted yet unfulfilled",
            priority=12,
        ),

        # Single dominant drive states
        StatLevel(
            id="lonely",
            conditions={
                "social": StatCondition(type="min", min_value=70.0),
            },
            display_name="Lonely",
            description="Strong need for social connection",
            priority=8,
        ),
        StatLevel(
            id="restless",
            conditions={
                "novelty": StatCondition(type="min", min_value=75.0),
            },
            display_name="Restless",
            description="Craving new experiences and variety",
            priority=8,
        ),
        StatLevel(
            id="ambitious",
            conditions={
                "achievement": StatCondition(type="min", min_value=70.0),
                "rest": StatCondition(type="max", max_value=40.0),
            },
            display_name="Ambitious",
            description="Driven to accomplish, has energy to pursue goals",
            priority=9,
        ),
        StatLevel(
            id="constrained",
            conditions={
                "autonomy": StatCondition(type="min", min_value=75.0),
            },
            display_name="Constrained",
            description="Feeling controlled, needs freedom",
            priority=8,
        ),
        StatLevel(
            id="anxious",
            conditions={
                "safety": StatCondition(type="min", min_value=65.0),
            },
            display_name="Anxious",
            description="Feeling insecure or threatened",
            priority=9,
        ),

        # Positive/balanced states
        StatLevel(
            id="content",
            conditions={
                "social": StatCondition(type="max", max_value=30.0),
                "rest": StatCondition(type="max", max_value=30.0),
                "safety": StatCondition(type="max", max_value=25.0),
            },
            display_name="Content",
            description="Core needs well satisfied",
            priority=10,
        ),
        StatLevel(
            id="thriving",
            conditions={
                "social": StatCondition(type="max", max_value=25.0),
                "achievement": StatCondition(type="max", max_value=30.0),
                "autonomy": StatCondition(type="max", max_value=25.0),
                "rest": StatCondition(type="max", max_value=35.0),
            },
            display_name="Thriving",
            description="All major needs well balanced",
            priority=12,
        ),
        StatLevel(
            id="adventurous",
            conditions={
                "novelty": StatCondition(type="range", min_value=50.0, max_value=70.0),
                "safety": StatCondition(type="max", max_value=30.0),
                "rest": StatCondition(type="max", max_value=40.0),
            },
            display_name="Adventurous",
            description="Seeking novelty from a secure base",
            priority=7,
        ),
        StatLevel(
            id="social_butterfly",
            conditions={
                "social": StatCondition(type="max", max_value=20.0),
                "novelty": StatCondition(type="max", max_value=40.0),
            },
            display_name="Social Butterfly",
            description="Socially satisfied and engaged",
            priority=6,
        ),

        # Baseline
        StatLevel(
            id="baseline",
            conditions={
                "rest": StatCondition(type="range", min_value=20.0, max_value=50.0),
                "social": StatCondition(type="range", min_value=20.0, max_value=50.0),
            },
            display_name="Baseline",
            description="Normal motivational state",
            priority=1,
        ),
    ]

    return StatDefinition(
        id="drives",
        display_name="Drives (Motivational Needs)",
        description="Internal motivations that drive NPC behavior: social, rest, achievement, autonomy, novelty, safety",
        axes=axes,
        tiers=tiers,
        levels=levels,
    )


def register_core_drives_package() -> None:
    """Register the built-in core drives stat package."""
    definition = get_default_drives_definition()
    pkg = StatPackage(
        id=DRIVES_PACKAGE_ID,
        label="Core Drives (Motivational Needs)",
        description="Motivational drives that influence NPC behavior and decision-making.",
        category="motivation",
        definitions={"drives": definition},
        source_plugin_id=None,
    )
    register_stat_package(pkg)


# NOTE: Package is registered via register_core_stat_packages() in __init__.py
# This allows plugin system to control when packages are loaded.
