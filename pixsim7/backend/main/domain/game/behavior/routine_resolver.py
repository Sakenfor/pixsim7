"""
Routine Graph Traversal and Activity Resolution

Handles:
- Finding active routine graph nodes based on world time
- Collecting candidate activities from routine nodes
- Resolving final activity choice using scoring system
- Managing activity transitions and effects
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import logging

from .conditions import evaluate_conditions_all
from .scoring import (
    calculate_activity_score,
    score_and_filter_activities,
    choose_activity,
    merge_preferences,
)
from .effects import apply_activity_effects

logger = logging.getLogger(__name__)


def find_active_routine_node(
    routine: Dict[str, Any],
    world_time: float,
    npc_state: Dict[str, Any],
    context: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """
    Find the active routine node for the current world time and NPC state.

    Args:
        routine: RoutineGraph dict
        world_time: Current world time in seconds
        npc_state: NPC session state
        context: Evaluation context

    Returns:
        Active routine node dict, or None if no node is active
    """
    nodes = routine.get("nodes", [])
    edges = routine.get("edges", [])

    # Calculate time of day from world time (seconds in a day)
    seconds_per_day = 86400  # 24 hours
    time_of_day = world_time % seconds_per_day

    # Find all time_slot nodes that cover the current time
    candidate_nodes = []

    for node in nodes:
        node_type = node.get("nodeType")

        if node_type == "time_slot":
            time_range = node.get("timeRangeSeconds")
            if time_range:
                start = time_range.get("start", 0)
                end = time_range.get("end", seconds_per_day)

                # Handle wrapping around midnight
                if start <= end:
                    if start <= time_of_day < end:
                        candidate_nodes.append(node)
                else:
                    # Wraps midnight
                    if time_of_day >= start or time_of_day < end:
                        candidate_nodes.append(node)

        elif node_type == "decision":
            # Decision nodes are evaluated based on conditions
            decision_conditions = node.get("decisionConditions", [])
            if evaluate_conditions_all(decision_conditions, context):
                candidate_nodes.append(node)

        elif node_type == "activity":
            # Activity nodes are always candidates
            candidate_nodes.append(node)

    if not candidate_nodes:
        return None

    # If multiple candidates, choose based on node priority or first match
    # For now, return the first candidate
    # TODO: Add node priority field for conflict resolution
    return candidate_nodes[0]


def collect_candidate_activities(
    node: Dict[str, Any],
    world: Any,
    context: Dict[str, Any],
) -> List[Tuple[Dict[str, Any], float]]:
    """
    Collect candidate activities from a routine node.

    Args:
        node: Routine node dict
        world: The world
        context: Evaluation context

    Returns:
        List of (activity_dict, base_weight) tuples
    """
    preferred_activities = node.get("preferredActivities", [])
    if not preferred_activities:
        return []

    behavior_config = _get_behavior_config(world)
    all_activities = behavior_config.get("activities", {})

    candidates = []

    for pref_activity in preferred_activities:
        activity_id = pref_activity.get("activityId")
        base_weight = pref_activity.get("weight", 1.0)
        conditions = pref_activity.get("conditions", [])

        # Check if activity exists
        if activity_id not in all_activities:
            logger.warning(f"Activity {activity_id} referenced in routine but not found in catalog")
            continue

        # Check conditions
        if conditions and not evaluate_conditions_all(conditions, context):
            continue

        activity = all_activities[activity_id]
        candidates.append((activity, base_weight))

    return candidates


def choose_npc_activity(
    npc: Any,
    world: Any,
    session: Any,
    world_time: float,
) -> Optional[Dict[str, Any]]:
    """
    Choose an activity for an NPC based on their routine, preferences, and state.

    This is the main entry point for activity resolution.

    Args:
        npc: The NPC
        world: The world
        session: The game session
        world_time: Current world time

    Returns:
        Selected activity dict, or None if no activity could be chosen
    """
    # Get NPC's routine
    npc_meta = getattr(npc, "meta", {}) or {}
    npc_behavior = npc_meta.get("behavior", {})
    routine_id = npc_behavior.get("routineId")

    if not routine_id:
        logger.debug(f"NPC {npc.id} has no routine assigned")
        return None

    behavior_config = _get_behavior_config(world)
    routines = behavior_config.get("routines", {})
    routine = routines.get(routine_id)

    if not routine:
        logger.warning(f"Routine {routine_id} not found for NPC {npc.id}")
        return None

    # Get NPC state and preferences
    npc_state = _get_npc_state(session, npc)
    npc_state["world_time"] = world_time

    # Merge preferences: routine defaults < NPC defaults < session overrides
    routine_default_prefs = routine.get("defaultPreferences", {})
    npc_default_prefs = npc_behavior.get("preferences", {})
    session_prefs = _get_session_npc_preferences(session, npc)

    merged_prefs = merge_preferences(
        routine_default_prefs,
        npc_default_prefs,
        session_prefs,
    )

    # Build evaluation context
    context = _build_context(npc, world, session, npc_state)

    # Find active routine node
    active_node = find_active_routine_node(routine, world_time, npc_state, context)
    if not active_node:
        logger.debug(f"No active routine node for NPC {npc.id} at time {world_time}")
        return None

    # Collect candidate activities from node
    candidates = collect_candidate_activities(active_node, world, context)
    if not candidates:
        logger.debug(f"No candidate activities for NPC {npc.id}")
        return None

    # Build base weights dict
    base_weights = {activity["id"]: weight for activity, weight in candidates}
    activity_list = [activity for activity, _ in candidates]

    # Get scoring config
    scoring_config = behavior_config.get("scoringConfig", {})
    scoring_weights = scoring_config.get("weights") if scoring_config else None

    # Score and filter activities
    feasible = score_and_filter_activities(
        activity_list,
        merged_prefs,
        npc_state,
        context,
        scoring_weights,
        base_weights,
    )

    if not feasible:
        logger.debug(f"No feasible activities for NPC {npc.id}")
        return None

    # Choose activity
    selected_activity = choose_activity(feasible, npc_state)

    return selected_activity


def apply_activity_to_npc(
    npc: Any,
    session: Any,
    activity: Dict[str, Any],
    world_time: float,
    delta_seconds: float = 0,
) -> None:
    """
    Apply an activity to an NPC, updating their state and applying effects.

    Args:
        npc: The NPC
        session: The game session
        activity: The activity dict
        world_time: Current world time
        delta_seconds: Time elapsed since activity started
    """
    npc_state = _get_npc_state(session, npc)

    # Update NPC state
    activity_id = activity.get("id")
    npc_state["currentActivityId"] = activity_id

    # Set activity start time if this is a new activity
    if npc_state.get("activityStartedAtSeconds") is None or delta_seconds == 0:
        npc_state["activityStartedAtSeconds"] = world_time

    # Apply activity effects
    effects = activity.get("effects")
    if effects:
        context = _build_effect_context(npc, session, npc_state, world_time)
        apply_activity_effects(effects, context, delta_seconds)

    # Schedule next decision time
    min_duration = activity.get("minDurationSeconds", 0)
    next_decision_time = world_time + min_duration
    npc_state["nextDecisionAtSeconds"] = next_decision_time

    # Save updated state
    _set_npc_state(session, npc, npc_state)


def finish_activity(
    npc: Any,
    session: Any,
    world_time: float,
) -> None:
    """
    Mark an activity as finished for an NPC.

    Updates activity history for cooldown tracking.

    Args:
        npc: The NPC
        session: The game session
        world_time: Current world time
    """
    npc_state = _get_npc_state(session, npc)

    current_activity_id = npc_state.get("currentActivityId")
    if not current_activity_id:
        return

    # Add to activity history
    if "lastActivities" not in npc_state:
        npc_state["lastActivities"] = []

    npc_state["lastActivities"].append({
        "activityId": current_activity_id,
        "endedAtSeconds": world_time,
    })

    # Keep only recent history (last 10 activities)
    npc_state["lastActivities"] = npc_state["lastActivities"][-10:]

    # Clear current activity
    npc_state["currentActivityId"] = None
    npc_state["activityStartedAtSeconds"] = None

    _set_npc_state(session, npc, npc_state)


# ==================
# Helper Functions
# ==================


def _get_behavior_config(world: Any) -> Dict[str, Any]:
    """Get behavior config from world meta."""
    meta = getattr(world, "meta", {}) or {}
    return meta.get("behavior", {})


def _get_npc_state(session: Any, npc: Any) -> Dict[str, Any]:
    """Get NPC session state from session.flags.npcs[npc_id].state"""
    flags = getattr(session, "flags", {})
    npcs_data = flags.get("npcs", {})
    npc_id = f"npc:{npc.id}"
    npc_data = npcs_data.get(npc_id, {})
    return npc_data.get("state", {})


def _set_npc_state(session: Any, npc: Any, state: Dict[str, Any]) -> None:
    """Set NPC session state in session.flags.npcs[npc_id].state"""
    flags = getattr(session, "flags", {})

    if "npcs" not in flags:
        flags["npcs"] = {}

    npc_id = f"npc:{npc.id}"

    if npc_id not in flags["npcs"]:
        flags["npcs"][npc_id] = {}

    flags["npcs"][npc_id]["state"] = state


def _get_session_npc_preferences(session: Any, npc: Any) -> Optional[Dict[str, Any]]:
    """Get session-specific NPC preference overrides."""
    flags = getattr(session, "flags", {})
    npcs_data = flags.get("npcs", {})
    npc_id = f"npc:{npc.id}"
    npc_data = npcs_data.get(npc_id, {})
    return npc_data.get("preferences")


def _build_context(
    npc: Any,
    world: Any,
    session: Any,
    npc_state: Dict[str, Any],
) -> Dict[str, Any]:
    """Build evaluation context for condition/scoring evaluation."""
    return {
        "npc": npc,
        "world": world,
        "session": session,
        "flags": getattr(session, "flags", {}),
        "relationships": getattr(session, "relationships", {}),
        "world_time": getattr(world, "world_time", 0),
        "npc_state": npc_state,
    }


def _build_effect_context(
    npc: Any,
    session: Any,
    npc_state: Dict[str, Any],
    world_time: float,
) -> Dict[str, Any]:
    """Build context for effect application."""
    return {
        "npc": npc,
        "session": session,
        "flags": getattr(session, "flags", {}),
        "relationships": getattr(session, "relationships", {}),
        "npc_state": npc_state,
        "world_time": world_time,
    }
