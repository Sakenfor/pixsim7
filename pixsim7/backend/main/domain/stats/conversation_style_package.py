"""
Built-in Conversation Style Stat Package

Provides derived conversation style scores based on personality, mood, and relationships.
Adapts to whatever source packages are available.

Output axes represent style dimensions:
- warmth: How warm/friendly vs cold/distant (0-100)
- energy: How energetic/enthusiastic vs calm/subdued (0-100)
- formality: How formal/proper vs casual/relaxed (0-100)

The "style" transform provides a single-word style label for convenience.

These can be used by dialogue systems to adjust NPC speech patterns.
"""

from __future__ import annotations

from .schemas import StatAxis, StatTier, StatDefinition
from .package_registry import StatPackage, register_stat_package
from .derivation_schemas import (
    DerivationCapability,
    DerivationFormula,
    TransformRule,
    TransformCondition,
    ConditionSpec,
)


CONVERSATION_STYLE_PACKAGE_ID = "core.conversation_style"


def get_conversation_style_definition() -> StatDefinition:
    """
    Get the conversation style StatDefinition.

    These are derived style dimensions for dialogue systems.
    """
    axes = [
        StatAxis(
            name="warmth",
            min_value=0.0,
            max_value=100.0,
            default_value=50.0,
            display_name="Warmth",
            description="How warm and friendly vs cold and distant, 0=cold, 100=very warm",
        ),
        StatAxis(
            name="energy",
            min_value=0.0,
            max_value=100.0,
            default_value=50.0,
            display_name="Energy",
            description="How energetic and enthusiastic vs calm and subdued, 0=subdued, 100=enthusiastic",
        ),
        StatAxis(
            name="formality",
            min_value=0.0,
            max_value=100.0,
            default_value=50.0,
            display_name="Formality",
            description="How formal and proper vs casual and relaxed, 0=casual, 100=formal",
        ),
    ]

    tier_ranges = [
        ("very_low", 0.0, 19.99, "Very Low"),
        ("low", 20.0, 39.99, "Low"),
        ("moderate", 40.0, 59.99, "Moderate"),
        ("high", 60.0, 79.99, "High"),
        ("very_high", 80.0, None, "Very High"),
    ]

    tiers = []
    for axis in axes:
        for tier_id, min_val, max_val, display in tier_ranges:
            tiers.append(
                StatTier(
                    id=f"{axis.name}_{tier_id}",
                    axis_name=axis.name,
                    min=min_val,
                    max=max_val,
                    display_name=f"{display} {axis.display_name}",
                )
            )

    return StatDefinition(
        id="conversation_style",
        display_name="Conversation Style",
        description="Derived conversation style dimensions: warmth, energy, formality",
        axes=axes,
        tiers=tiers,
        levels=[],
    )


def get_style_label_transform() -> TransformRule:
    """
    Transform rule for deriving a single style label from dimensions.

    Styles are personality-driven speaking patterns:
    - enthusiastic: High energy, high warmth
    - playful: High energy, moderate warmth, low formality
    - warm: High warmth, moderate energy
    - friendly: Moderate-high warmth
    - reserved: Low energy, low warmth
    - curt: Low warmth, high formality
    - formal: High formality
    - casual: Low formality, moderate warmth
    - neutral: Default
    """
    return TransformRule(
        output_key="style",
        conditions=[
            # High energy + high warmth = enthusiastic
            TransformCondition(
                when={
                    "energy": ConditionSpec(gte=70),
                    "warmth": ConditionSpec(gte=65),
                },
                then="enthusiastic",
            ),
            # High energy + moderate warmth + low formality = playful
            TransformCondition(
                when={
                    "energy": ConditionSpec(gte=65),
                    "warmth": ConditionSpec(between=[40, 70]),
                    "formality": ConditionSpec(lte=40),
                },
                then="playful",
            ),
            # High warmth + moderate energy = warm
            TransformCondition(
                when={
                    "warmth": ConditionSpec(gte=70),
                    "energy": ConditionSpec(between=[30, 65]),
                },
                then="warm",
            ),
            # Low warmth + high formality = curt/distant
            TransformCondition(
                when={
                    "warmth": ConditionSpec(lte=30),
                    "formality": ConditionSpec(gte=60),
                },
                then="curt",
            ),
            # Low warmth + low energy = reserved
            TransformCondition(
                when={
                    "warmth": ConditionSpec(lte=35),
                    "energy": ConditionSpec(lte=35),
                },
                then="reserved",
            ),
            # Low energy overall = subdued
            TransformCondition(
                when={
                    "energy": ConditionSpec(lte=25),
                },
                then="subdued",
            ),
            # High formality = formal
            TransformCondition(
                when={
                    "formality": ConditionSpec(gte=75),
                },
                then="formal",
            ),
            # Low formality + moderate warmth = casual
            TransformCondition(
                when={
                    "formality": ConditionSpec(lte=30),
                    "warmth": ConditionSpec(between=[40, 70]),
                },
                then="casual",
            ),
            # Moderate-high warmth = friendly
            TransformCondition(
                when={
                    "warmth": ConditionSpec(gte=55),
                },
                then="friendly",
            ),
        ],
        default="neutral",
    )


def get_style_from_personality_derivation() -> DerivationCapability:
    """
    Derivation capability for computing conversation style from personality.

    Maps personality traits to style dimensions:
    - warmth = (agreeableness + extraversion) / 2
    - energy = extraversion
    - formality = conscientiousness (higher = more formal)
    """
    return DerivationCapability(
        id="style_from_personality",
        from_semantic_types=["extraversion_trait", "agreeableness_trait"],
        to_stat_definition="conversation_style",
        formulas=[
            # Warmth from agreeableness + extraversion
            DerivationFormula(
                source_semantic_types={
                    "agreeable": "agreeableness_trait",
                    "extraverted": "extraversion_trait",
                },
                weights={"agreeable": 0.6, "extraverted": 0.4},
                output_axis="warmth",
                transform="weighted_avg",
                multi_source_strategy="weighted_avg",
                normalize=True,
                offset=0.0,
            ),
            # Energy from extraversion
            DerivationFormula(
                source_semantic_types={
                    "extraverted": "extraversion_trait",
                },
                weights={"extraverted": 1.0},
                output_axis="energy",
                transform="weighted_avg",
                multi_source_strategy="weighted_avg",
                normalize=True,
                offset=0.0,
            ),
            # Formality from conscientiousness
            DerivationFormula(
                source_semantic_types={
                    "conscientious": "conscientiousness_trait",
                },
                weights={"conscientious": 1.0},
                output_axis="formality",
                transform="weighted_avg",
                multi_source_strategy="weighted_avg",
                normalize=True,
                offset=0.0,
            ),
        ],
        transforms=[
            get_style_label_transform(),
        ],
        priority=70,
        description="Derives conversation style from personality traits",
        enabled_by_default=True,
    )


def get_style_mood_modifier_derivation() -> DerivationCapability:
    """
    Derivation that modifies style based on mood.

    Low mood valence → reduced warmth and energy
    High mood arousal → increased energy

    This runs after personality-based style and modifies the values.
    Note: For now, this is a separate derivation. In a more complex system,
    we might want modifiers that stack on top of base values.
    """
    return DerivationCapability(
        id="style_mood_modifier",
        from_semantic_types=["positive_sentiment", "arousal_source"],
        to_stat_definition="conversation_style",
        formulas=[
            # Warmth influenced by positive sentiment (mood valence proxy)
            DerivationFormula(
                source_semantic_types={
                    "positive": "positive_sentiment",
                },
                weights={"positive": 1.0},
                output_axis="warmth",
                transform="weighted_avg",
                multi_source_strategy="weighted_avg",
                normalize=True,
                offset=0.0,
            ),
            # Energy influenced by arousal
            DerivationFormula(
                source_semantic_types={
                    "arousal": "arousal_source",
                },
                weights={"arousal": 1.0},
                output_axis="energy",
                transform="weighted_avg",
                multi_source_strategy="weighted_avg",
                normalize=True,
                offset=0.0,
            ),
        ],
        transforms=[
            get_style_label_transform(),
        ],
        priority=75,  # After personality-based, can override
        description="Modifies conversation style based on current mood/relationships",
        enabled_by_default=True,
    )


def register_conversation_style_package() -> None:
    """Register the conversation style stat package."""
    definition = get_conversation_style_definition()
    pkg = StatPackage(
        id=CONVERSATION_STYLE_PACKAGE_ID,
        label="Conversation Style",
        description="Derived conversation style for dialogue systems.",
        category="behavior",
        definitions={"conversation_style": definition},
        source_plugin_id=None,
        derivation_capabilities=[
            get_style_from_personality_derivation(),
            get_style_mood_modifier_derivation(),
        ],
    )
    register_stat_package(pkg)


# NOTE: Package is registered via register_core_stat_packages() in __init__.py
# This allows plugin system to control when packages are loaded.
