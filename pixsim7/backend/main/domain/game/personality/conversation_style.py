"""
Conversation Style Derivation Logic

Shared logic for deriving conversation style from personality traits.
This is the single source of truth for how personality maps to conversation style.

Used by:
- Stats package (stats/conversation_style_package.py) - for semantic derivations
- Brain plugin (brain/derivations/conversation_style.py) - for brain engine

Style dimensions:
- warmth: How warm/friendly vs cold/distant (0-100)
- energy: How energetic/enthusiastic vs calm/subdued (0-100)
- formality: How formal/proper vs casual/relaxed (0-100)

Style labels:
- enthusiastic, playful, warm, friendly, neutral
- reserved, curt, subdued, formal, casual
- affectionate, flirty (relationship modifiers)
"""

from typing import Dict, Any, Optional, NamedTuple


class StyleDimensions(NamedTuple):
    """Conversation style dimensions (0-100 scale)."""
    warmth: float
    energy: float
    formality: float


# ===== PERSONALITY TO STYLE DIMENSION MAPPINGS =====
# These define how Big Five traits map to style dimensions

# Weights for computing warmth from personality
WARMTH_WEIGHTS = {
    "agreeableness": 0.6,
    "extraversion": 0.4,
}

# Weights for computing energy from personality
ENERGY_WEIGHTS = {
    "extraversion": 1.0,
}

# Weights for computing formality from personality
FORMALITY_WEIGHTS = {
    "conscientiousness": 1.0,
}


def compute_style_dimensions_from_personality(
    personality: Dict[str, float],
    default_value: float = 50.0,
) -> StyleDimensions:
    """
    Compute style dimensions from personality traits.

    Args:
        personality: Dict with Big Five trait values (0-100)
            Keys: openness, conscientiousness, extraversion, agreeableness, neuroticism
        default_value: Default value for missing traits

    Returns:
        StyleDimensions with warmth, energy, formality values
    """
    # Warmth = weighted average of agreeableness + extraversion
    warmth = (
        personality.get("agreeableness", default_value) * WARMTH_WEIGHTS["agreeableness"] +
        personality.get("extraversion", default_value) * WARMTH_WEIGHTS["extraversion"]
    )

    # Energy = extraversion
    energy = personality.get("extraversion", default_value) * ENERGY_WEIGHTS["extraversion"]

    # Formality = conscientiousness
    formality = personality.get("conscientiousness", default_value) * FORMALITY_WEIGHTS["conscientiousness"]

    return StyleDimensions(warmth=warmth, energy=energy, formality=formality)


# ===== STYLE LABEL THRESHOLDS =====
# These define how dimensions map to style labels

STYLE_THRESHOLDS = {
    "enthusiastic": {"energy_gte": 70, "warmth_gte": 65},
    "playful": {"energy_gte": 65, "warmth_between": (40, 70), "formality_lte": 40},
    "warm": {"warmth_gte": 70, "energy_between": (30, 65)},
    "curt": {"warmth_lte": 30, "formality_gte": 60},
    "reserved": {"warmth_lte": 35, "energy_lte": 35},
    "subdued": {"energy_lte": 25},
    "formal": {"formality_gte": 75},
    "casual": {"formality_lte": 30, "warmth_between": (40, 70)},
    "friendly": {"warmth_gte": 55},
}


def compute_style_label(
    dimensions: StyleDimensions,
    relationship_affinity: Optional[float] = None,
    mood_valence: Optional[float] = None,
    custom_thresholds: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Compute a style label from style dimensions.

    Args:
        dimensions: StyleDimensions (warmth, energy, formality)
        relationship_affinity: Optional affinity value (0-100) for relationship modifiers
        mood_valence: Optional mood valence (-100 to 100) for mood modifiers
        custom_thresholds: Optional custom thresholds to override defaults

    Returns:
        Style label string (e.g., "enthusiastic", "warm", "neutral")
    """
    warmth, energy, formality = dimensions
    thresholds = custom_thresholds or STYLE_THRESHOLDS

    # Check personality-based style (order matters - first match wins)

    # High energy + high warmth = enthusiastic
    t = thresholds.get("enthusiastic", {})
    if energy >= t.get("energy_gte", 70) and warmth >= t.get("warmth_gte", 65):
        style = "enthusiastic"
    # High energy + moderate warmth + low formality = playful
    elif (
        energy >= thresholds.get("playful", {}).get("energy_gte", 65) and
        _in_range(warmth, thresholds.get("playful", {}).get("warmth_between", (40, 70))) and
        formality <= thresholds.get("playful", {}).get("formality_lte", 40)
    ):
        style = "playful"
    # High warmth + moderate energy = warm
    elif (
        warmth >= thresholds.get("warm", {}).get("warmth_gte", 70) and
        _in_range(energy, thresholds.get("warm", {}).get("energy_between", (30, 65)))
    ):
        style = "warm"
    # Low warmth + high formality = curt/distant
    elif (
        warmth <= thresholds.get("curt", {}).get("warmth_lte", 30) and
        formality >= thresholds.get("curt", {}).get("formality_gte", 60)
    ):
        style = "curt"
    # Low warmth + low energy = reserved
    elif (
        warmth <= thresholds.get("reserved", {}).get("warmth_lte", 35) and
        energy <= thresholds.get("reserved", {}).get("energy_lte", 35)
    ):
        style = "reserved"
    # Low energy overall = subdued
    elif energy <= thresholds.get("subdued", {}).get("energy_lte", 25):
        style = "subdued"
    # High formality = formal
    elif formality >= thresholds.get("formal", {}).get("formality_gte", 75):
        style = "formal"
    # Low formality + moderate warmth = casual
    elif (
        formality <= thresholds.get("casual", {}).get("formality_lte", 30) and
        _in_range(warmth, thresholds.get("casual", {}).get("warmth_between", (40, 70)))
    ):
        style = "casual"
    # Moderate-high warmth = friendly
    elif warmth >= thresholds.get("friendly", {}).get("warmth_gte", 55):
        style = "friendly"
    else:
        style = "neutral"

    # Apply relationship modifier
    if relationship_affinity is not None:
        if relationship_affinity <= 20:
            style = "distant"
        elif relationship_affinity >= 80:
            # High affinity upgrades existing style
            if style == "warm":
                style = "affectionate"
            elif style == "playful":
                style = "flirty"
            elif style == "neutral":
                style = "affectionate"
        elif relationship_affinity >= 40 and style == "neutral":
            style = "friendly"

    # Apply mood modifier
    if mood_valence is not None:
        if mood_valence <= 30 and style not in ["distant", "curt"]:
            style = "subdued"

    return style


def _in_range(value: float, range_tuple: tuple) -> bool:
    """Check if value is within range (inclusive)."""
    if range_tuple is None:
        return True
    min_val, max_val = range_tuple
    return min_val <= value <= max_val


def derive_conversation_style(
    personality: Optional[Dict[str, float]] = None,
    relationship_affinity: Optional[float] = None,
    mood_valence: Optional[float] = None,
    custom_thresholds: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Full conversation style derivation from available inputs.

    Args:
        personality: Dict with Big Five trait values (0-100)
        relationship_affinity: Optional affinity value (0-100)
        mood_valence: Optional mood valence (-100 to 100)
        custom_thresholds: Optional custom thresholds

    Returns:
        Dict with style label and dimensions
    """
    # Compute dimensions from personality (or defaults)
    if personality:
        dimensions = compute_style_dimensions_from_personality(personality)
    else:
        dimensions = StyleDimensions(warmth=50.0, energy=50.0, formality=50.0)

    # Compute style label
    style = compute_style_label(
        dimensions,
        relationship_affinity=relationship_affinity,
        mood_valence=mood_valence,
        custom_thresholds=custom_thresholds,
    )

    return {
        "style": style,
        "warmth": dimensions.warmth,
        "energy": dimensions.energy,
        "formality": dimensions.formality,
    }
