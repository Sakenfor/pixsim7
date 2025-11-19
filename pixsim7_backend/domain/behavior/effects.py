"""
Effect Handler System for NPC Behavior

Handles application of activity effects:
- Core effects (energy, mood, relationships, flags)
- Custom extensible effects

Integrates with existing relationship and mood systems.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

import logging

logger = logging.getLogger(__name__)


# Type alias for effect handler functions
EffectHandler = Callable[[Dict[str, Any], Dict[str, Any]], None]


# Global registry of custom effect handlers
EFFECT_HANDLERS: Dict[str, EffectHandler] = {}


def register_effect_handler(effect_type: str, handler: EffectHandler) -> None:
    """
    Register a custom effect handler.

    Args:
        effect_type: Effect type ID (e.g., "effect:give_item")
        handler: Function that takes (params, context) and applies the effect
    """
    EFFECT_HANDLERS[effect_type] = handler
    logger.info(f"Registered custom effect handler: {effect_type}")


def apply_activity_effects(
    effects: Dict[str, Any],
    context: Dict[str, Any],
    delta_seconds: float = 0
) -> None:
    """
    Apply all effects from an activity.

    Args:
        effects: ActivityEffects dict from Activity schema
        context: Effect application context containing:
            - npc: The NPC performing the activity
            - world: The world
            - session: The game session
            - flags: Session flags (writable)
            - relationships: Session relationships (writable)
            - npc_state: NPC session state (writable)
            - delta_seconds: Time elapsed since activity started
    """
    if not effects:
        return

    try:
        # Apply core effects
        _apply_energy_delta(effects, context, delta_seconds)
        _apply_mood_impact(effects, context)
        _apply_relationship_changes(effects, context)
        _apply_flags(effects, context)

        # Apply custom effects
        custom_effects = effects.get("customEffects", [])
        for custom_effect in custom_effects:
            apply_custom_effect(custom_effect, context)

    except Exception as e:
        logger.error(f"Error applying activity effects: {e}", exc_info=True)


def apply_custom_effect(effect: Dict[str, Any], context: Dict[str, Any]) -> None:
    """
    Apply a single custom effect.

    Args:
        effect: CustomEffect dict with 'type' and 'params'
        context: Effect application context
    """
    effect_type = effect.get("type")
    params = effect.get("params", {})

    if not effect_type:
        logger.warning("Custom effect missing 'type' field")
        return

    handler = EFFECT_HANDLERS.get(effect_type)
    if not handler:
        logger.warning(f"Custom effect handler not found: {effect_type}")
        return

    try:
        handler(params, context)
    except Exception as e:
        logger.error(f"Error applying custom effect {effect_type}: {e}", exc_info=True)


# ==================
# Core Effect Handlers
# ==================


def _apply_energy_delta(
    effects: Dict[str, Any],
    context: Dict[str, Any],
    delta_seconds: float
) -> None:
    """Apply energy delta based on time elapsed."""
    energy_delta_per_hour = effects.get("energyDeltaPerHour")
    if energy_delta_per_hour is None:
        return

    npc_state = context.get("npc_state", {})
    current_energy = npc_state.get("energy", 50)

    # Calculate delta based on time elapsed
    hours_elapsed = delta_seconds / 3600
    energy_change = energy_delta_per_hour * hours_elapsed

    # Apply and clamp to 0-100
    new_energy = max(0, min(100, current_energy + energy_change))
    npc_state["energy"] = new_energy


def _apply_mood_impact(effects: Dict[str, Any], context: Dict[str, Any]) -> None:
    """Apply mood impact (valence and arousal changes)."""
    mood_impact = effects.get("moodImpact")
    if not mood_impact:
        return

    valence_delta = mood_impact.get("valence", 0)
    arousal_delta = mood_impact.get("arousal", 0)

    npc_state = context.get("npc_state", {})
    mood_state = npc_state.get("moodState", {})

    current_valence = mood_state.get("valence", 0)
    current_arousal = mood_state.get("arousal", 0)

    # Apply deltas and clamp to -100 to 100
    new_valence = max(-100, min(100, current_valence + valence_delta))
    new_arousal = max(-100, min(100, current_arousal + arousal_delta))

    # Update mood state
    mood_state["valence"] = new_valence
    mood_state["arousal"] = new_arousal

    # Update tags based on new valence/arousal (simplified)
    mood_state["tags"] = _calculate_mood_tags(new_valence, new_arousal)

    npc_state["moodState"] = mood_state


def _calculate_mood_tags(valence: float, arousal: float) -> List[str]:
    """
    Calculate mood tags from valence and arousal.

    This is a simplified mapping. Real implementation should use
    the unified mood system from domain/metrics/mood_evaluators.py
    """
    tags = []

    # High arousal tags
    if arousal > 30:
        tags.append("energetic" if valence > 0 else "tense")

    # Low arousal tags
    if arousal < -30:
        tags.append("calm" if valence > 0 else "tired")

    # Valence tags
    if valence > 50:
        tags.append("happy")
    elif valence < -50:
        tags.append("sad")

    # Combined tags
    if valence > 30 and arousal > 30:
        tags.append("excited")
    elif valence < -30 and arousal > 30:
        tags.append("anxious")

    return tags if tags else ["neutral"]


def _apply_relationship_changes(effects: Dict[str, Any], context: Dict[str, Any]) -> None:
    """Apply relationship changes."""
    relationship_changes = effects.get("relationshipChanges")
    if not relationship_changes:
        return

    relationships = context.get("relationships", {})

    for npc_id_or_role, deltas in relationship_changes.items():
        # Get or create relationship entry
        if npc_id_or_role not in relationships:
            relationships[npc_id_or_role] = {
                "affinity": 0,
                "trust": 0,
                "chemistry": 0,
                "tension": 0,
            }

        relationship = relationships[npc_id_or_role]

        # Apply deltas and clamp to 0-100
        for metric in ["affinity", "trust", "chemistry", "tension"]:
            delta = deltas.get(metric, 0)
            if delta != 0:
                current = relationship.get(metric, 0)
                new_value = max(0, min(100, current + delta))
                relationship[metric] = new_value


def _apply_flags(effects: Dict[str, Any], context: Dict[str, Any]) -> None:
    """Apply flag changes."""
    flags_set = effects.get("flagsSet")
    if not flags_set:
        return

    flags = context.get("flags", {})

    for key, value in flags_set.items():
        # Support nested keys with dot notation (e.g., "arc.stage")
        keys = key.split(".")
        current = flags

        # Navigate to the parent dict
        for k in keys[:-1]:
            if k not in current:
                current[k] = {}
            current = current[k]

        # Set the final value
        current[keys[-1]] = value


# ==================
# Example Custom Effect Handlers
# ==================


def _example_give_item_effect(params: Dict[str, Any], context: Dict[str, Any]) -> None:
    """Example custom effect: give an item to the player."""
    item_id = params.get("itemId", "")
    quantity = params.get("quantity", 1)

    flags = context.get("flags", {})
    inventory = flags.get("inventory", {})

    current_qty = inventory.get(item_id, 0)
    inventory[item_id] = current_qty + quantity

    flags["inventory"] = inventory
    logger.info(f"Gave {quantity}x {item_id} to player")


def _example_grant_xp_effect(params: Dict[str, Any], context: Dict[str, Any]) -> None:
    """Example custom effect: grant XP to a skill."""
    skill = params.get("skill", "")
    amount = params.get("amount", 0)

    flags = context.get("flags", {})
    skills = flags.get("skills", {})

    current_xp = skills.get(skill, 0)
    skills[skill] = current_xp + amount

    flags["skills"] = skills
    logger.info(f"Granted {amount} XP to {skill}")


def _example_consume_ingredient_effect(params: Dict[str, Any], context: Dict[str, Any]) -> None:
    """Example custom effect: consume an ingredient from inventory."""
    item_id = params.get("itemId", "")
    quantity = params.get("quantity", 1)

    flags = context.get("flags", {})
    inventory = flags.get("inventory", {})

    current_qty = inventory.get(item_id, 0)
    if current_qty >= quantity:
        inventory[item_id] = current_qty - quantity
        flags["inventory"] = inventory
        logger.info(f"Consumed {quantity}x {item_id}")
    else:
        logger.warning(f"Not enough {item_id} to consume (have {current_qty}, need {quantity})")


def _example_spawn_event_effect(params: Dict[str, Any], context: Dict[str, Any]) -> None:
    """Example custom effect: spawn a world event."""
    event_id = params.get("eventId", "")
    event_data = params.get("eventData", {})

    flags = context.get("flags", {})
    events = flags.get("world_events", [])

    events.append({
        "event_id": event_id,
        "data": event_data,
        "triggered_at": context.get("world_time", 0),
    })

    flags["world_events"] = events
    logger.info(f"Spawned world event: {event_id}")


# Register example effect handlers
register_effect_handler("effect:give_item", _example_give_item_effect)
register_effect_handler("effect:grant_xp", _example_grant_xp_effect)
register_effect_handler("effect:consume_ingredient", _example_consume_ingredient_effect)
register_effect_handler("effect:spawn_event", _example_spawn_event_effect)
