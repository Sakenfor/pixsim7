"""
Game Behavior Bootstrap Module

Registers all built-in game behaviors:
- Condition evaluators (stat_axis_gt, flag_equals, etc.)
- Effect handlers (effect:give_item, effect:grant_xp, etc.)
- Scoring factors (activityPreference, categoryPreference, etc.)

This module provides explicit, idempotent registration of built-in behaviors.
It should be called once during application startup, not at import time.

Usage:
    from pixsim7.backend.main.domain.game.behavior.bootstrap import (
        register_game_behavior_builtins
    )

    # During app startup:
    register_game_behavior_builtins()
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# Module-level guard to ensure registration only happens once
_BUILTINS_REGISTERED = False


def register_game_behavior_builtins() -> dict:
    """
    Register all built-in game behaviors.

    This function is idempotent - it's safe to call multiple times.
    Only the first call will perform registration.

    Returns:
        dict: Statistics about what was registered
            {
                'conditions': int,
                'effects': int,
                'scoring_factors': int,
                'already_registered': bool
            }
    """
    global _BUILTINS_REGISTERED

    if _BUILTINS_REGISTERED:
        logger.debug("Built-in behaviors already registered, skipping")
        return {
            'conditions': 0,
            'effects': 0,
            'scoring_factors': 0,
            'already_registered': True
        }

    logger.info("Registering built-in game behaviors...")

    # Register built-in conditions
    conditions_count = _register_builtin_conditions()
    logger.info(f"Registered {conditions_count} built-in condition evaluators")

    # Register built-in effects
    effects_count = _register_builtin_effects()
    logger.info(f"Registered {effects_count} built-in effect handlers")

    # Register built-in scoring factors
    scoring_factors_count = _register_builtin_scoring_factors()
    logger.info(f"Registered {scoring_factors_count} built-in scoring factors")

    # NOTE: Tag effects, behavior profiles, and trait mappings are now registered
    # by the personality plugin (packages/plugins/personality).
    # This keeps the core engine personality-agnostic.

    _BUILTINS_REGISTERED = True

    logger.info(
        f"Built-in game behaviors registered successfully: "
        f"conditions={conditions_count}, effects={effects_count}, "
        f"scoring_factors={scoring_factors_count}"
    )

    return {
        'conditions': conditions_count,
        'effects': effects_count,
        'scoring_factors': scoring_factors_count,
        'already_registered': False
    }


def _register_builtin_conditions() -> int:
    """
    Register all built-in condition evaluators.

    Returns:
        int: Number of conditions registered
    """
    from .conditions import (
        BUILTIN_CONDITIONS,
        register_condition_evaluator,
        _eval_stat_axis_gt,
        _eval_stat_axis_lt,
        _eval_stat_axis_between,
        _eval_relationship_gt,
        _eval_relationship_lt,
        _eval_flag_equals,
        _eval_flag_exists,
        _eval_mood_in,
        _eval_energy_between,
        _eval_random_chance,
        _eval_time_of_day_in,
        _eval_location_type_in,
        _eval_expression,
        _example_evaluator_is_raining,
        _example_evaluator_quest_active,
        _example_evaluator_has_item,
    )

    # Stat-aware conditions
    BUILTIN_CONDITIONS["stat_axis_gt"] = _eval_stat_axis_gt
    BUILTIN_CONDITIONS["stat_axis_lt"] = _eval_stat_axis_lt
    BUILTIN_CONDITIONS["stat_axis_between"] = _eval_stat_axis_between

    # Legacy relationship conditions (backwards compatible)
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

    # Register example custom evaluators with params schemas
    register_condition_evaluator(
        "evaluator:is_raining",
        _example_evaluator_is_raining,
        description="Check if it's currently raining",
        params_schema=None  # No parameters
    )

    register_condition_evaluator(
        "evaluator:quest_active",
        _example_evaluator_quest_active,
        description="Check if a quest is active",
        params_schema={
            "type": "object",
            "properties": {
                "questId": {"type": "string", "description": "Quest identifier"}
            },
            "required": ["questId"]
        }
    )

    register_condition_evaluator(
        "evaluator:has_item",
        _example_evaluator_has_item,
        description="Check if player has an item",
        params_schema={
            "type": "object",
            "properties": {
                "itemId": {"type": "string", "description": "Item identifier"},
                "quantity": {"type": "number", "minimum": 1, "description": "Required quantity (default: 1)"}
            },
            "required": ["itemId"]
        }
    )

    return len(BUILTIN_CONDITIONS) + 3  # BUILTIN_CONDITIONS + 3 example evaluators


def _register_builtin_effects() -> int:
    """
    Register all built-in effect handlers.

    Returns:
        int: Number of effects registered
    """
    from .effects import (
        register_effect_handler,
        _example_give_item_effect,
        _example_grant_xp_effect,
        _example_consume_ingredient_effect,
        _example_spawn_event_effect,
    )

    # Register example effect handlers with params schemas
    register_effect_handler(
        "effect:give_item",
        _example_give_item_effect,
        description="Give an item to the player",
        default_params={"itemId": "", "quantity": 1},
        params_schema={
            "type": "object",
            "properties": {
                "itemId": {"type": "string", "description": "Item identifier"},
                "quantity": {"type": "number", "minimum": 1, "description": "Quantity to give (default: 1)"}
            },
            "required": ["itemId"]
        }
    )

    register_effect_handler(
        "effect:grant_xp",
        _example_grant_xp_effect,
        description="Grant XP to a skill",
        default_params={"skill": "", "amount": 0},
        params_schema={
            "type": "object",
            "properties": {
                "skill": {"type": "string", "description": "Skill identifier"},
                "amount": {"type": "number", "minimum": 0, "description": "XP amount to grant"}
            },
            "required": ["skill", "amount"]
        }
    )

    register_effect_handler(
        "effect:consume_ingredient",
        _example_consume_ingredient_effect,
        description="Consume an ingredient from inventory",
        default_params={"itemId": "", "quantity": 1},
        params_schema={
            "type": "object",
            "properties": {
                "itemId": {"type": "string", "description": "Item identifier"},
                "quantity": {"type": "number", "minimum": 1, "description": "Quantity to consume (default: 1)"}
            },
            "required": ["itemId"]
        }
    )

    register_effect_handler(
        "effect:spawn_event",
        _example_spawn_event_effect,
        description="Spawn a world event",
        default_params={"eventId": "", "eventData": {}},
        params_schema={
            "type": "object",
            "properties": {
                "eventId": {"type": "string", "description": "Event identifier"},
                "eventData": {"type": "object", "description": "Event data payload"}
            },
            "required": ["eventId"]
        }
    )

    return 4  # 4 example effects


def _register_builtin_scoring_factors() -> int:
    """
    Register all built-in scoring factors.

    Returns:
        int: Number of scoring factors registered
    """
    from .scoring import (
        register_scoring_factor,
        DEFAULT_SCORING_WEIGHTS,
        _factor_activity_preference,
        _factor_category_preference,
        _factor_trait_modifier,
        _factor_mood_compatibility,
        _factor_relationship_bonus,
        _factor_urgency,
        _factor_inertia,
        _factor_archetype_modifier,
        _factor_behavior_profile_modifier,
        _factor_trait_effect_modifier,
    )

    # Register built-in scoring factors
    register_scoring_factor(
        "activityPreference",
        _factor_activity_preference,
        DEFAULT_SCORING_WEIGHTS["activityPreference"]
    )
    register_scoring_factor(
        "categoryPreference",
        _factor_category_preference,
        DEFAULT_SCORING_WEIGHTS["categoryPreference"]
    )
    register_scoring_factor(
        "traitModifier",
        _factor_trait_modifier,
        DEFAULT_SCORING_WEIGHTS["traitModifier"]
    )
    register_scoring_factor(
        "moodCompatibility",
        _factor_mood_compatibility,
        DEFAULT_SCORING_WEIGHTS["moodCompatibility"]
    )
    register_scoring_factor(
        "relationshipBonus",
        _factor_relationship_bonus,
        DEFAULT_SCORING_WEIGHTS["relationshipBonus"]
    )
    register_scoring_factor(
        "urgency",
        _factor_urgency,
        DEFAULT_SCORING_WEIGHTS["urgency"]
    )
    register_scoring_factor(
        "inertia",
        _factor_inertia,
        DEFAULT_SCORING_WEIGHTS["inertia"]
    )

    # Phase 1: Archetype-based scoring (feature-flagged)
    register_scoring_factor(
        "archetypeModifier",
        _factor_archetype_modifier,
        DEFAULT_SCORING_WEIGHTS.get("archetypeModifier", 1.0),
        description="Personality archetype activity preference modifier"
    )

    # Phase 3: Behavior profile scoring (feature-flagged)
    register_scoring_factor(
        "behaviorProfileModifier",
        _factor_behavior_profile_modifier,
        DEFAULT_SCORING_WEIGHTS.get("behaviorProfileModifier", 1.0),
        description="Active behavior profile modifiers"
    )

    # Phase 4: Trait effect scoring (feature-flagged)
    register_scoring_factor(
        "traitEffectModifier",
        _factor_trait_effect_modifier,
        DEFAULT_SCORING_WEIGHTS.get("traitEffectModifier", 0.8),
        description="Trait-derived activity preference modifiers"
    )

    return 10  # 10 built-in scoring factors


# NOTE: Tag effects, behavior profiles, and trait effect mappings have been
# moved to the personality plugin (packages/plugins/personality).
# This keeps the core engine personality-agnostic and allows swapping
# personality models (Big Five, MBTI, custom, etc.) via plugins.
