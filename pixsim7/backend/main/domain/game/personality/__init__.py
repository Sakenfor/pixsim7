"""
Personality Domain Module

Canonical definitions for personality traits used throughout the system.
This is the single source of truth for Big Five personality traits and
derived personality computations (like conversation style).
"""

from .traits import (
    PersonalityTrait,
    PERSONALITY_TRAITS,
    PERSONALITY_TRAIT_NAMES,
    PERSONALITY_TRAIT_DISPLAY_NAMES,
    PERSONALITY_TRAIT_DESCRIPTIONS,
    PERSONALITY_TRAIT_SEMANTIC_TYPES,
    PERSONALITY_TIER_IDS,
    TRAIT_ALIASES,
    get_trait_info,
    get_tier_for_value,
)

from .conversation_style import (
    StyleDimensions,
    compute_style_dimensions_from_personality,
    compute_style_label,
    derive_conversation_style,
    WARMTH_WEIGHTS,
    ENERGY_WEIGHTS,
    FORMALITY_WEIGHTS,
    STYLE_THRESHOLDS,
)

__all__ = [
    # Trait definitions
    "PersonalityTrait",
    "PERSONALITY_TRAITS",
    "PERSONALITY_TRAIT_NAMES",
    "PERSONALITY_TRAIT_DISPLAY_NAMES",
    "PERSONALITY_TRAIT_DESCRIPTIONS",
    "PERSONALITY_TRAIT_SEMANTIC_TYPES",
    "PERSONALITY_TIER_IDS",
    "TRAIT_ALIASES",
    "get_trait_info",
    "get_tier_for_value",
    # Conversation style
    "StyleDimensions",
    "compute_style_dimensions_from_personality",
    "compute_style_label",
    "derive_conversation_style",
    "WARMTH_WEIGHTS",
    "ENERGY_WEIGHTS",
    "FORMALITY_WEIGHTS",
    "STYLE_THRESHOLDS",
]
