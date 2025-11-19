"""
Condition Evaluation System for NPC Behavior

Provides a DSL for evaluating conditions in:
- Activity requirements
- Routine graph transitions
- Simulation prioritization

Supports built-in condition types and extensible custom evaluators.
"""

from __future__ import annotations

import random
from typing import Any, Callable, Dict, List, Optional

import logging

logger = logging.getLogger(__name__)


# Type alias for evaluator functions
ConditionEvaluator = Callable[[Dict[str, Any], Dict[str, Any]], bool]


# Global registry of custom condition evaluators
CONDITION_EVALUATORS: Dict[str, ConditionEvaluator] = {}


def register_condition_evaluator(evaluator_id: str, evaluator: ConditionEvaluator) -> None:
    """
    Register a custom condition evaluator.

    Args:
        evaluator_id: Unique ID for the evaluator (e.g., "evaluator:is_raining")
        evaluator: Function that takes (condition, context) and returns bool
    """
    CONDITION_EVALUATORS[evaluator_id] = evaluator
    logger.info(f"Registered custom condition evaluator: {evaluator_id}")


def evaluate_condition(condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """
    Evaluate a single condition using the Condition DSL.

    Args:
        condition: Condition dict with 'type' and type-specific fields
        context: Evaluation context containing:
            - npc: The NPC being evaluated
            - world: The world
            - session: The game session
            - flags: Session flags
            - relationships: Session relationships
            - world_time: Current world time
            - npc_state: NPC session state

    Returns:
        True if condition is met, False otherwise
    """
    cond_type = condition.get("type")

    if not cond_type:
        logger.warning("Condition missing 'type' field")
        return False

    try:
        # Built-in condition types
        if cond_type == "relationship_gt":
            return _eval_relationship_gt(condition, context)
        elif cond_type == "relationship_lt":
            return _eval_relationship_lt(condition, context)
        elif cond_type == "flag_equals":
            return _eval_flag_equals(condition, context)
        elif cond_type == "flag_exists":
            return _eval_flag_exists(condition, context)
        elif cond_type == "mood_in":
            return _eval_mood_in(condition, context)
        elif cond_type == "energy_between":
            return _eval_energy_between(condition, context)
        elif cond_type == "random_chance":
            return _eval_random_chance(condition, context)
        elif cond_type == "time_of_day_in":
            return _eval_time_of_day_in(condition, context)
        elif cond_type == "location_type_in":
            return _eval_location_type_in(condition, context)
        elif cond_type == "custom":
            return _eval_custom(condition, context)
        elif cond_type == "expression":
            return _eval_expression(condition, context)
        else:
            logger.warning(f"Unknown condition type: {cond_type}")
            return False

    except Exception as e:
        logger.error(f"Error evaluating condition {cond_type}: {e}", exc_info=True)
        return False


def evaluate_conditions_all(conditions: List[Dict[str, Any]], context: Dict[str, Any]) -> bool:
    """
    Evaluate multiple conditions with AND logic.

    Returns True if all conditions are met, False otherwise.
    """
    if not conditions:
        return True
    return all(evaluate_condition(cond, context) for cond in conditions)


def evaluate_conditions_any(conditions: List[Dict[str, Any]], context: Dict[str, Any]) -> bool:
    """
    Evaluate multiple conditions with OR logic.

    Returns True if any condition is met, False otherwise.
    """
    if not conditions:
        return True
    return any(evaluate_condition(cond, context) for cond in conditions)


# ==================
# Built-in Evaluators
# ==================


def _eval_relationship_gt(condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """Evaluate relationship_gt condition."""
    npc_id_or_role = condition.get("npcIdOrRole", "")
    metric = condition.get("metric", "affinity")
    threshold = condition.get("threshold", 0)

    relationships = context.get("relationships", {})
    relationship = relationships.get(npc_id_or_role, {})
    value = relationship.get(metric, 0)

    return value > threshold


def _eval_relationship_lt(condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """Evaluate relationship_lt condition."""
    npc_id_or_role = condition.get("npcIdOrRole", "")
    metric = condition.get("metric", "affinity")
    threshold = condition.get("threshold", 0)

    relationships = context.get("relationships", {})
    relationship = relationships.get(npc_id_or_role, {})
    value = relationship.get(metric, 0)

    return value < threshold


def _eval_flag_equals(condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """Evaluate flag_equals condition."""
    key = condition.get("key", "")
    expected_value = condition.get("value")

    flags = context.get("flags", {})

    # Support nested keys with dot notation (e.g., "arc.stage")
    keys = key.split(".")
    current = flags
    for k in keys:
        if isinstance(current, dict):
            current = current.get(k)
        else:
            return False

    return current == expected_value


def _eval_flag_exists(condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """Evaluate flag_exists condition."""
    key = condition.get("key", "")
    flags = context.get("flags", {})

    # Support nested keys with dot notation
    keys = key.split(".")
    current = flags
    for k in keys:
        if isinstance(current, dict) and k in current:
            current = current[k]
        else:
            return False

    return True


def _eval_mood_in(condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """Evaluate mood_in condition."""
    mood_tags = condition.get("moodTags", [])
    npc_state = context.get("npc_state", {})
    mood_state = npc_state.get("moodState", {})
    current_tags = mood_state.get("tags", [])

    # Check if any of the required mood tags are present
    return any(tag in current_tags for tag in mood_tags)


def _eval_energy_between(condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """Evaluate energy_between condition."""
    min_energy = condition.get("min", 0)
    max_energy = condition.get("max", 100)

    npc_state = context.get("npc_state", {})
    energy = npc_state.get("energy", 50)  # Default to mid-range

    return min_energy <= energy <= max_energy


def _eval_random_chance(condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """Evaluate random_chance condition."""
    probability = condition.get("probability", 0.5)
    return random.random() < probability


def _eval_time_of_day_in(condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """Evaluate time_of_day_in condition."""
    times = condition.get("times", [])
    world_time = context.get("world_time", 0)

    # Calculate time of day from world_time (assuming seconds in a day)
    # Morning: 6-12, Afternoon: 12-18, Evening: 18-22, Night: 22-6
    seconds_per_hour = 3600
    hour_of_day = (world_time // seconds_per_hour) % 24

    current_time_of_day = _get_time_of_day(hour_of_day)
    return current_time_of_day in times


def _get_time_of_day(hour: int) -> str:
    """Convert hour (0-23) to time of day string."""
    if 6 <= hour < 12:
        return "morning"
    elif 12 <= hour < 18:
        return "afternoon"
    elif 18 <= hour < 22:
        return "evening"
    else:
        return "night"


def _eval_location_type_in(condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """Evaluate location_type_in condition."""
    location_types = condition.get("locationTypes", [])
    npc_state = context.get("npc_state", {})
    current_location_id = npc_state.get("currentLocationId")

    if not current_location_id:
        return False

    # Get location from world (simplified - would need actual location lookup)
    # For now, assume location type is stored in location meta
    world = context.get("world")
    if not world:
        return False

    # This would need actual location lookup logic
    # Placeholder implementation
    return True  # TODO: Implement proper location type checking


def _eval_custom(condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """Evaluate custom condition using registered evaluators."""
    evaluator_id = condition.get("evaluatorId", "")
    params = condition.get("params", {})

    evaluator = CONDITION_EVALUATORS.get(evaluator_id)
    if not evaluator:
        logger.warning(f"Custom evaluator not found: {evaluator_id}")
        return False

    # Pass both params and full context to evaluator
    return evaluator(params, context)


def _eval_expression(condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """
    Evaluate expression-based condition (ADVANCED - optional).

    For security, this should use a safe expression evaluator.
    For now, returns False (not implemented).
    """
    expression = condition.get("expression", "")
    logger.warning(f"Expression conditions not yet implemented: {expression}")
    return False


# ==================
# Example Custom Evaluators
# ==================


def _example_evaluator_is_raining(params: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """Example custom evaluator: check if it's raining."""
    world = context.get("world")
    if not world:
        return False

    weather = getattr(world, "weather", "clear")
    return weather == "rain"


def _example_evaluator_quest_active(params: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """Example custom evaluator: check if a quest is active."""
    quest_id = params.get("questId", "")
    flags = context.get("flags", {})

    quest_key = f"quest:{quest_id}.active"
    return flags.get(quest_key, False)


def _example_evaluator_has_item(params: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """Example custom evaluator: check if player has an item."""
    item_id = params.get("itemId", "")
    quantity = params.get("quantity", 1)
    flags = context.get("flags", {})

    inventory = flags.get("inventory", {})
    return inventory.get(item_id, 0) >= quantity


# Register example evaluators
register_condition_evaluator("evaluator:is_raining", _example_evaluator_is_raining)
register_condition_evaluator("evaluator:quest_active", _example_evaluator_quest_active)
register_condition_evaluator("evaluator:has_item", _example_evaluator_has_item)
