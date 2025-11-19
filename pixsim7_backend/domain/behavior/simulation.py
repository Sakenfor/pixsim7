"""
Game-Agnostic NPC Simulation Prioritization

Handles:
- Determining which NPCs to simulate at which detail level
- Tier assignment based on configurable priority rules
- Tick frequency management

Works for any game type (2D, 3D, text, visual novel, etc.)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import logging

from .conditions import evaluate_condition

logger = logging.getLogger(__name__)


def get_default_simulation_config() -> Dict[str, Any]:
    """
    Get default simulation configuration.

    This is a sensible default for most game types.
    Worlds can override this in GameWorld.meta.behavior.simulationConfig
    """
    return {
        "version": 1,
        "tiers": [
            {
                "id": "high_priority",
                "tickFrequencySeconds": 1,
                "detailLevel": "full",
            },
            {
                "id": "medium_priority",
                "tickFrequencySeconds": 60,
                "detailLevel": "simplified",
            },
            {
                "id": "background",
                "tickFrequencySeconds": 3600,
                "detailLevel": "schedule_only",
            },
        ],
        "priorityRules": [
            # High priority: NPCs in active scenes
            {
                "condition": {
                    "type": "flag_exists",
                    "key": "current_scene_npcs",
                },
                "tier": "high_priority",
                "priority": 100,
            },
        ],
        "defaultTier": "background",
        "maxNpcsPerTick": 50,
    }


def determine_simulation_tier(
    npc: Any,
    world: Any,
    session: Any,
    simulation_config: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Determine which simulation tier an NPC belongs to based on priority rules.

    Args:
        npc: The NPC to evaluate
        world: The world
        session: The game session
        simulation_config: Simulation config (uses default if None)

    Returns:
        Tier ID string (e.g., "high_priority", "background")
    """
    if simulation_config is None:
        simulation_config = get_default_simulation_config()

    priority_rules = simulation_config.get("priorityRules", [])
    default_tier = simulation_config.get("defaultTier", "background")

    # Build context for condition evaluation
    context = _build_simulation_context(npc, world, session)

    # Evaluate priority rules (highest priority wins)
    matched_tier = None
    highest_priority = -1

    for rule in priority_rules:
        condition = rule.get("condition")
        tier = rule.get("tier")
        priority = rule.get("priority", 0)

        if not condition or not tier:
            continue

        # Evaluate condition
        if evaluate_condition(condition, context):
            if priority > highest_priority:
                highest_priority = priority
                matched_tier = tier

    # Return matched tier or default
    return matched_tier or default_tier


def should_tick_npc(
    npc: Any,
    npc_state: Dict[str, Any],
    tier_config: Dict[str, Any],
    world_time: float,
) -> bool:
    """
    Determine if an NPC should be ticked based on tier config and last tick time.

    Args:
        npc: The NPC
        npc_state: NPC session state
        tier_config: Tier configuration dict
        world_time: Current world time in seconds

    Returns:
        True if NPC should be ticked, False otherwise
    """
    tick_frequency = tier_config.get("tickFrequencySeconds", 1)

    # Get last tick time
    next_tick_at = npc_state.get("next_tick_at", 0)

    # Check if it's time to tick
    return world_time >= next_tick_at


def update_next_tick_time(
    npc_state: Dict[str, Any],
    tier_config: Dict[str, Any],
    world_time: float,
) -> None:
    """
    Update the next tick time for an NPC based on tier config.

    Args:
        npc_state: NPC session state (modified in place)
        tier_config: Tier configuration dict
        world_time: Current world time in seconds
    """
    tick_frequency = tier_config.get("tickFrequencySeconds", 1)
    npc_state["next_tick_at"] = world_time + tick_frequency


def get_npcs_to_simulate(
    npcs: List[Any],
    world: Any,
    session: Any,
    world_time: float,
    simulation_config: Optional[Dict[str, Any]] = None,
) -> Dict[str, List[Any]]:
    """
    Get NPCs to simulate grouped by tier.

    Args:
        npcs: List of all NPCs in the world
        world: The world
        session: The game session
        world_time: Current world time
        simulation_config: Simulation config (uses default if None)

    Returns:
        Dict mapping tier ID to list of NPCs to simulate
    """
    if simulation_config is None:
        simulation_config = get_default_simulation_config()

    max_npcs_per_tick = simulation_config.get("maxNpcsPerTick")

    # Build tier configs map
    tier_configs = {
        tier["id"]: tier
        for tier in simulation_config.get("tiers", [])
    }

    # Group NPCs by tier and check if they should tick
    npcs_by_tier: Dict[str, List[Any]] = {}
    total_npcs = 0

    for npc in npcs:
        # Check max NPC limit
        if max_npcs_per_tick and total_npcs >= max_npcs_per_tick:
            break

        # Determine tier
        tier_id = determine_simulation_tier(npc, world, session, simulation_config)
        tier_config = tier_configs.get(tier_id)

        if not tier_config:
            logger.warning(f"Unknown tier '{tier_id}' for NPC {npc.id}, using default")
            tier_id = simulation_config.get("defaultTier", "background")
            tier_config = tier_configs.get(tier_id)

        if not tier_config:
            continue

        # Get NPC state
        npc_state = _get_npc_state(session, npc)

        # Check if should tick
        if should_tick_npc(npc, npc_state, tier_config, world_time):
            if tier_id not in npcs_by_tier:
                npcs_by_tier[tier_id] = []

            npcs_by_tier[tier_id].append(npc)
            total_npcs += 1

            # Update next tick time
            update_next_tick_time(npc_state, tier_config, world_time)

    return npcs_by_tier


def _build_simulation_context(npc: Any, world: Any, session: Any) -> Dict[str, Any]:
    """
    Build context dict for simulation condition evaluation.

    Args:
        npc: The NPC
        world: The world
        session: The game session

    Returns:
        Context dict
    """
    npc_id = f"npc:{npc.id}"
    npc_state = _get_npc_state(session, npc)

    return {
        "npc": npc,
        "world": world,
        "session": session,
        "flags": getattr(session, "flags", {}),
        "relationships": getattr(session, "relationships", {}),
        "world_time": getattr(world, "world_time", 0),
        "npc_state": npc_state,
    }


def _get_npc_state(session: Any, npc: Any) -> Dict[str, Any]:
    """
    Get NPC session state from session.flags.npcs[npc_id].state

    Args:
        session: The game session
        npc: The NPC

    Returns:
        NPC state dict (empty if not found)
    """
    flags = getattr(session, "flags", {})
    npcs_data = flags.get("npcs", {})
    npc_id = f"npc:{npc.id}"
    npc_data = npcs_data.get(npc_id, {})
    return npc_data.get("state", {})


def _set_npc_state(session: Any, npc: Any, state: Dict[str, Any]) -> None:
    """
    Set NPC session state in session.flags.npcs[npc_id].state

    Args:
        session: The game session
        npc: The NPC
        state: NPC state dict to set
    """
    flags = getattr(session, "flags", {})

    if "npcs" not in flags:
        flags["npcs"] = {}

    npc_id = f"npc:{npc.id}"

    if npc_id not in flags["npcs"]:
        flags["npcs"][npc_id] = {}

    flags["npcs"][npc_id]["state"] = state


# ==================
# Example Priority Rule Helpers
# ==================


def create_distance_rule(max_distance: float, tier: str, priority: float) -> Dict[str, Any]:
    """
    Create a distance-based priority rule (for 3D games with spatial coords).

    Args:
        max_distance: Maximum distance from player in world units
        tier: Tier to assign
        priority: Rule priority

    Returns:
        Priority rule dict
    """
    return {
        "condition": {
            "type": "custom",
            "evaluatorId": "evaluator:distance_from_player",
            "params": {"maxDistance": max_distance},
        },
        "tier": tier,
        "priority": priority,
    }


def create_location_rule(location_id: str, tier: str, priority: float) -> Dict[str, Any]:
    """
    Create a location-based priority rule (for 2D/location-based games).

    Args:
        location_id: Location ID to check
        tier: Tier to assign
        priority: Rule priority

    Returns:
        Priority rule dict
    """
    return {
        "condition": {
            "type": "flag_equals",
            "key": "player.current_location",
            "value": location_id,
        },
        "tier": tier,
        "priority": priority,
    }


def create_scene_rule(tier: str = "high_priority", priority: float = 100) -> Dict[str, Any]:
    """
    Create a scene participation rule (for visual novels/text games).

    NPCs in the current scene are high priority.

    Args:
        tier: Tier to assign (default: high_priority)
        priority: Rule priority (default: 100)

    Returns:
        Priority rule dict
    """
    return {
        "condition": {
            "type": "flag_exists",
            "key": "current_scene_npcs",
        },
        "tier": tier,
        "priority": priority,
    }


def create_quest_rule(tier: str = "high_priority", priority: float = 90) -> Dict[str, Any]:
    """
    Create a quest involvement rule.

    NPCs involved in active quests are prioritized.

    Args:
        tier: Tier to assign (default: high_priority)
        priority: Rule priority (default: 90)

    Returns:
        Priority rule dict
    """
    return {
        "condition": {
            "type": "custom",
            "evaluatorId": "evaluator:in_active_quest",
            "params": {},
        },
        "tier": tier,
        "priority": priority,
    }
