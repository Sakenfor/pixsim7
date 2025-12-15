"""
Built-in Mood Stat Package

Provides a valence-arousal mood model as a reusable stat package.
Based on Russell's circumplex model of affect.

Axes:
- Valence: Pleasure dimension (negative to positive emotions)
- Arousal: Activation dimension (low energy to high energy)

The combination of valence and arousal creates mood quadrants:
- High valence + High arousal = Excited, Elated, Happy
- High valence + Low arousal = Calm, Relaxed, Content
- Low valence + High arousal = Angry, Anxious, Stressed
- Low valence + Low arousal = Sad, Depressed, Bored

Multi-axis levels define these mood states based on both dimensions.
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


MOOD_PACKAGE_ID = "core.mood"


def get_default_mood_definition() -> StatDefinition:
    """
    Get the default valence-arousal mood StatDefinition.

    Returns:
        StatDefinition with:
        - 2 axes: valence (0-100), arousal (0-100)
        - Tiers for each axis (very_low to very_high)
        - Multi-axis levels for mood states (excited, calm, anxious, sad, neutral, etc.)

    Usage:
        # In GameWorld.meta
        world.meta = {
            "stats_config": {
                "version": 1,
                "definitions": {
                    "mood": get_default_mood_definition().dict()
                }
            }
        }
    """
    axes = [
        StatAxis(
            name="valence",
            min_value=0.0,
            max_value=100.0,
            default_value=50.0,
            display_name="Valence",
            description="Pleasure dimension: 0=negative emotions, 100=positive emotions"
        ),
        StatAxis(
            name="arousal",
            min_value=0.0,
            max_value=100.0,
            default_value=50.0,
            display_name="Arousal",
            description="Activation dimension: 0=low energy/calm, 100=high energy/activated"
        ),
    ]

    # Tiers for each axis
    tier_ranges = [
        ("very_low", 0.0, 19.99),
        ("low", 20.0, 39.99),
        ("moderate", 40.0, 59.99),
        ("high", 60.0, 79.99),
        ("very_high", 80.0, None),
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

    # Multi-axis mood levels (circumplex quadrants + variations)
    levels = [
        # High valence + High arousal quadrant
        StatLevel(
            id="excited",
            conditions={
                "valence": StatCondition(type="min", min_value=70.0),
                "arousal": StatCondition(type="min", min_value=70.0),
            },
            display_name="Excited",
            description="High positive emotion with high energy",
            priority=10,
        ),
        StatLevel(
            id="happy",
            conditions={
                "valence": StatCondition(type="min", min_value=60.0),
                "arousal": StatCondition(type="range", min_value=50.0, max_value=69.99),
            },
            display_name="Happy",
            description="Positive emotion with moderate energy",
            priority=8,
        ),
        StatLevel(
            id="elated",
            conditions={
                "valence": StatCondition(type="min", min_value=80.0),
                "arousal": StatCondition(type="min", min_value=60.0),
            },
            display_name="Elated",
            description="Very high positive emotion with high energy",
            priority=12,
        ),

        # High valence + Low arousal quadrant
        StatLevel(
            id="calm",
            conditions={
                "valence": StatCondition(type="min", min_value=60.0),
                "arousal": StatCondition(type="max", max_value=40.0),
            },
            display_name="Calm",
            description="Positive emotion with low energy, peaceful",
            priority=8,
        ),
        StatLevel(
            id="content",
            conditions={
                "valence": StatCondition(type="min", min_value=70.0),
                "arousal": StatCondition(type="max", max_value=30.0),
            },
            display_name="Content",
            description="Satisfied and relaxed",
            priority=10,
        ),
        StatLevel(
            id="relaxed",
            conditions={
                "valence": StatCondition(type="range", min_value=50.0, max_value=69.99),
                "arousal": StatCondition(type="max", max_value=30.0),
            },
            display_name="Relaxed",
            description="At ease with low activation",
            priority=6,
        ),

        # Low valence + High arousal quadrant
        StatLevel(
            id="anxious",
            conditions={
                "valence": StatCondition(type="max", max_value=40.0),
                "arousal": StatCondition(type="min", min_value=70.0),
            },
            display_name="Anxious",
            description="Negative emotion with high energy, worried",
            priority=10,
        ),
        StatLevel(
            id="angry",
            conditions={
                "valence": StatCondition(type="max", max_value=30.0),
                "arousal": StatCondition(type="min", min_value=80.0),
            },
            display_name="Angry",
            description="Very negative emotion with very high energy",
            priority=12,
        ),
        StatLevel(
            id="stressed",
            conditions={
                "valence": StatCondition(type="max", max_value=40.0),
                "arousal": StatCondition(type="range", min_value=60.0, max_value=79.99),
            },
            display_name="Stressed",
            description="Negative emotion with elevated energy",
            priority=8,
        ),
        StatLevel(
            id="frustrated",
            conditions={
                "valence": StatCondition(type="range", min_value=30.0, max_value=45.0),
                "arousal": StatCondition(type="min", min_value=60.0),
            },
            display_name="Frustrated",
            description="Mildly negative with elevated energy",
            priority=7,
        ),

        # Low valence + Low arousal quadrant
        StatLevel(
            id="sad",
            conditions={
                "valence": StatCondition(type="max", max_value=30.0),
                "arousal": StatCondition(type="max", max_value=40.0),
            },
            display_name="Sad",
            description="Negative emotion with low energy",
            priority=10,
        ),
        StatLevel(
            id="depressed",
            conditions={
                "valence": StatCondition(type="max", max_value=20.0),
                "arousal": StatCondition(type="max", max_value=30.0),
            },
            display_name="Depressed",
            description="Very negative emotion with very low energy",
            priority=12,
        ),
        StatLevel(
            id="bored",
            conditions={
                "valence": StatCondition(type="range", min_value=30.0, max_value=50.0),
                "arousal": StatCondition(type="max", max_value=30.0),
            },
            display_name="Bored",
            description="Neutral to mildly negative with low energy",
            priority=6,
        ),

        # Neutral center
        StatLevel(
            id="neutral",
            conditions={
                "valence": StatCondition(type="range", min_value=40.0, max_value=60.0),
                "arousal": StatCondition(type="range", min_value=40.0, max_value=60.0),
            },
            display_name="Neutral",
            description="Neither positive nor negative, moderate energy",
            priority=1,  # Lowest priority - fallback
        ),
    ]

    return StatDefinition(
        id="mood",
        display_name="Mood (Valence-Arousal)",
        description="Circumplex model of affect with valence and arousal dimensions",
        axes=axes,
        tiers=tiers,
        levels=levels,
    )


def get_mood_label_transform() -> TransformRule:
    """
    Transform rule for deriving mood label from valence/arousal.

    Uses Russell's circumplex model of affect:
    - High valence + High arousal = excited, elated, happy
    - High valence + Low arousal = calm, content, relaxed
    - Low valence + High arousal = angry, anxious, stressed
    - Low valence + Low arousal = sad, depressed, bored
    """
    return TransformRule(
        output_key="label",
        conditions=[
            # High valence + High arousal quadrant
            TransformCondition(
                when={
                    "valence": ConditionSpec(gte=80),
                    "arousal": ConditionSpec(gte=70),
                },
                then="elated",
            ),
            TransformCondition(
                when={
                    "valence": ConditionSpec(gte=70),
                    "arousal": ConditionSpec(gte=70),
                },
                then="excited",
            ),
            TransformCondition(
                when={
                    "valence": ConditionSpec(gte=60),
                    "arousal": ConditionSpec(between=[50, 69]),
                },
                then="happy",
            ),

            # High valence + Low arousal quadrant
            TransformCondition(
                when={
                    "valence": ConditionSpec(gte=70),
                    "arousal": ConditionSpec(lte=30),
                },
                then="content",
            ),
            TransformCondition(
                when={
                    "valence": ConditionSpec(gte=60),
                    "arousal": ConditionSpec(lte=40),
                },
                then="calm",
            ),
            TransformCondition(
                when={
                    "valence": ConditionSpec(between=[50, 69]),
                    "arousal": ConditionSpec(lte=30),
                },
                then="relaxed",
            ),

            # Low valence + High arousal quadrant
            TransformCondition(
                when={
                    "valence": ConditionSpec(lte=30),
                    "arousal": ConditionSpec(gte=80),
                },
                then="angry",
            ),
            TransformCondition(
                when={
                    "valence": ConditionSpec(lte=40),
                    "arousal": ConditionSpec(gte=70),
                },
                then="anxious",
            ),
            TransformCondition(
                when={
                    "valence": ConditionSpec(lte=40),
                    "arousal": ConditionSpec(between=[60, 79]),
                },
                then="stressed",
            ),
            TransformCondition(
                when={
                    "valence": ConditionSpec(between=[30, 45]),
                    "arousal": ConditionSpec(gte=60),
                },
                then="frustrated",
            ),

            # Low valence + Low arousal quadrant
            TransformCondition(
                when={
                    "valence": ConditionSpec(lte=20),
                    "arousal": ConditionSpec(lte=30),
                },
                then="depressed",
            ),
            TransformCondition(
                when={
                    "valence": ConditionSpec(lte=30),
                    "arousal": ConditionSpec(lte=40),
                },
                then="sad",
            ),
            TransformCondition(
                when={
                    "valence": ConditionSpec(between=[30, 50]),
                    "arousal": ConditionSpec(lte=30),
                },
                then="bored",
            ),

            # Near-neutral states
            TransformCondition(
                when={
                    "valence": ConditionSpec(gte=50),
                    "arousal": ConditionSpec(between=[40, 60]),
                },
                then="pleasant",
            ),
            TransformCondition(
                when={
                    "valence": ConditionSpec(lt=50),
                    "arousal": ConditionSpec(between=[40, 60]),
                },
                then="unpleasant",
            ),
        ],
        default="neutral",
    )


def get_mood_derivation_from_sentiment() -> DerivationCapability:
    """
    Get derivation capability for deriving mood from sentiment sources.

    This allows mood to be derived from any package that provides
    positive_sentiment, negative_sentiment, and/or arousal_source semantic types.

    For example, if relationships package is active:
    - affinity (positive_sentiment) -> contributes to valence positively
    - tension (negative_sentiment) -> contributes to valence negatively
    - chemistry (arousal_source) -> contributes to arousal

    If multiple packages provide these semantic types, they are combined
    using weighted average based on each axis's semantic_weight.
    """
    return DerivationCapability(
        id="mood_from_sentiment",
        from_semantic_types=["positive_sentiment", "arousal_source"],
        to_stat_definition="mood",
        formulas=[
            # Valence: positive sentiment increases
            DerivationFormula(
                source_semantic_types={
                    "positive": "positive_sentiment",
                },
                weights={"positive": 1.0},
                output_axis="valence",
                transform="weighted_avg",
                multi_source_strategy="weighted_avg",
                normalize=True,
                offset=0.0,
            ),
            # Arousal: from arousal sources if available (otherwise defaults to 50)
            DerivationFormula(
                source_semantic_types={
                    "arousal": "arousal_source",
                },
                weights={"arousal": 1.0},
                output_axis="arousal",
                transform="weighted_avg",
                multi_source_strategy="weighted_avg",
                normalize=True,
                offset=0.0,
            ),
        ],
        transforms=[
            get_mood_label_transform(),
        ],
        priority=50,
        description="Derives mood valence/arousal from sentiment and arousal semantic types",
        enabled_by_default=True,
    )


def get_mood_derivation_with_negative() -> DerivationCapability:
    """
    Enhanced mood derivation that includes negative sentiment.

    This derivation requires both positive and negative sentiment sources,
    combining them for a more nuanced valence calculation.
    """
    return DerivationCapability(
        id="mood_from_sentiment_full",
        from_semantic_types=["positive_sentiment", "negative_sentiment", "arousal_source"],
        to_stat_definition="mood",
        formulas=[
            # Valence: balance of positive and negative
            DerivationFormula(
                source_semantic_types={
                    "positive": "positive_sentiment",
                    "negative": "negative_sentiment",
                },
                weights={"positive": 1.0, "negative": -0.5},
                output_axis="valence",
                transform="weighted_avg",
                multi_source_strategy="weighted_avg",
                normalize=True,
                offset=25.0,  # Shift up since negative pulls down
            ),
            # Arousal: from arousal sources
            DerivationFormula(
                source_semantic_types={
                    "arousal": "arousal_source",
                },
                weights={"arousal": 1.0},
                output_axis="arousal",
                transform="weighted_avg",
                multi_source_strategy="weighted_avg",
                normalize=True,
                offset=0.0,
            ),
        ],
        transforms=[
            get_mood_label_transform(),
        ],
        priority=40,  # Higher priority than basic derivation
        description="Derives mood valence from both positive and negative sentiment",
        enabled_by_default=True,
    )


def register_core_mood_package() -> None:
    """Register the built-in core mood stat package."""
    definition = get_default_mood_definition()
    pkg = StatPackage(
        id=MOOD_PACKAGE_ID,
        label="Core Mood (Valence-Arousal)",
        description="Circumplex model mood system with valence and arousal dimensions.",
        category="mood",
        definitions={"mood": definition},
        source_plugin_id=None,
        derivation_capabilities=[
            get_mood_derivation_from_sentiment(),
            get_mood_derivation_with_negative(),
        ],
    )
    register_stat_package(pkg)


# NOTE: Package is registered via register_core_stat_packages() in __init__.py
# This allows plugin system to control when packages are loaded.
