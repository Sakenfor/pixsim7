"""
Condition Evaluation System for NPC Behavior

Provides a DSL for evaluating conditions in:
- Activity requirements
- Routine graph transitions
- Simulation prioritization

Supports built-in condition types and extensible custom evaluators.

Built-in conditions now use the behavior_registry for uniform registration.
"""

from __future__ import annotations

import random
from typing import Any, Callable, Dict, List, Optional

import logging

logger = logging.getLogger(__name__)


# Type alias for evaluator functions
ConditionEvaluator = Callable[[Dict[str, Any], Dict[str, Any]], bool]


# ==================
# Built-in Condition Registry
# ==================

# Registry of built-in condition evaluators
# These are registered at module load time for bootstrap before plugin system
BUILTIN_CONDITIONS: Dict[str, Callable[[Dict[str, Any], Dict[str, Any]], bool]] = {}


def register_condition_evaluator(evaluator_id: str, evaluator: ConditionEvaluator) -> None:
    """
    Register a custom condition evaluator.

    This is a convenience wrapper around behavior_registry.register_condition().
    All custom evaluators are registered in the unified behavior_registry.

    Note: For legacy "custom" type conditions with evaluatorId.
    New code should use plugin-namespaced condition types instead.

    Args:
        evaluator_id: Unique ID for the evaluator (e.g., "evaluator:is_raining")
        evaluator: Function that takes (condition, context) and returns bool
    """
    from pixsim7.backend.main.infrastructure.plugins.behavior_registry import behavior_registry

    # Wrap the evaluator to match behavior_registry signature
    # behavior_registry expects evaluator(context), but legacy evaluators expect (params, context)
    def wrapped_evaluator(context: Dict[str, Any]) -> bool:
        # Extract params from condition if available
        # For legacy evaluators, params come from the condition itself
        condition = context.get("_condition", {})
        params = condition.get("params", {})
        return evaluator(params, context)

    success = behavior_registry.register_condition(
        condition_id=evaluator_id,
        plugin_id="core",  # Legacy evaluators use "core" as plugin_id
        evaluator=wrapped_evaluator,
        description=f"Legacy condition evaluator: {evaluator_id}"
    )

    if success:
        logger.info(f"Registered condition evaluator: {evaluator_id}")
    else:
        logger.warning(f"Condition evaluator '{evaluator_id}' already registered")


def evaluate_condition(condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """
    Evaluate a single condition using the Condition DSL.

    Uses unified registry lookup for both built-in and plugin conditions.

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
        # Try built-in conditions registry first
        if cond_type in BUILTIN_CONDITIONS:
            evaluator = BUILTIN_CONDITIONS[cond_type]
            return evaluator(condition, context)

        # Try plugin conditions via behavior_registry
        # Plugin conditions are registered with fully qualified IDs (e.g., "plugin:my_plugin:my_condition")
        if cond_type.startswith("plugin:"):
            from pixsim7.backend.main.infrastructure.plugins.behavior_registry import behavior_registry
            metadata = behavior_registry.get_condition(cond_type)
            if metadata:
                # Plugin conditions expect just the context, not (condition, context)
                return metadata.evaluator(context)
            else:
                logger.warning(f"Plugin condition not found in registry: {cond_type}")
                return False

        # Special handling for 'custom' type (legacy compatibility)
        if cond_type == "custom":
            return _eval_custom(condition, context)

        # Unknown condition type
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


# ==================
# Stat-Aware Evaluators (Task 110)
# ==================


def _get_stat_value(
    stat_definition_id: str,
    axis: str,
    context: Dict[str, Any],
    npc_id_or_role: Optional[str] = None,
    default: float = 0.0,
) -> float:
    """
    Helper to retrieve a stat value from the stat system.

    Args:
        stat_definition_id: The stat definition ID (e.g., "relationships", "mood", "skills")
        axis: The axis name within the stat definition
        context: Evaluation context
        npc_id_or_role: For relational stats (like relationships), the target NPC. None for entity stats.
        default: Default value if stat not found

    Returns:
        The stat value, or default if not found
    """
    # Try to get from stat system first (session-level stats for relationships)
    session = context.get("session")
    if session and npc_id_or_role:
        # Relational stats stored in session.stats[stat_definition_id][npc_id_or_role][axis]
        session_stats = getattr(session, "stats", {})
        stat_def_data = session_stats.get(stat_definition_id, {})
        target_stats = stat_def_data.get(npc_id_or_role, {})
        if axis in target_stats:
            return target_stats.get(axis, default)

    # Try entity-owned stats (for mood, skills, etc.)
    npc_stats = context.get("npc_stats", {})
    if npc_stats and not npc_id_or_role:
        stat_def_data = npc_stats.get(stat_definition_id, {})
        if axis in stat_def_data:
            return stat_def_data.get(axis, default)

    # Fall back to legacy relationships dict for backwards compatibility
    if stat_definition_id == "relationships" and npc_id_or_role:
        relationships = context.get("relationships", {})
        relationship = relationships.get(npc_id_or_role, {})
        if axis in relationship:
            return relationship.get(axis, default)

    return default


def _eval_stat_axis_gt(condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """
    Evaluate stat_axis_gt condition - checks if stat value > threshold.

    Supports any stat definition (relationships, mood, skills, etc.).

    Example:
        {
            "type": "stat_axis_gt",
            "statDefinition": "relationships",
            "npcIdOrRole": "npc:5",
            "axis": "affinity",
            "threshold": 50
        }
    """
    stat_definition = condition.get("statDefinition", "")
    axis = condition.get("axis", "")
    threshold = condition.get("threshold", 0)
    npc_id_or_role = condition.get("npcIdOrRole")

    if not stat_definition or not axis:
        logger.warning(
            "stat_axis_gt condition missing required fields",
            stat_definition=stat_definition,
            axis=axis,
        )
        return False

    value = _get_stat_value(stat_definition, axis, context, npc_id_or_role)
    return value > threshold


def _eval_stat_axis_lt(condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """
    Evaluate stat_axis_lt condition - checks if stat value < threshold.

    Example:
        {
            "type": "stat_axis_lt",
            "statDefinition": "mood",
            "axis": "stress",
            "threshold": 30
        }
    """
    stat_definition = condition.get("statDefinition", "")
    axis = condition.get("axis", "")
    threshold = condition.get("threshold", 0)
    npc_id_or_role = condition.get("npcIdOrRole")

    if not stat_definition or not axis:
        logger.warning(
            "stat_axis_lt condition missing required fields",
            stat_definition=stat_definition,
            axis=axis,
        )
        return False

    value = _get_stat_value(stat_definition, axis, context, npc_id_or_role)
    return value < threshold


def _eval_stat_axis_between(condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """
    Evaluate stat_axis_between condition - checks if min <= stat value <= max.

    Example:
        {
            "type": "stat_axis_between",
            "statDefinition": "skills",
            "axis": "strength",
            "min": 40,
            "max": 80
        }
    """
    stat_definition = condition.get("statDefinition", "")
    axis = condition.get("axis", "")
    min_val = condition.get("min", 0)
    max_val = condition.get("max", 100)
    npc_id_or_role = condition.get("npcIdOrRole")

    if not stat_definition or not axis:
        logger.warning(
            "stat_axis_between condition missing required fields",
            stat_definition=stat_definition,
            axis=axis,
        )
        return False

    value = _get_stat_value(stat_definition, axis, context, npc_id_or_role)
    return min_val <= value <= max_val


# ==================
# Legacy Relationship Evaluators (Backwards Compatible)
# ==================


def _eval_relationship_gt(condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """
    Evaluate relationship_gt condition (legacy, backwards compatible).

    This is now a convenience wrapper around stat_axis_gt with statDefinition="relationships".
    Supports both "metric" (legacy) and "axis" (new) field names.

    Example:
        {
            "type": "relationship_gt",
            "npcIdOrRole": "npc:5",
            "metric": "affinity",  // or "axis": "affinity"
            "threshold": 50
        }
    """
    npc_id_or_role = condition.get("npcIdOrRole", "")
    # Support both "metric" (legacy) and "axis" (new) field names
    axis = condition.get("axis") or condition.get("metric", "affinity")
    threshold = condition.get("threshold", 0)

    # Delegate to stat_axis_gt with statDefinition="relationships"
    stat_condition = {
        "type": "stat_axis_gt",
        "statDefinition": "relationships",
        "npcIdOrRole": npc_id_or_role,
        "axis": axis,
        "threshold": threshold,
    }

    return _eval_stat_axis_gt(stat_condition, context)


def _eval_relationship_lt(condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """
    Evaluate relationship_lt condition (legacy, backwards compatible).

    This is now a convenience wrapper around stat_axis_lt with statDefinition="relationships".
    Supports both "metric" (legacy) and "axis" (new) field names.

    Example:
        {
            "type": "relationship_lt",
            "npcIdOrRole": "npc:5",
            "metric": "trust",  // or "axis": "trust"
            "threshold": 30
        }
    """
    npc_id_or_role = condition.get("npcIdOrRole", "")
    # Support both "metric" (legacy) and "axis" (new) field names
    axis = condition.get("axis") or condition.get("metric", "affinity")
    threshold = condition.get("threshold", 0)

    # Delegate to stat_axis_lt with statDefinition="relationships"
    stat_condition = {
        "type": "stat_axis_lt",
        "statDefinition": "relationships",
        "npcIdOrRole": npc_id_or_role,
        "axis": axis,
        "threshold": threshold,
    }

    return _eval_stat_axis_lt(stat_condition, context)


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

    # Query behavior_registry for the evaluator
    from pixsim7.backend.main.infrastructure.plugins.behavior_registry import behavior_registry
    metadata = behavior_registry.get_condition(evaluator_id)

    if not metadata:
        logger.warning(f"Custom evaluator not found: {evaluator_id}")
        return False

    # Add condition to context so wrapped evaluator can extract params
    context_with_condition = {**context, "_condition": condition}

    # Call the evaluator
    return metadata.evaluator(context_with_condition)


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


# Register example evaluators (DEPRECATED - kept for backward compatibility)
register_condition_evaluator("evaluator:is_raining", _example_evaluator_is_raining)
register_condition_evaluator("evaluator:quest_active", _example_evaluator_quest_active)
register_condition_evaluator("evaluator:has_item", _example_evaluator_has_item)


# ==================
# Register Built-in Conditions
# ==================

def _register_builtin_conditions():
    """
    Register all built-in condition evaluators.

    This function is called at module load time to populate the BUILTIN_CONDITIONS registry.
    Built-in conditions use the same lookup pathway as plugin conditions.
    """
    # Stat-aware conditions (Task 110)
    BUILTIN_CONDITIONS["stat_axis_gt"] = _eval_stat_axis_gt
    BUILTIN_CONDITIONS["stat_axis_lt"] = _eval_stat_axis_lt
    BUILTIN_CONDITIONS["stat_axis_between"] = _eval_stat_axis_between

    # Legacy relationship conditions (backwards compatible, delegate to stat-aware)
    BUILTIN_CONDITIONS["relationship_gt"] = _eval_relationship_gt
    BUILTIN_CONDITIONS["relationship_lt"] = _eval_relationship_lt

    # Other built-in conditions
    BUILTIN_CONDITIONS["flag_equals"] = _eval_flag_equals
    BUILTIN_CONDITIONS["flag_exists"] = _eval_flag_exists
    BUILTIN_CONDITIONS["mood_in"] = _eval_mood_in
    BUILTIN_CONDITIONS["energy_between"] = _eval_energy_between
    BUILTIN_CONDITIONS["random_chance"] = _eval_random_chance
    BUILTIN_CONDITIONS["time_of_day_in"] = _eval_time_of_day_in
    BUILTIN_CONDITIONS["location_type_in"] = _eval_location_type_in
    BUILTIN_CONDITIONS["expression"] = _eval_expression

    logger.info(f"Registered {len(BUILTIN_CONDITIONS)} built-in condition evaluators")


# Register built-in conditions at module load time
_register_builtin_conditions()
