"""
NPC Behavior System Domain Layer (Task 13)

This package contains the core logic for NPC behavior simulation:
- Condition evaluation (DSL)
- Effect handlers (activity effects)
- Scoring system (activity selection)
- Simulation prioritization (game-agnostic)
"""

from .conditions import (
    CONDITION_EVALUATORS,
    evaluate_condition,
    evaluate_conditions_all,
    evaluate_conditions_any,
    register_condition_evaluator,
)
from .effects import (
    EFFECT_HANDLERS,
    apply_activity_effects,
    apply_custom_effect,
    register_effect_handler,
)
from .scoring import (
    DEFAULT_SCORING_WEIGHTS,
    calculate_activity_score,
    choose_activity,
    merge_preferences,
)
from .simulation import (
    determine_simulation_tier,
    get_default_simulation_config,
    should_tick_npc,
)

__all__ = [
    # Conditions
    "CONDITION_EVALUATORS",
    "evaluate_condition",
    "evaluate_conditions_all",
    "evaluate_conditions_any",
    "register_condition_evaluator",
    # Effects
    "EFFECT_HANDLERS",
    "apply_activity_effects",
    "apply_custom_effect",
    "register_effect_handler",
    # Scoring
    "DEFAULT_SCORING_WEIGHTS",
    "calculate_activity_score",
    "choose_activity",
    "merge_preferences",
    # Simulation
    "determine_simulation_tier",
    "get_default_simulation_config",
    "should_tick_npc",
]
