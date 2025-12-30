"""
Canonical Big Five Personality Traits

This module is the single source of truth for personality trait definitions.
All other modules (stats packages, behavior plugins, services, ORM models)
should import from here rather than defining their own trait constants.

The Big Five model includes:
- Openness: Creativity, curiosity, preference for novelty
- Conscientiousness: Organization, dependability, self-discipline
- Extraversion: Energy, sociability, talkativeness
- Agreeableness: Cooperation, trust, helpfulness
- Neuroticism: Emotional instability, anxiety, moodiness

Each trait uses:
- Range: 0-100
- Tiers: very_low (0-20), low (20-40), moderate (40-60), high (60-80), very_high (80-100)
"""

from enum import Enum
from typing import Dict, List, NamedTuple


class PersonalityTrait(str, Enum):
    """
    Big Five personality traits.

    This enum is the canonical definition used by:
    - Stats system (personality_package.py)
    - Behavior plugins (packages/plugins/personality)
    - Evolution tracking (PersonalityEvolutionEvent ORM model)
    - Brain derivations (conversation_style, etc.)
    """

    OPENNESS = "openness"
    CONSCIENTIOUSNESS = "conscientiousness"
    EXTRAVERSION = "extraversion"
    AGREEABLENESS = "agreeableness"
    NEUROTICISM = "neuroticism"


class TraitInfo(NamedTuple):
    """Complete information about a personality trait."""

    name: str
    display_name: str
    description: str
    semantic_type: str
    low_label: str
    high_label: str


# Canonical trait information
_TRAIT_INFO: Dict[PersonalityTrait, TraitInfo] = {
    PersonalityTrait.OPENNESS: TraitInfo(
        name="openness",
        display_name="Openness",
        description="Creativity, curiosity, and preference for novelty and variety",
        semantic_type="openness_trait",
        low_label="Conventional",
        high_label="Creative",
    ),
    PersonalityTrait.CONSCIENTIOUSNESS: TraitInfo(
        name="conscientiousness",
        display_name="Conscientiousness",
        description="Organization, dependability, and self-discipline",
        semantic_type="conscientiousness_trait",
        low_label="Spontaneous",
        high_label="Organized",
    ),
    PersonalityTrait.EXTRAVERSION: TraitInfo(
        name="extraversion",
        display_name="Extraversion",
        description="Energy, sociability, and tendency to seek stimulation",
        semantic_type="extraversion_trait",
        low_label="Introverted",
        high_label="Extraverted",
    ),
    PersonalityTrait.AGREEABLENESS: TraitInfo(
        name="agreeableness",
        display_name="Agreeableness",
        description="Cooperation, trust, and consideration for others",
        semantic_type="agreeableness_trait",
        low_label="Challenging",
        high_label="Cooperative",
    ),
    PersonalityTrait.NEUROTICISM: TraitInfo(
        name="neuroticism",
        display_name="Neuroticism",
        description="Emotional instability, anxiety, and tendency toward negative emotions",
        semantic_type="neuroticism_trait",
        low_label="Emotionally Stable",
        high_label="Emotionally Reactive",
    ),
}

# Convenience lists for iteration
PERSONALITY_TRAITS: List[PersonalityTrait] = list(PersonalityTrait)
PERSONALITY_TRAIT_NAMES: List[str] = [t.value for t in PersonalityTrait]

# Mappings for quick lookup
PERSONALITY_TRAIT_DISPLAY_NAMES: Dict[str, str] = {
    t.value: _TRAIT_INFO[t].display_name for t in PersonalityTrait
}

PERSONALITY_TRAIT_DESCRIPTIONS: Dict[str, str] = {
    t.value: _TRAIT_INFO[t].description for t in PersonalityTrait
}

PERSONALITY_TRAIT_SEMANTIC_TYPES: Dict[str, str] = {
    t.value: _TRAIT_INFO[t].semantic_type for t in PersonalityTrait
}

# Standard tier identifiers (used by stats engine)
PERSONALITY_TIER_IDS = ["very_low", "low", "moderate", "high", "very_high"]

# Tier ranges (min, max) - max is exclusive except for very_high
PERSONALITY_TIER_RANGES: Dict[str, tuple] = {
    "very_low": (0.0, 20.0),
    "low": (20.0, 40.0),
    "moderate": (40.0, 60.0),
    "high": (60.0, 80.0),
    "very_high": (80.0, 100.0),
}


def get_trait_info(trait: PersonalityTrait) -> TraitInfo:
    """Get complete information for a trait."""
    return _TRAIT_INFO[trait]


def get_tier_for_value(value: float) -> str:
    """
    Get the tier ID for a trait value.

    Args:
        value: Trait value (0-100)

    Returns:
        Tier ID (very_low, low, moderate, high, very_high)
    """
    if value < 20:
        return "very_low"
    elif value < 40:
        return "low"
    elif value < 60:
        return "moderate"
    elif value < 80:
        return "high"
    else:
        return "very_high"


# Aliases for common use cases
# These map alternative names to canonical trait names
TRAIT_ALIASES: Dict[str, str] = {
    # Introversion is inverse of extraversion
    "introversion": "extraversion",
    # Common abbreviations
    "open": "openness",
    "conscientious": "conscientiousness",
    "extraverted": "extraversion",
    "extrovert": "extraversion",
    "introvert": "extraversion",
    "agreeable": "agreeableness",
    "neurotic": "neuroticism",
    "emotional_stability": "neuroticism",  # Note: inverse interpretation
}
