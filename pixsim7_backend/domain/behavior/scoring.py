"""
Activity Scoring and Selection System

Handles:
- Activity scoring based on preferences, traits, mood, relationships
- Activity selection (weighted random choice)
- Preference merging (defaults + overrides)

Task 28.1: Pluggable scoring factors - plugins can register custom factors
"""

from __future__ import annotations

import random
from typing import Any, Callable, Dict, List, Optional, Tuple

import logging

from .conditions import evaluate_conditions_all

logger = logging.getLogger(__name__)


# ==================
# Scoring Factor Registry
# ==================

# Type alias for scoring factor functions
# Function signature: (activity, npc_preferences, npc_state, context, factor_weight) -> float
ScoringFactorFunc = Callable[
    [Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any], float],
    float
]

# Registry of scoring factors (built-in + plugin-registered)
SCORING_FACTORS: Dict[str, ScoringFactorFunc] = {}


# Default scoring weights (can be overridden per-world)
DEFAULT_SCORING_WEIGHTS = {
    "baseWeight": 1.0,
    "activityPreference": 1.0,
    "categoryPreference": 0.8,
    "traitModifier": 0.6,
    "moodCompatibility": 0.7,
    "relationshipBonus": 0.5,
    "urgency": 1.2,
    "inertia": 0.3,
}


def register_scoring_factor(
    factor_id: str,
    evaluator: ScoringFactorFunc,
    default_weight: float = 1.0
) -> bool:
    """
    Register a custom scoring factor.

    Args:
        factor_id: Unique ID for the factor (e.g., "weather_preference", "plugin:my_plugin:social_fatigue")
        evaluator: Function that calculates the factor contribution
        default_weight: Default weight for this factor in DEFAULT_SCORING_WEIGHTS

    Returns:
        True if registered successfully, False if already exists

    Example:
        def my_weather_factor(activity, npc_prefs, npc_state, context, weight):
            # Custom logic here
            return 1.0  # multiplier

        register_scoring_factor("weather_preference", my_weather_factor, 0.5)
    """
    if factor_id in SCORING_FACTORS:
        logger.warning(f"Scoring factor '{factor_id}' already registered")
        return False

    SCORING_FACTORS[factor_id] = evaluator

    # Add default weight if not already present
    if factor_id not in DEFAULT_SCORING_WEIGHTS:
        DEFAULT_SCORING_WEIGHTS[factor_id] = default_weight

    logger.info(f"Registered scoring factor: {factor_id} (weight={default_weight})")
    return True


def merge_preferences(
    *preference_dicts: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Merge multiple preference dictionaries with right-most priority.

    Args:
        *preference_dicts: Variable number of preference dicts (None values are ignored)

    Returns:
        Merged preferences dict
    """
    merged: Dict[str, Any] = {}

    for prefs in preference_dicts:
        if prefs is None:
            continue

        for key, value in prefs.items():
            if isinstance(value, dict) and key in merged and isinstance(merged[key], dict):
                # Recursively merge nested dicts
                merged[key] = {**merged[key], **value}
            else:
                merged[key] = value

    return merged


def calculate_activity_score(
    activity: Dict[str, Any],
    npc_preferences: Dict[str, Any],
    npc_state: Dict[str, Any],
    context: Dict[str, Any],
    scoring_weights: Optional[Dict[str, float]] = None,
    base_weight: float = 1.0,
) -> float:
    """
    Calculate score for an activity based on NPC preferences and context.

    Uses pluggable scoring factors from SCORING_FACTORS registry.

    Args:
        activity: Activity dict
        npc_preferences: Merged NPC preferences
        npc_state: NPC session state (energy, mood, currentActivityId, etc.)
        context: Evaluation context (world, session, relationships, etc.)
        scoring_weights: Scoring weight overrides (uses defaults if None)
        base_weight: Base weight from routine graph node

    Returns:
        Calculated score (higher = more preferred)
    """
    if scoring_weights is None:
        scoring_weights = DEFAULT_SCORING_WEIGHTS

    weights = {**DEFAULT_SCORING_WEIGHTS, **scoring_weights}

    # Start with base score
    score = base_weight

    # Apply all registered scoring factors
    for factor_id, factor_func in SCORING_FACTORS.items():
        # Get weight for this factor (default to 1.0 if not specified)
        factor_weight = weights.get(factor_id, 1.0)

        if factor_weight == 0:
            # Skip factors with zero weight
            continue

        try:
            # Call factor function to get its contribution
            factor_contribution = factor_func(
                activity,
                npc_preferences,
                npc_state,
                context,
                factor_weight
            )

            # Apply factor contribution to score
            score *= factor_contribution

        except Exception as e:
            logger.error(
                f"Error calculating scoring factor '{factor_id}': {e}",
                exc_info=True
            )
            # Continue with other factors (don't let one broken factor kill scoring)

    # Ensure score never reaches exactly 0
    return max(0.001, score)


def _calculate_trait_multiplier(
    activity: Dict[str, Any],
    npc_preferences: Dict[str, Any]
) -> float:
    """
    Calculate trait-based multiplier for an activity.

    This is a simplified implementation. Real logic would map
    activity categories/meta to trait preferences.
    """
    trait_modifiers = npc_preferences.get("traitModifiers", {})
    category = activity.get("category", "")

    # Example trait mappings (these would be world-configurable)
    multiplier = 1.0

    # High extraversion → boost social activities
    if category == "social":
        extraversion = trait_modifiers.get("extraversion", 50)
        multiplier *= 0.5 + (extraversion / 100)

    # High conscientiousness → boost work activities
    elif category == "work":
        conscientiousness = trait_modifiers.get("conscientiousness", 50)
        multiplier *= 0.5 + (conscientiousness / 100)

    # High openness → boost creative/exploration activities
    elif category in ["leisure", "quest"]:
        openness = trait_modifiers.get("openness", 50)
        multiplier *= 0.5 + (openness / 100)

    return multiplier


def _calculate_mood_compatibility(
    activity: Dict[str, Any],
    npc_state: Dict[str, Any]
) -> float:
    """
    Calculate mood compatibility multiplier for an activity.

    Checks if activity mood requirements match current NPC mood.
    """
    requirements = activity.get("requirements", {})
    required_mood_tags = requirements.get("moodTags", [])

    if not required_mood_tags:
        return 1.0  # No mood requirements

    mood_state = npc_state.get("moodState", {})
    current_tags = mood_state.get("tags", [])

    # Check if any required mood tags are present
    matches = sum(1 for tag in required_mood_tags if tag in current_tags)
    if matches > 0:
        return 1.5  # Boost if mood matches
    else:
        return 0.5  # Penalty if mood doesn't match


def _calculate_relationship_multiplier(
    activity: Dict[str, Any],
    context: Dict[str, Any]
) -> float:
    """
    Calculate relationship-based multiplier for an activity.

    Boosts activities involving preferred NPCs.
    """
    requirements = activity.get("requirements", {})
    required_npcs = requirements.get("requiredNpcRolesOrIds", [])

    if not required_npcs:
        return 1.0  # No relationship requirements

    relationships = context.get("relationships", {})

    # Calculate average affinity with required NPCs
    total_affinity = 0
    count = 0

    for npc_id_or_role in required_npcs:
        relationship = relationships.get(npc_id_or_role, {})
        affinity = relationship.get("affinity", 50)
        total_affinity += affinity
        count += 1

    if count == 0:
        return 1.0

    avg_affinity = total_affinity / count

    # Map affinity (0-100) to multiplier (0.5-1.5)
    return 0.5 + (avg_affinity / 100)


def _calculate_urgency_multiplier(
    activity: Dict[str, Any],
    npc_state: Dict[str, Any]
) -> float:
    """
    Calculate urgency multiplier based on NPC needs.

    Examples:
    - Low energy → boost rest activities
    - High tension → boost stress-relief activities
    """
    energy = npc_state.get("energy", 50)
    mood_state = npc_state.get("moodState", {})
    valence = mood_state.get("valence", 0)

    category = activity.get("category", "")
    effects = activity.get("effects", {})
    energy_delta = effects.get("energyDeltaPerHour", 0)

    multiplier = 1.0

    # Low energy → boost activities that restore energy
    if energy < 30 and energy_delta > 0:
        multiplier *= 2.0  # Strong boost for rest activities
    elif energy > 80 and energy_delta < 0:
        multiplier *= 1.5  # Boost for energy-consuming activities when well-rested

    # Low valence → boost activities that improve mood
    mood_impact = effects.get("moodImpact", {})
    valence_delta = mood_impact.get("valence", 0)

    if valence < -30 and valence_delta > 0:
        multiplier *= 1.5  # Boost mood-improving activities when sad

    return multiplier


def choose_activity(
    feasible_activities: List[Tuple[Dict[str, Any], float]],
    npc_state: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """
    Choose an activity from scored, feasible candidates using weighted random selection.

    Args:
        feasible_activities: List of (activity, score) tuples
        npc_state: NPC session state (for cooldown/duration checks)

    Returns:
        Selected activity dict, or None if no activities available
    """
    if not feasible_activities:
        return None

    # Filter out activities on cooldown
    filtered_activities = []
    current_time = npc_state.get("world_time", 0)
    last_activities = npc_state.get("lastActivities", [])

    # Build cooldown map
    cooldown_map = {}
    for last_activity in last_activities:
        cooldown_map[last_activity["activityId"]] = last_activity["endedAtSeconds"]

    for activity, score in feasible_activities:
        activity_id = activity.get("id", "")
        cooldown_seconds = activity.get("cooldownSeconds", 0)

        if cooldown_seconds > 0:
            last_ended = cooldown_map.get(activity_id, 0)
            if current_time - last_ended < cooldown_seconds:
                # Skip activities on cooldown
                continue

        filtered_activities.append((activity, score))

    if not filtered_activities:
        return None

    # Weighted random selection
    total_score = sum(score for _, score in filtered_activities)
    if total_score <= 0:
        # Fallback to uniform random if all scores are 0
        return random.choice(filtered_activities)[0]

    # Normalize scores to probabilities
    rand_value = random.random() * total_score
    cumulative = 0

    for activity, score in filtered_activities:
        cumulative += score
        if rand_value <= cumulative:
            return activity

    # Fallback (should never reach here)
    return filtered_activities[-1][0]


def score_and_filter_activities(
    activities: List[Dict[str, Any]],
    npc_preferences: Dict[str, Any],
    npc_state: Dict[str, Any],
    context: Dict[str, Any],
    scoring_weights: Optional[Dict[str, float]] = None,
    base_weights: Optional[Dict[str, float]] = None,
) -> List[Tuple[Dict[str, Any], float]]:
    """
    Score and filter activities based on requirements and preferences.

    Args:
        activities: List of candidate activities
        npc_preferences: Merged NPC preferences
        npc_state: NPC session state
        context: Evaluation context
        scoring_weights: Scoring weight overrides
        base_weights: Per-activity base weights (from routine graph)

    Returns:
        List of (activity, score) tuples for feasible activities
    """
    feasible = []

    for activity in activities:
        activity_id = activity.get("id", "")

        # Check requirements
        if not _meets_requirements(activity, npc_state, context):
            continue

        # Calculate score
        base_weight = (base_weights or {}).get(activity_id, 1.0)
        score = calculate_activity_score(
            activity,
            npc_preferences,
            npc_state,
            context,
            scoring_weights,
            base_weight,
        )

        feasible.append((activity, score))

    return feasible


def _meets_requirements(
    activity: Dict[str, Any],
    npc_state: Dict[str, Any],
    context: Dict[str, Any]
) -> bool:
    """Check if NPC meets all activity requirements."""
    requirements = activity.get("requirements")
    if not requirements:
        return True

    # Energy requirements
    min_energy = requirements.get("minEnergy")
    max_energy = requirements.get("maxEnergy")
    current_energy = npc_state.get("energy", 50)

    if min_energy is not None and current_energy < min_energy:
        return False
    if max_energy is not None and current_energy > max_energy:
        return False

    # Condition requirements
    conditions = requirements.get("conditions", [])
    if conditions and not evaluate_conditions_all(conditions, context):
        return False

    # TODO: Add more requirement checks:
    # - locationTypes
    # - requiredNpcRolesOrIds
    # - moodTags
    # - timeOfDay

    return True


# ==================
# Built-in Scoring Factors
# ==================

def _factor_activity_preference(
    activity: Dict[str, Any],
    npc_preferences: Dict[str, Any],
    npc_state: Dict[str, Any],
    context: Dict[str, Any],
    weight: float
) -> float:
    """Activity-specific preference scoring factor."""
    activity_id = activity.get("id", "")
    activity_weights = npc_preferences.get("activityWeights", {})
    activity_pref = activity_weights.get(activity_id, 0.5)  # Default to neutral
    return activity_pref * weight


def _factor_category_preference(
    activity: Dict[str, Any],
    npc_preferences: Dict[str, Any],
    npc_state: Dict[str, Any],
    context: Dict[str, Any],
    weight: float
) -> float:
    """Category preference scoring factor."""
    category = activity.get("category", "")
    category_weights = npc_preferences.get("categoryWeights", {})
    category_pref = category_weights.get(category, 0.5)  # Default to neutral
    return category_pref * weight


def _factor_trait_modifier(
    activity: Dict[str, Any],
    npc_preferences: Dict[str, Any],
    npc_state: Dict[str, Any],
    context: Dict[str, Any],
    weight: float
) -> float:
    """Personality trait modifier scoring factor."""
    trait_mult = _calculate_trait_multiplier(activity, npc_preferences)
    return 1 + (trait_mult - 1) * weight


def _factor_mood_compatibility(
    activity: Dict[str, Any],
    npc_preferences: Dict[str, Any],
    npc_state: Dict[str, Any],
    context: Dict[str, Any],
    weight: float
) -> float:
    """Mood compatibility scoring factor."""
    mood_mult = _calculate_mood_compatibility(activity, npc_state)
    return 1 + (mood_mult - 1) * weight


def _factor_relationship_bonus(
    activity: Dict[str, Any],
    npc_preferences: Dict[str, Any],
    npc_state: Dict[str, Any],
    context: Dict[str, Any],
    weight: float
) -> float:
    """Relationship bonus scoring factor."""
    rel_mult = _calculate_relationship_multiplier(activity, context)
    return 1 + (rel_mult - 1) * weight


def _factor_urgency(
    activity: Dict[str, Any],
    npc_preferences: Dict[str, Any],
    npc_state: Dict[str, Any],
    context: Dict[str, Any],
    weight: float
) -> float:
    """Urgency scoring factor (low energy → boost rest activities)."""
    urgency_mult = _calculate_urgency_multiplier(activity, npc_state)
    return 1 + (urgency_mult - 1) * weight


def _factor_inertia(
    activity: Dict[str, Any],
    npc_preferences: Dict[str, Any],
    npc_state: Dict[str, Any],
    context: Dict[str, Any],
    weight: float
) -> float:
    """Inertia scoring factor (prefer current activity)."""
    activity_id = activity.get("id", "")
    current_activity_id = npc_state.get("currentActivityId")

    if current_activity_id == activity_id:
        return 1 + weight
    else:
        return 1.0


def _register_builtin_scoring_factors():
    """
    Register all built-in scoring factors.

    This function is called at module load time to populate the SCORING_FACTORS registry.
    Built-in factors use the same registration pathway as plugin factors.
    """
    # Note: We use DEFAULT_SCORING_WEIGHTS to get the default weight for each factor
    register_scoring_factor("activityPreference", _factor_activity_preference, DEFAULT_SCORING_WEIGHTS["activityPreference"])
    register_scoring_factor("categoryPreference", _factor_category_preference, DEFAULT_SCORING_WEIGHTS["categoryPreference"])
    register_scoring_factor("traitModifier", _factor_trait_modifier, DEFAULT_SCORING_WEIGHTS["traitModifier"])
    register_scoring_factor("moodCompatibility", _factor_mood_compatibility, DEFAULT_SCORING_WEIGHTS["moodCompatibility"])
    register_scoring_factor("relationshipBonus", _factor_relationship_bonus, DEFAULT_SCORING_WEIGHTS["relationshipBonus"])
    register_scoring_factor("urgency", _factor_urgency, DEFAULT_SCORING_WEIGHTS["urgency"])
    register_scoring_factor("inertia", _factor_inertia, DEFAULT_SCORING_WEIGHTS["inertia"])

    logger.info(f"Registered {len(SCORING_FACTORS)} built-in scoring factors")


# Register built-in scoring factors at module load time
_register_builtin_scoring_factors()
