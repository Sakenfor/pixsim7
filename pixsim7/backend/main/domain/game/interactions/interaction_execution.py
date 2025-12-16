"""
NPC Interaction Execution Pipeline

Phase 17.5: Apply interaction outcomes (relationships, flags, inventory, scenes, etc.)

This module provides a unified execution pipeline that:
- Validates interaction availability before execution
- Applies all outcome effects (relationships, flags, inventory, NPC effects)
- Launches scenes or generation flows
- Tracks cooldowns
- Provides consistent logging/telemetry
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional, Tuple
import time
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.models import GameSession, GameWorld, GameNPC
from .npc_interactions import (
    NpcInteractionDefinition,
    InteractionOutcome,
    RelationshipDelta,
    StatDelta,
    FlagChanges,
    InventoryChanges,
    NpcEffects,
    SceneLaunch,
    GenerationLaunch,
    ExecuteInteractionResponse,
    InventoryChangeSummary,
)
from ..stats import (
    StatEngine,
    get_default_relationship_definition,
)


# ===================
# Outcome Application
# ===================

async def apply_stat_deltas(
    session: GameSession,
    delta: StatDelta,
    world: Optional[GameWorld] = None,
) -> Dict[str, Any]:
    """
    Apply stat deltas for a given stat package to the appropriate entity in session.stats.

    This is a generic helper that routes stat changes through the abstract stat system,
    using StatEngine to clamp values according to the stat definition rather than hardcoded ranges.

    Args:
        session: Game session to update
        delta: StatDelta describing which package, axes, and entity to update
        world: Optional GameWorld for resolving custom stat definitions (if present in world.meta.stats_config)

    Returns:
        Updated entity stats dictionary

    Examples:
        # Apply relationship deltas to an NPC
        delta = StatDelta(
            package_id="core.relationships",
            axes={"affinity": +5.0, "trust": -3.0},
            entity_type="npc",
            npc_id=42
        )
        updated_stats = await apply_stat_deltas(session, delta, world)
        # updated_stats = {"affinity": 55.0, "trust": 47.0, "affinityTierId": "friend", ...}

    NOTE: This function focuses on NPC-scoped stats for now. Session and world-scoped stats
    are not yet implemented but the interface is designed to support them.
    """
    # Resolve stat definition
    # Prefer world-specific definition if available, otherwise use default
    stat_definition = None
    package_key = None

    # For relationships package, derive package key and definition
    if delta.package_id == "core.relationships":
        package_key = "relationships"

        # Try to get definition from world config first
        if world and world.meta:
            stats_config = world.meta.get("stats_config", {})
            definitions = stats_config.get("definitions", {})
            if package_key in definitions:
                from pixsim7.backend.main.domain.game.stats import StatDefinition
                stat_definition = StatDefinition(**definitions[package_key])

        # Fall back to default relationship definition
        if stat_definition is None:
            stat_definition = get_default_relationship_definition()
    else:
        # For other packages, we'd need to implement package resolution here
        # For now, raise an error for unsupported packages
        raise ValueError(
            f"Unsupported package_id '{delta.package_id}'. "
            f"Only 'core.relationships' is currently supported."
        )

    # Determine entity key based on entity_type
    if delta.entity_type == "npc":
        if delta.npc_id is None:
            raise ValueError("npc_id is required when entity_type is 'npc'")
        entity_key = f"npc:{delta.npc_id}"
    elif delta.entity_type == "session":
        # Future: session-scoped stats (e.g., player resources)
        entity_key = "session"
        raise NotImplementedError("Session-scoped stats not yet implemented")
    elif delta.entity_type == "world":
        # Future: world-scoped stats (e.g., global reputation)
        entity_key = "world"
        raise NotImplementedError("World-scoped stats not yet implemented")
    else:
        raise ValueError(f"Invalid entity_type: {delta.entity_type}")

    # Ensure package exists in session.stats
    if package_key not in session.stats:
        session.stats[package_key] = {}

    # Get current entity stats (or initialize with defaults)
    stats_for_package = session.stats[package_key]
    entity_stats = stats_for_package.get(entity_key, {})

    # Extract current numeric axis values
    # Default to axis default from definition, or 0 if not specified
    axes_by_name = {axis.name: axis for axis in stat_definition.axes}
    current_values: Dict[str, float] = {}

    for axis_name in axes_by_name.keys():
        if axis_name in entity_stats and isinstance(entity_stats[axis_name], (int, float)):
            current_values[axis_name] = float(entity_stats[axis_name])
        else:
            # Use axis default or 0
            current_values[axis_name] = axes_by_name[axis_name].default_value

    # Apply deltas
    new_values: Dict[str, float] = dict(current_values)
    for axis_name, delta_value in delta.axes.items():
        current = new_values.get(axis_name, 0.0)
        new_values[axis_name] = current + delta_value

    # Clamp values using StatEngine
    clamped_values = StatEngine.clamp_stat_values(new_values, stat_definition)

    # Update entity_stats with clamped values
    for axis_name, clamped_value in clamped_values.items():
        entity_stats[axis_name] = clamped_value

    # Persist back to session
    session.stats[package_key][entity_key] = entity_stats

    # TODO: Optionally normalize (compute tiers/levels) here
    # For now, we just apply and clamp. Normalization can be done separately
    # via StatEngine.normalize_entity_stats() if needed.

    return entity_stats


async def apply_relationship_deltas(
    session: GameSession,
    npc_id: int,
    deltas: RelationshipDelta,
    world_time: Optional[float] = None,
    world: Optional[GameWorld] = None
) -> Dict[str, Any]:
    """
    Apply relationship metric deltas to a session.

    This is a compatibility wrapper around apply_stat_deltas for the "core.relationships" package.
    Uses the abstract stat system (session.stats["relationships"]) and routes through StatEngine
    for proper clamping according to the stat definition.

    NOTE: Prefer using apply_stat_deltas directly for new code. This function is preserved
    for backward compatibility with existing callers.

    Args:
        session: Game session to update
        npc_id: Target NPC ID
        deltas: Relationship deltas to apply
        world_time: Optional world time (game seconds). If provided, used for lastInteractionAt.
                    If not provided, falls back to real-time (for backward compatibility).
        world: Optional GameWorld for resolving custom stat definitions

    Returns:
        Updated relationship data
    """
    # Build axes dict from RelationshipDelta
    axes: Dict[str, float] = {}
    if deltas.affinity is not None:
        axes["affinity"] = deltas.affinity
    if deltas.trust is not None:
        axes["trust"] = deltas.trust
    if deltas.chemistry is not None:
        axes["chemistry"] = deltas.chemistry
    if deltas.tension is not None:
        axes["tension"] = deltas.tension

    # If no axes to apply, just handle timestamp and return
    if not axes:
        npc_key = f"npc:{npc_id}"
        if "relationships" not in session.stats:
            session.stats["relationships"] = {}
        rel = session.stats["relationships"].get(npc_key, {})

        # Update timestamp
        if world_time is not None:
            rel["lastInteractionAt"] = world_time
        else:
            rel["lastInteractionAt"] = datetime.utcnow().isoformat()

        session.stats["relationships"][npc_key] = rel
        return rel

    # Create StatDelta for relationships package
    stat_delta = StatDelta(
        package_id="core.relationships",
        axes=axes,
        entity_type="npc",
        npc_id=npc_id,
    )

    # Apply stat deltas through the generic system
    entity_stats = await apply_stat_deltas(session, stat_delta, world)

    # Preserve timestamp behavior: update lastInteractionAt
    if world_time is not None:
        # Store world_time as float seconds for gameplay-based timing
        entity_stats["lastInteractionAt"] = world_time
    else:
        # Legacy fallback: use real-time ISO format
        entity_stats["lastInteractionAt"] = datetime.utcnow().isoformat()

    # Re-persist the entity_stats with the timestamp
    npc_key = f"npc:{npc_id}"
    session.stats["relationships"][npc_key] = entity_stats

    return entity_stats


async def apply_flag_changes(
    session: GameSession,
    changes: FlagChanges
) -> List[str]:
    """
    Apply flag changes to session.

    Args:
        session: Game session to update
        changes: Flag changes to apply

    Returns:
        List of changed flag paths
    """
    changed = []

    # Set flags
    if changes.set:
        for key, value in changes.set.items():
            session.flags[key] = value
            changed.append(f"set:{key}")

    # Delete flags
    if changes.delete:
        for key in changes.delete:
            if key in session.flags:
                del session.flags[key]
                changed.append(f"delete:{key}")

    # Increment flags
    if changes.increment:
        for key, delta in changes.increment.items():
            current = session.flags.get(key, 0)
            if isinstance(current, (int, float)):
                session.flags[key] = current + delta
                changed.append(f"increment:{key}:{delta}")

    # Arc stage updates
    if changes.arc_stages:
        arcs = session.flags.get("arcs", {})
        for arc_id, stage in changes.arc_stages.items():
            if arc_id not in arcs:
                arcs[arc_id] = {}
            arcs[arc_id]["stage"] = stage
            changed.append(f"arc:{arc_id}:stage={stage}")
        session.flags["arcs"] = arcs

    # Quest updates
    if changes.quest_updates:
        quests = session.flags.get("quests", {})
        for quest_id, status in changes.quest_updates.items():
            if quest_id not in quests:
                quests[quest_id] = {}
            quests[quest_id]["status"] = status
            changed.append(f"quest:{quest_id}:status={status}")
        session.flags["quests"] = quests

    # Trigger events
    if changes.trigger_events:
        events = session.flags.get("events", {})
        for event_id in changes.trigger_events:
            events[event_id] = {
                "active": True,
                "triggeredAt": int(time.time())
            }
            changed.append(f"event:{event_id}:triggered")
        session.flags["events"] = events

    # End events
    if changes.end_events:
        events = session.flags.get("events", {})
        for event_id in changes.end_events:
            if event_id in events:
                events[event_id]["active"] = False
                events[event_id]["endedAt"] = int(time.time())
                changed.append(f"event:{event_id}:ended")
        session.flags["events"] = events

    return changed


async def apply_inventory_changes(
    session: GameSession,
    changes: InventoryChanges
) -> InventoryChangeSummary:
    """
    Apply inventory changes to session.

    Args:
        session: Game session to update
        changes: Inventory changes to apply

    Returns:
        Summary of changes (added/removed item IDs)
    """
    inventory = session.flags.get("inventory", [])
    added = []
    removed = []

    # Add items
    if changes.add:
        for change in changes.add:
            item_id = change.item_id
            quantity = change.quantity or 1

            # Find existing item
            existing = next((item for item in inventory if item.get("itemId") == item_id), None)

            if existing:
                existing["quantity"] = existing.get("quantity", 1) + quantity
            else:
                inventory.append({
                    "itemId": item_id,
                    "quantity": quantity,
                    "acquiredAt": int(time.time())
                })

            added.append(item_id)

    # Remove items
    if changes.remove:
        for change in changes.remove:
            item_id = change.item_id
            quantity = change.quantity or 1

            # Find existing item
            existing = next((item for item in inventory if item.get("itemId") == item_id), None)

            if existing:
                current_qty = existing.get("quantity", 1)
                new_qty = current_qty - quantity

                if new_qty <= 0:
                    inventory.remove(existing)
                else:
                    existing["quantity"] = new_qty

                removed.append(item_id)

    session.flags["inventory"] = inventory

    return InventoryChangeSummary(
        added=added if added else None,
        removed=removed if removed else None
    )


async def apply_npc_effects(
    db: AsyncSession,
    session: GameSession,
    npc_id: int,
    effects: NpcEffects,
    world_time: Optional[float] = None
) -> None:
    """
    Apply NPC effects (memory, emotion, world event).

    Args:
        db: Database session
        session: Game session
        npc_id: Target NPC ID
        effects: NPC effects to apply
        world_time: Optional world time (game seconds). If provided, used for timestamps.
                    If not provided, falls back to real-time (for backward compatibility).
    """
    # Determine timestamp to use
    timestamp = int(world_time) if world_time is not None else int(time.time())

    # Memory creation
    if effects.create_memory:
        # TODO: Integrate with NpcMemory model when available
        # For now, store in session flags
        npc_key = f"npc:{npc_id}"
        npcs = session.flags.get("npcs", {})
        if npc_key not in npcs:
            npcs[npc_key] = {}

        memories = npcs[npc_key].get("memories", [])
        memories.append({
            "topic": effects.create_memory.topic,
            "summary": effects.create_memory.summary,
            "importance": effects.create_memory.importance or "normal",
            "memoryType": effects.create_memory.memory_type or "short_term",
            "tags": effects.create_memory.tags or [],
            "createdAt": timestamp
        })
        npcs[npc_key]["memories"] = memories
        session.flags["npcs"] = npcs

    # Emotion trigger
    if effects.trigger_emotion:
        # TODO: Integrate with NpcEmotionalState model when available
        # For now, store in session flags
        npc_key = f"npc:{npc_id}"
        npcs = session.flags.get("npcs", {})
        if npc_key not in npcs:
            npcs[npc_key] = {}

        emotions = npcs[npc_key].get("emotions", {})
        emotions[effects.trigger_emotion.emotion] = {
            "intensity": effects.trigger_emotion.intensity,
            "triggeredAt": timestamp,
            "durationSeconds": effects.trigger_emotion.duration_seconds
        }
        npcs[npc_key]["emotions"] = emotions
        session.flags["npcs"] = npcs

    # World event registration
    if effects.register_world_event:
        # TODO: Integrate with world event tracking when available
        world_events = session.flags.get("worldEvents", [])
        world_events.append({
            "eventType": effects.register_world_event.event_type,
            "eventName": effects.register_world_event.event_name,
            "description": effects.register_world_event.description,
            "relevanceScore": effects.register_world_event.relevance_score or 0.5,
            "npcId": npc_id,
            "timestamp": timestamp
        })
        session.flags["worldEvents"] = world_events


async def track_interaction_cooldown(
    session: GameSession,
    npc_id: int,
    interaction_id: str,
    world_time: Optional[float] = None
) -> None:
    """
    Track interaction usage timestamp for cooldown.

    Args:
        session: Game session
        npc_id: Target NPC ID
        interaction_id: Interaction ID
        world_time: Optional world time (game seconds). If provided, used for cooldown tracking.
                    If not provided, falls back to real-time (for backward compatibility).
    """
    # Determine timestamp to use
    timestamp = int(world_time) if world_time is not None else int(time.time())

    npc_key = f"npc:{npc_id}"
    npcs = session.flags.get("npcs", {})
    if npc_key not in npcs:
        npcs[npc_key] = {}

    interactions = npcs[npc_key].get("interactions", {})
    last_used = interactions.get("lastUsedAt", {})
    last_used[interaction_id] = timestamp
    interactions["lastUsedAt"] = last_used
    npcs[npc_key]["interactions"] = interactions
    session.flags["npcs"] = npcs


async def advance_interaction_chain(
    session: GameSession,
    chain_id: str,
    step_id: str,
    world_time: Optional[float] = None
) -> None:
    """
    Advance an interaction chain to the next step.

    Args:
        session: Game session
        chain_id: Chain ID
        step_id: Completed step ID
        world_time: Optional world time (game seconds). If provided, used for chain progression timing.
                    If not provided, falls back to real-time (for backward compatibility).
    """
    # Determine timestamp to use
    timestamp = int(world_time) if world_time is not None else int(time.time())

    # Ensure chains structure exists
    chains = session.flags.get("chains", {})
    if chain_id not in chains:
        chains[chain_id] = {
            "chainId": chain_id,
            "currentStep": 0,
            "completed": False,
            "startedAt": timestamp,
            "completedSteps": [],
            "skippedSteps": [],
        }

    chain_state = chains[chain_id]

    # Add to completed steps
    if step_id not in chain_state["completedSteps"]:
        chain_state["completedSteps"].append(step_id)

    # Update last step time
    chain_state["lastStepAt"] = timestamp

    # Note: Auto-advance logic is handled client-side based on chain definition
    # Backend just tracks completion of steps
    session.flags["chains"] = chains


# ===================
# Main Execution
# ===================

async def execute_interaction(
    db: AsyncSession,
    session: GameSession,
    npc_id: int,
    definition: NpcInteractionDefinition,
    player_input: Optional[str] = None,
    context: Optional[Dict[str, Any]] = None
) -> ExecuteInteractionResponse:
    """
    Execute an NPC interaction and apply all outcomes.

    Args:
        db: Database session
        session: Game session
        npc_id: Target NPC ID
        definition: Interaction definition
        player_input: Optional player input (for dialogue)
        context: Optional additional context

    Returns:
        Execution response with results
    """
    outcome = definition.outcome
    if not outcome:
        # No outcome defined, return success with no changes
        return ExecuteInteractionResponse(
            success=True,
            message=f"{definition.label} completed",
            timestamp=int(time.time())
        )

    # Apply outcomes
    relationship_deltas = None
    flag_changes = None
    inventory_changes = None
    launched_scene_id = None
    generation_request_id = None

    # Get world_time from session for gameplay-consistent timestamps
    # Use session.world_time if available, otherwise None (will fall back to real-time)
    world_time = getattr(session, 'world_time', None)

    # 1. Relationship changes
    if outcome.relationship_deltas:
        updated_rel = await apply_relationship_deltas(
            session,
            npc_id,
            outcome.relationship_deltas,
            world_time=world_time
        )
        relationship_deltas = outcome.relationship_deltas

    # 2. Flag changes
    if outcome.flag_changes:
        changed = await apply_flag_changes(session, outcome.flag_changes)
        flag_changes = changed

    # 3. Inventory changes
    if outcome.inventory_changes:
        summary = await apply_inventory_changes(session, outcome.inventory_changes)
        inventory_changes = summary

    # 4. NPC effects
    if outcome.npc_effects:
        await apply_npc_effects(db, session, npc_id, outcome.npc_effects, world_time=world_time)

    # 5. Scene launch
    if outcome.scene_launch:
        launched_scene_id = await prepare_scene_launch(
            db,
            session,
            npc_id,
            outcome.scene_launch
        )

    # 6. Generation launch
    if outcome.generation_launch:
        generation_request_id = await prepare_generation_launch(
            db,
            session,
            npc_id,
            outcome.generation_launch,
            player_input
        )

    # 6.5. Narrative program launch (unified runtime)
    narrative_program_result = None
    if outcome.narrative_program_id:
        from pixsim7.backend.main.domain.narrative.integration_helpers import (
            launch_narrative_program_from_interaction
        )
        from ..core.models import GameWorld

        # Load world
        world = await db.get(GameWorld, session.world_id)
        if world:
            narrative_program_result = await launch_narrative_program_from_interaction(
                session=session,
                world=world,
                npc_id=npc_id,
                program_id=outcome.narrative_program_id,
                db=db
            )

    # 7. Track cooldown
    if definition.gating and definition.gating.cooldown_seconds:
        await track_interaction_cooldown(session, npc_id, definition.id, world_time=world_time)

    # 8. Chain progression (if this interaction is part of a chain)
    chain_id = None
    if context and "chainId" in context and "stepId" in context:
        chain_id = context["chainId"]
        step_id = context["stepId"]
        await advance_interaction_chain(session, chain_id, step_id, world_time=world_time)

    # Determine success message
    message = outcome.success_message or f"{definition.label} completed"

    return ExecuteInteractionResponse(
        success=True,
        message=message,
        relationshipDeltas=relationship_deltas,
        flagChanges=flag_changes,
        inventoryChanges=inventory_changes,
        launchedSceneId=launched_scene_id,
        generationRequestId=generation_request_id,
        timestamp=int(time.time())
    )


async def prepare_scene_launch(
    db: AsyncSession,
    session: GameSession,
    npc_id: int,
    launch: SceneLaunch
) -> Optional[int]:
    """
    Prepare scene launch (resolve intent to scene ID).

    Args:
        db: Database session
        session: Game session
        npc_id: Target NPC ID
        launch: Scene launch configuration

    Returns:
        Scene ID to launch (or None if not resolved)
    """
    # Direct scene ID
    if launch.scene_id:
        return launch.scene_id

    # Scene intent mapping (from world metadata)
    if launch.scene_intent_id:
        # Load world to get scene intent mappings
        world = await db.get(GameWorld, session.world_id)
        if world and world.meta:
            interactions_meta = world.meta.get("interactions", {})
            mappings = interactions_meta.get("sceneIntentMappings", {})
            scene_id = mappings.get(launch.scene_intent_id)
            if scene_id:
                return scene_id

    return None


async def prepare_generation_launch(
    db: AsyncSession,
    session: GameSession,
    npc_id: int,
    launch: GenerationLaunch,
    player_input: Optional[str] = None
) -> Optional[str]:
    """
    Prepare generation launch (dialogue or action blocks).

    Args:
        db: Database session
        session: Game session
        npc_id: Target NPC ID
        launch: Generation launch configuration
        player_input: Optional player input

    Returns:
        Generation request ID (or None if not launched)
    """
    # Integrate with dialogue generation system
    if launch.dialogue_request:
        # Actually trigger dialogue generation via the dialogue engine
        from pixsim7.backend.main.domain.narrative import NarrativeEngine

        request_id = f"dialogue:{npc_id}:{int(time.time())}"

        # Initialize narrative engine
        engine = NarrativeEngine()

        # Load NPC data
        npc = await db.get(GameNPC, npc_id)
        if not npc:
            return None

        # Load world data
        world = await db.get(GameWorld, session.world_id) if session.world_id else None
        world_data = {
            "id": world.id if world else 0,
            "name": world.name if world else "Default World",
            "meta": world.meta if world and world.meta else {}
        }

        npc_data = {
            "id": npc.id,
            "name": npc.name,
            "personality": npc.personality or {},
            "home_location_id": npc.home_location_id
        }

        session_data = {
            "id": session.id,
            "world_time": session.world_time,
            "flags": session.flags,
            "relationships": session.stats.get("relationships", {})
        }

        # Build context
        context = engine.build_context(
            world_id=world_data["id"],
            session_id=session.id,
            npc_id=npc_id,
            world_data=world_data,
            session_data=session_data,
            npc_data=npc_data,
            location_data=None,
            scene_data=None,
            player_input=player_input
        )

        # Generate the dialogue request
        program_id = launch.dialogue_request.program_id or "default_dialogue"
        result = engine.build_dialogue_request(
            context=context,
            program_id=program_id
        )

        # Store dialogue prompt in session for client to execute
        pending = session.flags.get("pendingDialogue", [])
        pending.append({
            "requestId": request_id,
            "npcId": npc_id,
            "programId": program_id,
            "systemPrompt": launch.dialogue_request.system_prompt,
            "llmPrompt": result["llm_prompt"],
            "visualPrompt": result.get("visual_prompt"),
            "playerInput": player_input,
            "branchIntent": launch.branch_intent,
            "createdAt": int(time.time()),
            "metadata": result.get("metadata", {})
        })
        session.flags["pendingDialogue"] = pending
        return request_id

    if launch.action_block_ids:
        request_id = f"action_blocks:{npc_id}:{int(time.time())}"
        # Store pending action block request
        pending = session.flags.get("pendingActionBlocks", [])
        pending.append({
            "requestId": request_id,
            "npcId": npc_id,
            "blockIds": launch.action_block_ids,
            "branchIntent": launch.branch_intent,
            "createdAt": int(time.time())
        })
        session.flags["pendingActionBlocks"] = pending
        return request_id

    return None
