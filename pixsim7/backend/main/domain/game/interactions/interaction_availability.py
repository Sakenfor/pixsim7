"""
Interaction Availability & Gating Logic

Phase 17.3: Pure functions to evaluate interaction availability based on:
- Stat tiers/metrics
- Mood/emotions
- NPC behavior state (activities, simulation tier) for npc targets
- Time of day (with configurable fantasy time support)
- Session flags (arcs, quests, events)
- Cooldowns

Design:
- Pure, testable functions (no DB dependencies in core logic)
- Integrates with stat packages, mood, and behavior systems
- Clear disabled reasons for debugging
- Supports both hard gating (not shown) and soft gating (shown but flagged)
- Supports configurable world time (fantasy hours/days/periods)
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional, Tuple, Union
import time

from pixsim7.backend.main.domain.game.interactions.interactions import (
    InteractionDefinition,
    InteractionInstance,
    InteractionTarget,
    InteractionContext,
    DisabledReason,
    StatGating,
    StatAxisGate,
    BehaviorGating,
    MoodGating,
    TimeOfDayConstraint,
)
from pixsim7.backend.main.domain.game.stats import StatDefinition, StatEngine
from pixsim7.backend.main.domain.game.time import (
    WorldTimeConfig,
    DEFAULT_WORLD_TIME_CONFIG,
    parse_world_time as _parse_world_time,
    get_period_from_hour as _get_period_from_hour,
    period_matches_target,
    is_hour_in_period,
    get_time_constants,
)


# ===================
# Helper Functions
# ===================

def parse_world_time(
    seconds: int,
    time_config: Optional[WorldTimeConfig] = None,
) -> Dict[str, int]:
    """
    Parse world time seconds into components.
    0 = Monday/Firstday 00:00 (week starts at index 0)

    Args:
        seconds: World time in seconds
        time_config: Optional world time config. Uses DEFAULT_WORLD_TIME_CONFIG if None.

    Returns:
        Dict with dayOfWeek, hour, minute, second
    """
    components = _parse_world_time(seconds, time_config)
    return {
        "dayOfWeek": components.day_of_week,
        "hour": components.hour,
        "minute": components.minute,
        "second": components.second,
    }


def get_period_from_hour(
    hour: int,
    time_config: Optional[WorldTimeConfig] = None,
) -> str:
    """
    Get period name from hour.

    Args:
        hour: Hour of day (0 to hoursPerDay-1)
        time_config: Optional world time config. Uses DEFAULT_WORLD_TIME_CONFIG if None.

    Returns:
        Period ID or "unknown" if no matching period.
    """
    return _get_period_from_hour(hour, time_config)


def check_time_gating(
    constraint: Optional[TimeOfDayConstraint],
    world_time: int,
    time_config: Optional[WorldTimeConfig] = None,
) -> Tuple[bool, Optional[str]]:
    """
    Check if current world time passes time constraint.

    Supports:
    - Period names (with alias resolution for template portability)
    - Hour ranges (respects world's hoursPerDay)

    Args:
        constraint: Time of day constraint
        world_time: Current world time in seconds
        time_config: Optional world time config. Uses DEFAULT_WORLD_TIME_CONFIG if None.

    Returns:
        (passes, disabled_reason_message)
    """
    if not constraint:
        return True, None

    if time_config is None:
        time_config = DEFAULT_WORLD_TIME_CONFIG

    time_parts = parse_world_time(world_time, time_config)
    hour = time_parts["hour"]
    current_period = get_period_from_hour(hour, time_config)

    # Check periods (with alias support for template portability)
    if constraint.periods:
        # Check if current period matches any of the required periods
        # This uses alias resolution - "day" can match "morning", "afternoon", etc.
        matches_any = False
        for required_period in constraint.periods:
            if period_matches_target(current_period, required_period, time_config):
                matches_any = True
                break

        if not matches_any:
            allowed = ", ".join(constraint.periods)
            return False, f"Only available during: {allowed}"

    # Check hour ranges (respects world's hoursPerDay)
    if constraint.hour_ranges:
        in_range = False
        hours_per_day = time_config.hours_per_day

        for hr in constraint.hour_ranges:
            start = hr.get("start", 0)
            end = hr.get("end", hours_per_day)

            # Use is_hour_in_period which handles wrapping
            if is_hour_in_period(hour, start, end, hours_per_day):
                in_range = True
                break

        if not in_range:
            ranges_str = ", ".join([
                f"{r['start']:02d}:00-{r['end']:02d}:00"
                for r in constraint.hour_ranges
            ])
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
    definition: InteractionDefinition,
    context: InteractionContext,
    stat_definitions: Optional[Dict[str, Any]] = None,
    target: Optional[InteractionTarget] = None,
    current_time: Optional[int] = None,
    time_config: Optional[WorldTimeConfig] = None,
) -> Tuple[bool, Optional[DisabledReason], Optional[str]]:
    """
    Evaluate whether an interaction is currently available.

    Args:
        definition: Interaction definition to evaluate
        context: Interaction context with NPC/session state
        stat_definitions: World stat definitions (stats_config.definitions)
        target: Interaction target used for npc-scoped stat gating
        current_time: Current time for cooldown checks. Should be world_time for gameplay consistency.
                     Falls back to real-time if not provided (for backward compatibility).
        time_config: World time configuration for custom time systems (fantasy hours/days/periods).
                    Uses DEFAULT_WORLD_TIME_CONFIG if not provided.

    Note:
        For gameplay consistency, always pass world_time as current_time.
        This ensures cooldowns use game time, not real-world time.

        For fantasy worlds with custom time systems, pass the world's time_config
        to enable proper period matching and alias resolution.

    Returns:
        (available, disabled_reason_enum, disabled_message)
    """
    gating = definition.gating
    if not gating:
        return True, None, None

    # Check time of day (with configurable time system support)
    if context.world_time is not None:
        passes, msg = check_time_gating(gating.time_of_day, context.world_time, time_config)
        if not passes:
            return False, DisabledReason.TIME_INCOMPATIBLE, msg

    target_kind = target.kind if target else None
    target_id = target.id if target else None
    npc_id = target_id if target_kind == "npc" else None

    # Check stat-based gating
    passes, msg, _ = check_stat_gating(
        gating.stat_gating,
        context.stats_snapshot,
        stat_definitions,
        npc_id,
    )
    if not passes:
        return False, DisabledReason.STAT_GATING_FAILED, msg

    # Check behavior state (npc-only for now)
    if gating.behavior:
        if target_kind != "npc":
            return False, DisabledReason.NPC_UNAVAILABLE, "Target kind not supported for behavior gating"
        npc_state = None
        if context.session_flags and npc_id is not None:
            npc_state = context.session_flags.get("npcs", {}).get(f"npc:{npc_id}", {}).get("state")
        passes, msg = check_behavior_gating(gating.behavior, npc_state)
        if not passes:
            if msg and "busy" in msg.lower():
                return False, DisabledReason.NPC_BUSY, msg
            return False, DisabledReason.NPC_UNAVAILABLE, msg

    # Check mood (npc-only for now)
    if gating.mood:
        if target_kind != "npc":
            return False, DisabledReason.MOOD_INCOMPATIBLE, "Target kind not supported for mood gating"
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
    definition: InteractionDefinition,
    target: InteractionTarget,
    world_id: int,
    session_id: int,
    context: InteractionContext,
    available: bool,
    disabled_reason: Optional[DisabledReason] = None,
    disabled_message: Optional[str] = None,
    instance_id: Optional[str] = None
) -> InteractionInstance:
    """
    Create an interaction instance from a definition and availability result.

    Args:
        definition: Interaction definition
        target: Target reference
        world_id: World ID
        session_id: Session ID
        context: Interaction context
        available: Whether interaction is available
        disabled_reason: Reason code if disabled
        disabled_message: Human-readable message if disabled
        instance_id: Optional custom instance ID

    Returns:
        InteractionInstance
    """
    if instance_id is None:
        target_id = target.id if target else "unknown"
        instance_id = f"{definition.id}:{target.kind}:{target_id}:{session_id}:{int(time.time())}"

    return InteractionInstance(
        id=instance_id,
        definitionId=definition.id,
        target=target,
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
    definitions: List[InteractionDefinition],
    target_kind: str,
    target_id: Union[int, str],
    target_roles: Optional[List[str]] = None
) -> List[InteractionDefinition]:
    """
    Filter interaction definitions by target NPC ID or roles.

    Args:
        definitions: All interaction definitions
        target_kind: Target kind (e.g., "npc")
        target_id: Target ID
        target_roles: Target roles (e.g., ["role:shopkeeper", "role:guard"])

    Returns:
        Filtered list of applicable definitions
    """
    filtered = []
    target_ref = f"{target_kind}:{target_id}"

    for defn in definitions:
        has_roles_or_ids = bool(defn.target_roles_or_ids)
        has_target_ids = bool(defn.target_ids)

        # No target filter = applies to all NPCs
        if not has_roles_or_ids and not has_target_ids:
            filtered.append(defn)
            continue

        # Check if NPC ID matches
        if has_roles_or_ids and target_ref in defn.target_roles_or_ids:
            filtered.append(defn)
            continue

        # Check explicit target IDs
        if has_target_ids and target_id in defn.target_ids:
            filtered.append(defn)
            continue

        # Check if any role matches
        if target_roles and has_roles_or_ids:
            if any(role in defn.target_roles_or_ids for role in target_roles):
                filtered.append(defn)
                continue

    return filtered
