"""
NPC Behavior System Domain Layer (Task 13)

This package contains the core logic for NPC behavior simulation:
- Condition evaluation (DSL)
- Effect handlers (activity effects)
- Scoring system (activity selection)
- Simulation prioritization (game-agnostic)
- Routine graph traversal and activity resolution
"""

from .conditions import (
    evaluate_condition,
    evaluate_conditions_all,
    evaluate_conditions_any,
    register_condition_evaluator,
)
from .effects import (
    apply_activity_effects,
    apply_custom_effect,
    register_effect_handler,
)
from .scoring import (
    DEFAULT_SCORING_WEIGHTS,
    calculate_activity_score,
    choose_activity,
    merge_preferences,
    score_and_filter_activities,
)
from .simulation import (
    determine_simulation_tier,
    get_default_simulation_config,
    should_tick_npc,
    get_npcs_to_simulate,
)
from .routine_resolver import (
    find_active_routine_node,
    collect_candidate_activities,
    choose_npc_activity,
    apply_activity_to_npc,
    finish_activity,
)

__all__ = [
    # Conditions
    "evaluate_condition",
    "evaluate_conditions_all",
    "evaluate_conditions_any",
    "register_condition_evaluator",
    # Effects
    "apply_activity_effects",
    "apply_custom_effect",
    "register_effect_handler",
    # Scoring
    "DEFAULT_SCORING_WEIGHTS",
    "calculate_activity_score",
    "choose_activity",
    "merge_preferences",
    "score_and_filter_activities",
    # Simulation
    "determine_simulation_tier",
    "get_default_simulation_config",
    "should_tick_npc",
    "get_npcs_to_simulate",
    # Routine Resolution
    "find_active_routine_node",
    "collect_candidate_activities",
    "choose_npc_activity",
    "apply_activity_to_npc",
    "finish_activity",
]
