"""
NPC Interaction Availability & Gating Logic

Phase 17.3: Pure functions to evaluate interaction availability based on:
- Relationship tiers/metrics
- Mood/emotions
- NPC behavior state (activities, simulation tier)
- Time of day
- Session flags (arcs, quests, events)
- Cooldowns

Design:
- Pure, testable functions (no DB dependencies in core logic)
- Integrates with existing relationship/mood/behavior systems
- Clear disabled reasons for debugging
- Supports both hard gating (not shown) and soft gating (shown but flagged)
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
import time

from pixsim7.backend.main.domain.game.npc_interactions import (
    NpcInteractionDefinition,
    NpcInteractionInstance,
    InteractionContext,
    RelationshipSnapshot,
    InteractionSurface,
    DisabledReason,
    InteractionGating,
    RelationshipGating,
    BehaviorGating,
    MoodGating,
    TimeOfDayConstraint,
)


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


def check_relationship_gating(
    gating: Optional[RelationshipGating],
    relationship: Optional[RelationshipSnapshot],
    world_tier_order: Optional[List[str]] = None
) -> Tuple[bool, Optional[str]]:
    """
    Check if relationship state passes gating requirements.

    Args:
        gating: Relationship gating config
        relationship: Current relationship state
        world_tier_order: Ordered list of tier IDs from world schema (lowest to highest)

    Returns:
        (passes, disabled_reason_message)
    """
    if not gating:
        return True, None

    if not relationship:
        # No relationship data available, fail if any gating is specified
        if gating.min_tier_id or gating.min_affinity or gating.min_trust or gating.min_chemistry:
            return False, "No relationship established"
        return True, None

    # Check tier gating
    if gating.min_tier_id and relationship.tier_id:
        if world_tier_order:
            try:
                current_idx = world_tier_order.index(relationship.tier_id)
                required_idx = world_tier_order.index(gating.min_tier_id)
                if current_idx < required_idx:
                    return False, f"Requires {gating.min_tier_id} relationship or higher"
            except ValueError:
                # Tier not found in order, skip check
                pass

    if gating.max_tier_id and relationship.tier_id:
        if world_tier_order:
            try:
                current_idx = world_tier_order.index(relationship.tier_id)
                max_idx = world_tier_order.index(gating.max_tier_id)
                if current_idx > max_idx:
                    return False, f"Only available up to {gating.max_tier_id} relationship"
            except ValueError:
                pass

    # Check metric minimums
    if gating.min_affinity is not None and relationship.affinity is not None:
        if relationship.affinity < gating.min_affinity:
            return False, f"Requires affinity {gating.min_affinity}+ (current: {relationship.affinity:.0f})"

    if gating.min_trust is not None and relationship.trust is not None:
        if relationship.trust < gating.min_trust:
            return False, f"Requires trust {gating.min_trust}+ (current: {relationship.trust:.0f})"

    if gating.min_chemistry is not None and relationship.chemistry is not None:
        if relationship.chemistry < gating.min_chemistry:
            return False, f"Requires chemistry {gating.min_chemistry}+ (current: {relationship.chemistry:.0f})"

    # Check tension maximum
    if gating.max_tension is not None and relationship.tension is not None:
        if relationship.tension > gating.max_tension:
            return False, f"Tension too high (max: {gating.max_tension}, current: {relationship.tension:.0f})"

    # Check intimacy level
    if gating.min_intimacy_level and relationship.intimacy_level_id:
        # Note: Would need world intimacy schema to compare levels
        # For now, just check exact match or presence
        # TODO: Integrate with world intimacy level ordering when available
        pass

    return True, None


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
    world_tier_order: Optional[List[str]] = None,
    current_time: Optional[int] = None
) -> Tuple[bool, Optional[DisabledReason], Optional[str]]:
    """
    Evaluate whether an interaction is currently available.

    Args:
        definition: Interaction definition to evaluate
        context: Interaction context with NPC/session state
        world_tier_order: Ordered list of relationship tier IDs
        current_time: Current time for cooldown checks. Should be world_time for gameplay consistency.
                     Falls back to real-time if not provided (for backward compatibility).

    Note:
        For gameplay consistency, always pass world_time as current_time.
        This ensures cooldowns use game time, not real-world time.

    Args (original docstring continues):
        definition: Interaction definition
        context: Current interaction context
        world_tier_order: Ordered list of relationship tier IDs
        current_time: Current unix timestamp (for cooldown checks)

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

    # Check relationship
    passes, msg = check_relationship_gating(
        gating.relationship,
        context.relationship_snapshot,
        world_tier_order
    )
    if not passes:
        # Determine if too low or too high
        if msg and "Only available up to" in msg:
            return False, DisabledReason.RELATIONSHIP_TOO_HIGH, msg
        return False, DisabledReason.RELATIONSHIP_TOO_LOW, msg

    # Check behavior state
    npc_state = context.session_flags.get("npcs", {}).get(f"npc:{context.location_id}", {}).get("state") if context.session_flags else None
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
