"""
PixSim7 Simulation Domain Entry Module

Provides a stable public interface for world simulation including:
- World tick scheduling and time progression
- NPC behavior system (conditions, effects, scoring)
- Simulation tier management
- Routine resolution and activity selection

Usage:
    from pixsim7.backend.simulation import (
        WorldScheduler, WorldSimulationContext, SchedulerLoopRunner,
        evaluate_condition, apply_activity_effects,
        determine_simulation_tier, should_tick_npc,
    )

See docs/backend/simulation.md for detailed documentation.
"""

# =============================================================================
# Simulation Services
# =============================================================================

from pixsim7.backend.main.services.simulation import (
    WorldSimulationContext,
    WorldScheduler,
    SchedulerLoopRunner,
)

# =============================================================================
# Behavior System (Simulation Logic)
# =============================================================================

from pixsim7.backend.main.domain.game.behavior import (
    # Conditions
    evaluate_condition,
    evaluate_conditions_all,
    evaluate_conditions_any,
    register_condition_evaluator,
    # Effects
    apply_activity_effects,
    apply_custom_effect,
    register_effect_handler,
    # Scoring
    DEFAULT_SCORING_WEIGHTS,
    calculate_activity_score,
    choose_activity,
    merge_preferences,
    score_and_filter_activities,
    # Simulation Tiers
    determine_simulation_tier,
    get_default_simulation_config,
    should_tick_npc,
    get_npcs_to_simulate,
    # Routine Resolution
    find_active_routine_node,
    collect_candidate_activities,
    choose_npc_activity,
    apply_activity_to_npc,
    finish_activity,
)

# =============================================================================
# Public API
# =============================================================================

__all__ = [
    # Simulation Services
    "WorldSimulationContext",
    "WorldScheduler",
    "SchedulerLoopRunner",
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
    # Simulation Tiers
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
