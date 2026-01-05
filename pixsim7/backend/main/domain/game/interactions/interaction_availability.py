"""
NPC Interaction Availability & Gating Logic

Phase 17.3: Pure functions to evaluate interaction availability based on:
- Stat tiers/metrics
- Mood/emotions
- NPC behavior state (activities, simulation tier)
- Time of day
- Session flags (arcs, quests, events)
- Cooldowns

Design:
- Pure, testable functions (no DB dependencies in core logic)
- Integrates with stat packages, mood, and behavior systems
- Clear disabled reasons for debugging
- Supports both hard gating (not shown) and soft gating (shown but flagged)
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional, Tuple
import time

from pixsim7.backend.main.domain.game.interactions.npc_interactions import (
    NpcInteractionDefinition,
    NpcInteractionInstance,
    InteractionContext,
    DisabledReason,
    StatGating,
    StatAxisGate,
    BehaviorGating,
    MoodGating,
    TimeOfDayConstraint,
)
from pixsim7.backend.main.domain.game.stats import StatDefinition, StatEngine


# ===================
# Helper Functions
# ===================

def parse_world_time(seconds: int) -> Dict[str, int]:
    """
    Parse world time seconds into components.
    0 = Monday 00:00 (week starts Monday)
    """
    SECONDS_PER_HOUR = 3600
    SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR
    SECONDS_PER_WEEK = 7 * SECONDS_PER_DAY

    # Normalize to week cycle
    week_seconds = seconds % SECONDS_PER_WEEK

    day_of_week = week_seconds // SECONDS_PER_DAY  # 0-6 (Mon-Sun)
    day_seconds = week_seconds % SECONDS_PER_DAY
    hour = day_seconds // SECONDS_PER_HOUR  # 0-23
    minute_seconds = day_seconds % SECONDS_PER_HOUR
    minute = minute_seconds // 60
    second = minute_seconds % 60

    return {
        "dayOfWeek": day_of_week,
        "hour": hour,
        "minute": minute,
        "second": second,
    }


def get_period_from_hour(hour: int) -> str:
    """Get period name from hour (0-23)"""
    if 5 <= hour < 12:
        return "morning"
    elif 12 <= hour < 17:
        return "afternoon"
    elif 17 <= hour < 21:
        return "evening"
    else:
        return "night"


def check_time_gating(
    constraint: Optional[TimeOfDayConstraint],
    world_time: int
) -> Tuple[bool, Optional[str]]:
    """
    Check if current world time passes time constraint.

    Returns:
        (passes, disabled_reason_message)
    """
    if not constraint:
        return True, None

    time_parts = parse_world_time(world_time)
    hour = time_parts["hour"]

    # Check periods
    if constraint.periods:
        current_period = get_period_from_hour(hour)
        if current_period not in constraint.periods:
            allowed = ", ".join(constraint.periods)
            return False, f"Only available during: {allowed}"

    # Check hour ranges
    if constraint.hour_ranges:
        in_range = False
        for hr in constraint.hour_ranges:
            start = hr.get("start", 0)
            end = hr.get("end", 24)
            if start <= hour < end:
                in_range = True
                break

        if not in_range:
            ranges_str = ", ".join([f"{r['start']:02d}:00-{r['end']:02d}:00" for r in constraint.hour_ranges])
            return False, f"Only available during: {ranges_str}"

    return True, None


def _get_stat_definition(
    definition_id: str,
    stat_definitions: Optional[Dict[str, Any]],
) -> Optional[StatDefinition]:
    if not stat_definitions or definition_id not in stat_definitions:
        return None
    try:
        return StatDefinition.model_validate(stat_definitions[definition_id])
    except Exception:
        return None


def _get_entity_key(entity_type: str, npc_id: Optional[int]) -> Optional[str]:
    if entity_type == "npc":
        if npc_id is None:
            return None
        return f"npc:{npc_id}"
    if entity_type == "session":
        return "session"
    if entity_type == "world":
        return "world"
    return None


def _get_entity_stats(
    stats_snapshot: Optional[Dict[str, Dict[str, Any]]],
    definition_id: str,
    entity_type: str,
    npc_id: Optional[int],
) -> Optional[Dict[str, Any]]:
    if not stats_snapshot:
        return None

    definition_stats = stats_snapshot.get(definition_id)
    if not isinstance(definition_stats, dict):
        return None

    entity_key = _get_entity_key(entity_type, npc_id)
    if not entity_key:
        return None

    return definition_stats.get(entity_key)


def _get_tier_order(definition: Optional[StatDefinition], axis: Optional[str]) -> Optional[List[str]]:
    if not definition or not axis:
        return None
    tiers = [tier for tier in definition.tiers if tier.axis_name == axis]
    if not tiers:
        return None
    sorted_tiers = sorted(tiers, key=lambda tier: tier.min)
    return [tier.id for tier in sorted_tiers]


def _get_level_order(definition: Optional[StatDefinition]) -> Optional[List[str]]:
    if not definition or not definition.levels:
        return None
    sorted_levels = sorted(definition.levels, key=lambda level: level.priority)
    return [level.id for level in sorted_levels]


def _resolve_current_tier(
    entity_stats: Dict[str, Any],
    axis: Optional[str],
    definition: Optional[StatDefinition],
) -> Optional[str]:
    if not axis:
        return None
    tier_key = f"{axis}TierId"
    if tier_key in entity_stats:
        return entity_stats.get(tier_key)
    if "tierId" in entity_stats:
        return entity_stats.get("tierId")
    if not definition:
        return None
    value = entity_stats.get(axis)
    if not isinstance(value, (int, float)):
        return None
    return StatEngine.compute_tier(axis, float(value), definition.tiers)


def _resolve_current_level(
    entity_stats: Dict[str, Any],
    definition: Optional[StatDefinition],
) -> Optional[str]:
    if "levelId" in entity_stats:
        return entity_stats.get("levelId")
    if not definition:
        return None
    axis_names = {axis.name for axis in definition.axes}
    stat_values = {
        name: value
        for name, value in entity_stats.items()
        if name in axis_names and isinstance(value, (int, float))
    }
    return StatEngine.compute_level(stat_values, definition.levels)


def _check_stat_gate(
    gate: StatAxisGate,
    stats_snapshot: Optional[Dict[str, Dict[str, Any]]],
    stat_definitions: Optional[Dict[str, Any]],
    npc_id: Optional[int],
) -> Tuple[bool, Optional[str]]:
    entity_stats = _get_entity_stats(
        stats_snapshot,
        gate.definition_id,
        gate.entity_type,
        gate.npc_id or npc_id,
    )

    if not entity_stats:
        return False, f"No {gate.definition_id} stats available"

    definition = _get_stat_definition(gate.definition_id, stat_definitions)

    if gate.axis:
        value = entity_stats.get(gate.axis)
        if value is None:
            return False, f"Missing {gate.axis} for {gate.definition_id}"
        try:
            numeric_value = float(value)
        except (TypeError, ValueError):
            return False, f"Invalid {gate.axis} value"

        if gate.min_value is not None and numeric_value < gate.min_value:
            return False, f"Requires {gate.axis} {gate.min_value}+ (current: {numeric_value:.0f})"
        if gate.max_value is not None and numeric_value > gate.max_value:
            return False, f"{gate.axis} too high (max: {gate.max_value}, current: {numeric_value:.0f})"

    if gate.min_tier_id or gate.max_tier_id:
        tier_id = _resolve_current_tier(entity_stats, gate.axis, definition)
        if not tier_id:
            return False, f"Missing tier for {gate.definition_id}"

        tier_order = _get_tier_order(definition, gate.axis)
        if tier_order:
            try:
                current_idx = tier_order.index(tier_id)
                if gate.min_tier_id:
                    required_idx = tier_order.index(gate.min_tier_id)
                    if current_idx < required_idx:
                        return False, f"Requires {gate.min_tier_id} tier or higher"
                if gate.max_tier_id:
                    max_idx = tier_order.index(gate.max_tier_id)
                    if current_idx > max_idx:
                        return False, f"Only available up to {gate.max_tier_id} tier"
            except ValueError:
                return False, f"Tier {tier_id} not found in definition"
        else:
            if gate.min_tier_id and tier_id != gate.min_tier_id:
                return False, f"Requires {gate.min_tier_id} tier"
            if gate.max_tier_id and tier_id != gate.max_tier_id:
                return False, f"Only available up to {gate.max_tier_id} tier"

    if gate.min_level_id:
        level_id = _resolve_current_level(entity_stats, definition)
        if not level_id:
            return False, f"Missing level for {gate.definition_id}"

        level_order = _get_level_order(definition)
        if level_order:
            try:
                current_idx = level_order.index(level_id)
                required_idx = level_order.index(gate.min_level_id)
                if current_idx < required_idx:
                    return False, f"Requires {gate.min_level_id} level or higher"
            except ValueError:
                return False, f"Level {level_id} not found in definition"
        else:
            if level_id != gate.min_level_id:
                return False, f"Requires {gate.min_level_id} level"

    return True, None


def check_stat_gating(
    gating: Optional[StatGating],
    stats_snapshot: Optional[Dict[str, Dict[str, Any]]],
    stat_definitions: Optional[Dict[str, Any]],
    npc_id: Optional[int],
) -> Tuple[bool, Optional[str], Optional[StatAxisGate]]:
    if not gating:
        return True, None, None

    if gating.all_of:
        for gate in gating.all_of:
            passes, msg = _check_stat_gate(gate, stats_snapshot, stat_definitions, npc_id)
            if not passes:
                return False, msg, gate

    if gating.any_of:
        any_pass = False
        last_msg = None
        for gate in gating.any_of:
            passes, msg = _check_stat_gate(gate, stats_snapshot, stat_definitions, npc_id)
            if passes:
                any_pass = True
                break
            last_msg = msg
        if not any_pass:
            return False, last_msg or "No stat gate satisfied", gating.any_of[0]

    return True, None, None


def check_behavior_gating(
    gating: Optional[BehaviorGating],
    npc_state: Optional[Dict[str, Any]]
) -> Tuple[bool, Optional[str]]:
    """
    Check if NPC behavior state passes gating requirements.

    Args:
        gating: Behavior gating config
        npc_state: NPC state from GameSession.flags.npcs["npc:<id>"].state

    Returns:
        (passes, disabled_reason_message)
    """
    if not gating:
        return True, None

    if not npc_state:
        # No behavior state available
        if gating.allowed_states or gating.allowed_activities:
            return False, "NPC state unavailable"
        return True, None

    # Check state tags
    current_state = npc_state.get("currentState") or npc_state.get("state")

    if gating.allowed_states:
        if not current_state or current_state not in gating.allowed_states:
            allowed = ", ".join(gating.allowed_states)
            return False, f"NPC must be in state: {allowed}"

    if gating.forbidden_states:
        if current_state and current_state in gating.forbidden_states:
            return False, f"NPC is {current_state} (unavailable)"

    # Check activity
    current_activity = npc_state.get("currentActivity") or npc_state.get("activity")

    if gating.allowed_activities:
        if not current_activity or current_activity not in gating.allowed_activities:
            allowed = ", ".join(gating.allowed_activities)
            return False, f"NPC must be doing: {allowed}"

    if gating.forbidden_activities:
        if current_activity and current_activity in gating.forbidden_activities:
            return False, f"NPC is busy ({current_activity})"

    # Check simulation tier
    if gating.min_simulation_tier:
        tier_order = ["dormant", "ambient", "active", "detailed"]
        current_tier = npc_state.get("simulationTier", "ambient")

        try:
            current_idx = tier_order.index(current_tier)
            required_idx = tier_order.index(gating.min_simulation_tier)
            if current_idx < required_idx:
                return False, f"NPC simulation tier too low (need {gating.min_simulation_tier})"
        except ValueError:
            pass

    return True, None


def check_mood_gating(
    gating: Optional[MoodGating],
    mood_tags: Optional[List[str]],
    emotion_intensities: Optional[Dict[str, float]] = None
) -> Tuple[bool, Optional[str]]:
    """
    Check if mood/emotion state passes gating requirements.

    Args:
        gating: Mood gating config
        mood_tags: Current mood tags
        emotion_intensities: Current emotion intensities (emotion -> 0-1)

    Returns:
        (passes, disabled_reason_message)
    """
    if not gating:
        return True, None

    # Check mood tags
    if gating.allowed_moods and mood_tags:
        if not any(tag in gating.allowed_moods for tag in mood_tags):
            allowed = ", ".join(gating.allowed_moods)
            return False, f"Incompatible mood (need: {allowed})"

    if gating.forbidden_moods and mood_tags:
        forbidden_present = [tag for tag in mood_tags if tag in gating.forbidden_moods]
        if forbidden_present:
            return False, f"Mood incompatible: {forbidden_present[0]}"

    # Check emotion intensity
    if gating.max_emotion_intensity is not None and emotion_intensities:
        for emotion, intensity in emotion_intensities.items():
            if intensity > gating.max_emotion_intensity:
                return False, f"Too {emotion} (intensity: {intensity:.1%})"

    return True, None


def check_flag_gating(
    required_flags: Optional[List[str]],
    forbidden_flags: Optional[List[str]],
    session_flags: Optional[Dict[str, Any]]
) -> Tuple[bool, Optional[str]]:
    """
    Check if session flags pass gating requirements.

    Flag format: "arc:romance_alex.completed", "quest:find_sword.active", "event:festival"

    Returns:
        (passes, disabled_reason_message)
    """
    if not session_flags:
        if required_flags:
            return False, f"Requires: {required_flags[0]}"
        return True, None

    # Check required flags
    if required_flags:
        for flag_path in required_flags:
            if not check_flag_exists(flag_path, session_flags):
                return False, f"Requires: {flag_path}"

    # Check forbidden flags
    if forbidden_flags:
        for flag_path in forbidden_flags:
            if check_flag_exists(flag_path, session_flags):
                return False, f"Already completed: {flag_path}"

    return True, None


def check_flag_exists(flag_path: str, session_flags: Dict[str, Any]) -> bool:
    """
    Check if a flag path exists in session flags.

    Examples:
        "arc:romance_alex.completed" -> session_flags["arcs"]["arc:romance_alex"]["completed"]
        "quest:find_sword" -> session_flags["quests"]["quest:find_sword"] (exists)
        "event:festival.active" -> session_flags["events"]["event:festival"]["active"]
    """
    parts = flag_path.split(".")
    base = parts[0]

    # Determine category
    if base.startswith("arc:"):
        category = "arcs"
    elif base.startswith("quest:"):
        category = "quests"
    elif base.startswith("event:"):
        category = "events"
    else:
        # Direct flag lookup
        return session_flags.get(base) is not None

    # Navigate path
    obj = session_flags.get(category, {}).get(base)
    if obj is None:
        return False

    # Check nested properties
    for part in parts[1:]:
        if isinstance(obj, dict):
            obj = obj.get(part)
            if obj is None:
                return False
        else:
            return False

    # If we got here, path exists and final value is truthy
    return bool(obj)


def check_cooldown(
    cooldown_seconds: Optional[int],
    last_used_at: Optional[int],
    current_time: Optional[int] = None
) -> Tuple[bool, Optional[str]]:
    """
    Check if cooldown has expired.

    Args:
        cooldown_seconds: Cooldown duration in seconds
        last_used_at: Timestamp when interaction was last used (world_time or unix timestamp)
        current_time: Current time for comparison. Should be world_time for gameplay consistency.
                     Falls back to real-time if not provided (for backward compatibility).

    Returns:
        (passes, disabled_reason_message)

    Note:
        For gameplay consistency, always pass world_time as current_time.
        Real-time fallback is for backward compatibility only.
    """
    if cooldown_seconds is None or cooldown_seconds <= 0:
        return True, None

    if last_used_at is None:
        return True, None

    if current_time is None:
        current_time = int(time.time())

    elapsed = current_time - last_used_at
    if elapsed < cooldown_seconds:
        remaining = cooldown_seconds - elapsed
        hours = remaining // 3600
        minutes = (remaining % 3600) // 60
        if hours > 0:
            return False, f"Cooldown: {hours}h {minutes}m remaining"
        else:
            return False, f"Cooldown: {minutes}m remaining"

    return True, None


# ===================
# Main Gating Logic
# ===================

def evaluate_interaction_availability(
    definition: NpcInteractionDefinition,
    context: InteractionContext,
    stat_definitions: Optional[Dict[str, Any]] = None,
    npc_id: Optional[int] = None,
    current_time: Optional[int] = None,
) -> Tuple[bool, Optional[DisabledReason], Optional[str]]:
    """
    Evaluate whether an interaction is currently available.

    Args:
        definition: Interaction definition to evaluate
        context: Interaction context with NPC/session state
        stat_definitions: World stat definitions (stats_config.definitions)
        npc_id: NPC ID used for npc-scoped stat gating
        current_time: Current time for cooldown checks. Should be world_time for gameplay consistency.
                     Falls back to real-time if not provided (for backward compatibility).

    Note:
        For gameplay consistency, always pass world_time as current_time.
        This ensures cooldowns use game time, not real-world time.

    Returns:
        (available, disabled_reason_enum, disabled_message)
    """
    gating = definition.gating
    if not gating:
        return True, None, None

    # Check time of day
    if context.world_time is not None:
        passes, msg = check_time_gating(gating.time_of_day, context.world_time)
        if not passes:
            return False, DisabledReason.TIME_INCOMPATIBLE, msg

    # Check stat-based gating
    passes, msg, _ = check_stat_gating(
        gating.stat_gating,
        context.stats_snapshot,
        stat_definitions,
        npc_id,
    )
    if not passes:
        return False, DisabledReason.STAT_GATING_FAILED, msg

    # Check behavior state
    npc_state = None
    if context.session_flags and npc_id is not None:
        npc_state = context.session_flags.get("npcs", {}).get(f"npc:{npc_id}", {}).get("state")
    passes, msg = check_behavior_gating(gating.behavior, npc_state)
    if not passes:
        if msg and "busy" in msg.lower():
            return False, DisabledReason.NPC_BUSY, msg
        return False, DisabledReason.NPC_UNAVAILABLE, msg

    # Check mood
    passes, msg = check_mood_gating(
        gating.mood,
        context.mood_tags,
        # TODO: Get emotion intensities from context
        None
    )
    if not passes:
        return False, DisabledReason.MOOD_INCOMPATIBLE, msg

    # Check flags
    passes, msg = check_flag_gating(
        gating.required_flags,
        gating.forbidden_flags,
        context.session_flags
    )
    if not passes:
        if gating.forbidden_flags and msg and "Already" in msg:
            return False, DisabledReason.FLAG_FORBIDDEN, msg
        return False, DisabledReason.FLAG_REQUIRED, msg

    # Check cooldown
    last_used = context.last_used_at.get(definition.id) if context.last_used_at else None
    passes, msg = check_cooldown(gating.cooldown_seconds, last_used, current_time)
    if not passes:
        return False, DisabledReason.COOLDOWN_ACTIVE, msg

    # All checks passed
    return True, None, None


def create_interaction_instance(
    definition: NpcInteractionDefinition,
    npc_id: int,
    world_id: int,
    session_id: int,
    context: InteractionContext,
    available: bool,
    disabled_reason: Optional[DisabledReason] = None,
    disabled_message: Optional[str] = None,
    instance_id: Optional[str] = None
) -> NpcInteractionInstance:
    """
    Create an interaction instance from a definition and availability result.

    Args:
        definition: Interaction definition
        npc_id: Target NPC ID
        world_id: World ID
        session_id: Session ID
        context: Interaction context
        available: Whether interaction is available
        disabled_reason: Reason code if disabled
        disabled_message: Human-readable message if disabled
        instance_id: Optional custom instance ID

    Returns:
        NpcInteractionInstance
    """
    if instance_id is None:
        instance_id = f"{definition.id}:{npc_id}:{session_id}:{int(time.time())}"

    return NpcInteractionInstance(
        id=instance_id,
        definitionId=definition.id,
        npcId=npc_id,
        worldId=world_id,
        sessionId=session_id,
        surface=definition.surface,
        label=definition.label,
        icon=definition.icon,
        available=available,
        disabledReason=disabled_reason,
        disabledMessage=disabled_message,
        context=context,
        priority=definition.priority or 0
    )


def filter_interactions_by_target(
    definitions: List[NpcInteractionDefinition],
    npc_id: int,
    npc_roles: Optional[List[str]] = None
) -> List[NpcInteractionDefinition]:
    """
    Filter interaction definitions by target NPC ID or roles.

    Args:
        definitions: All interaction definitions
        npc_id: Target NPC ID
        npc_roles: NPC's roles (e.g., ["role:shopkeeper", "role:guard"])

    Returns:
        Filtered list of applicable definitions
    """
    filtered = []
    npc_id_str = f"npc:{npc_id}"

    for defn in definitions:
        # No target filter = applies to all NPCs
        if not defn.target_roles_or_ids:
            filtered.append(defn)
            continue

        # Check if NPC ID matches
        if npc_id_str in defn.target_roles_or_ids:
            filtered.append(defn)
            continue

        # Check if any role matches
        if npc_roles:
            if any(role in defn.target_roles_or_ids for role in npc_roles):
                filtered.append(defn)
                continue

    return filtered
