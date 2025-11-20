"""
NPC Interaction API Endpoints

Phase 17.3+: REST API for listing and executing NPC interactions
Updated: Phase 2.0 - Uses PluginContext for modern patterns
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional
import time

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7_backend.api.dependencies import CurrentUser, DatabaseSession
from pixsim7_backend.infrastructure.plugins.dependencies import get_plugin_context
from pixsim7_backend.infrastructure.plugins.context import PluginContext
from pixsim7_backend.domain.game.models import GameWorld, GameSession, GameNPC
from pixsim7_backend.domain.game.npc_interactions import (
    ListInteractionsRequest,
    ListInteractionsResponse,
    ExecuteInteractionRequest,
    ExecuteInteractionResponse,
    NpcInteractionInstance,
    InteractionContext,
    RelationshipSnapshot,
    NpcInteractionDefinition,
)
from pixsim7_backend.domain.game.interaction_availability import (
    evaluate_interaction_availability,
    create_interaction_instance,
    filter_interactions_by_target,
)
from pixsim7_backend.domain.game.interaction_execution import (
    execute_interaction as execute_interaction_logic,
)


router = APIRouter()


async def load_interaction_definitions(
    world: GameWorld,
    npc: Optional[GameNPC] = None
) -> List[NpcInteractionDefinition]:
    """
    Load interaction definitions from world and NPC metadata.

    Args:
        world: GameWorld with meta.interactions
        npc: Optional GameNPC with meta.interactions overrides

    Returns:
        List of interaction definitions (world + NPC-specific)
    """
    definitions = []

    # Load world-level definitions
    if world.meta and "interactions" in world.meta:
        interactions_meta = world.meta["interactions"]
        if isinstance(interactions_meta, dict) and "definitions" in interactions_meta:
            for defn_data in interactions_meta["definitions"].values():
                try:
                    defn = NpcInteractionDefinition(**defn_data)
                    definitions.append(defn)
                except Exception as e:
                    # Log but don't fail on malformed definitions
                    print(f"Warning: Failed to parse interaction definition: {e}")

    # Apply NPC-level overrides and additions
    if npc and npc.meta and "interactions" in npc.meta:
        npc_interactions = npc.meta["interactions"]

        # Apply definition overrides
        if "definitionOverrides" in npc_interactions:
            overrides = npc_interactions["definitionOverrides"]
            for i, defn in enumerate(definitions):
                if defn.id in overrides:
                    override_data = overrides[defn.id]
                    # Merge override into definition
                    updated_data = defn.dict()
                    updated_data.update(override_data)
                    definitions[i] = NpcInteractionDefinition(**updated_data)

        # Filter out disabled interactions
        if "disabledInteractions" in npc_interactions:
            disabled = set(npc_interactions["disabledInteractions"])
            definitions = [d for d in definitions if d.id not in disabled]

        # Add NPC-specific interactions
        if "additionalInteractions" in npc_interactions:
            for add_data in npc_interactions["additionalInteractions"]:
                try:
                    defn = NpcInteractionDefinition(**add_data)
                    definitions.append(defn)
                except Exception as e:
                    print(f"Warning: Failed to parse NPC-specific interaction: {e}")

    return definitions


def build_interaction_context(
    session: GameSession,
    npc_id: int,
    location_id: Optional[int] = None
) -> InteractionContext:
    """
    Build interaction context from session state.

    Args:
        session: GameSession with flags and relationships
        npc_id: Target NPC ID
        location_id: Optional location ID

    Returns:
        InteractionContext for gating checks
    """
    # Extract relationship snapshot
    npc_key = f"npc:{npc_id}"
    rel_data = session.relationships.get(npc_key, {})
    relationship_snapshot = None
    if rel_data:
        relationship_snapshot = RelationshipSnapshot(
            affinity=rel_data.get("affinity"),
            trust=rel_data.get("trust"),
            chemistry=rel_data.get("chemistry"),
            tension=rel_data.get("tension"),
            tierId=rel_data.get("tierId") or rel_data.get("tier_id"),
            intimacyLevelId=rel_data.get("intimacyLevelId") or rel_data.get("intimacy_level_id")
        )

    # Extract NPC state from session flags
    npc_flags = session.flags.get("npcs", {}).get(npc_key, {})
    current_activity = None
    state_tags = []
    if "state" in npc_flags:
        state = npc_flags["state"]
        current_activity = state.get("currentActivity") or state.get("activity")
        state_tags = state.get("stateTags", [])

    # Extract mood tags
    mood_tags = npc_flags.get("moodTags", [])

    # Extract last used timestamps for cooldowns
    interaction_state = npc_flags.get("interactions", {})
    last_used_at = interaction_state.get("lastUsedAt", {})

    return InteractionContext(
        locationId=location_id,
        currentActivityId=current_activity,
        stateTags=state_tags,
        moodTags=mood_tags,
        relationshipSnapshot=relationship_snapshot,
        worldTime=int(session.world_time),
        sessionFlags=session.flags,
        lastUsedAt=last_used_at
    )


def get_world_tier_order(world: GameWorld) -> Optional[List[str]]:
    """
    Extract relationship tier ordering from world metadata.

    Returns:
        List of tier IDs in order from lowest to highest
    """
    if not world.meta:
        return None

    # Look for relationship schema
    if "relationships" in world.meta:
        rel_schema = world.meta["relationships"]
        if "tiers" in rel_schema and isinstance(rel_schema["tiers"], list):
            return [tier.get("id") for tier in rel_schema["tiers"] if "id" in tier]

    return None


@router.post("/list", response_model=ListInteractionsResponse)
async def list_npc_interactions(
    req: ListInteractionsRequest,
    ctx: PluginContext = Depends(get_plugin_context("npc_interactions")),
    db: DatabaseSession = None,
    user: CurrentUser = None
) -> ListInteractionsResponse:
    """
    List available interactions for an NPC at the current moment.

    This endpoint:
    1. Loads interaction definitions from world + NPC metadata
    2. Filters by target NPC/roles
    3. Evaluates gating for each interaction
    4. Returns list of interaction instances with availability flags

    Uses PluginContext for logging and capability-based operations.

    Args:
        req: Request with world/session/NPC IDs
        ctx: Plugin context (provides logging and capabilities)
        db: Database session
        user: Current user

    Returns:
        List of interaction instances
    """
    # TODO: Eventually migrate database queries to capability APIs
    ctx.log.info(
        "Listing NPC interactions",
        world_id=req.world_id,
        session_id=req.session_id,
        npc_id=req.npc_id,
        include_unavailable=req.include_unavailable
    )
    # Load world
    world = await db.get(GameWorld, req.world_id)
    if not world:
        ctx.log.warning("World not found", world_id=req.world_id)
        raise HTTPException(status_code=404, detail="World not found")

    # Load session
    session = await db.get(GameSession, req.session_id)
    if not session or session.user_id != user.id:
        ctx.log.warning(
            "Session not found or unauthorized",
            session_id=req.session_id,
            user_id=user.id
        )
        raise HTTPException(status_code=404, detail="Session not found")

    # Load NPC
    npc = await db.get(GameNPC, req.npc_id)
    if not npc:
        ctx.log.warning("NPC not found", npc_id=req.npc_id)
        raise HTTPException(status_code=404, detail="NPC not found")

    # Load interaction definitions
    ctx.log.debug("Loading interaction definitions", world_id=req.world_id, npc_id=req.npc_id)
    definitions = await load_interaction_definitions(world, npc)

    # Get NPC roles (from world NPC mappings)
    npc_roles = []
    if world.meta and "npcs" in world.meta:
        npc_mappings = world.meta["npcs"]
        for role, mapped_id in npc_mappings.items():
            if mapped_id == req.npc_id:
                npc_roles.append(role)

    # Filter by target
    applicable = filter_interactions_by_target(definitions, req.npc_id, npc_roles)

    # Build context
    context = build_interaction_context(session, req.npc_id, req.location_id)

    # Get world tier order
    tier_order = get_world_tier_order(world)

    # Evaluate each interaction
    instances = []
    current_time = int(time.time())

    for defn in applicable:
        available, disabled_reason, disabled_msg = evaluate_interaction_availability(
            defn,
            context,
            tier_order,
            current_time
        )

        # Skip unavailable interactions unless explicitly requested
        if not available and not req.include_unavailable:
            continue

        instance = create_interaction_instance(
            defn,
            req.npc_id,
            req.world_id,
            req.session_id,
            context,
            available,
            disabled_reason,
            disabled_msg
        )
        instances.append(instance)

    # Sort by priority (descending), then by label
    instances.sort(key=lambda x: (-x.priority, x.label))

    ctx.log.info(
        "Interactions listed successfully",
        npc_id=req.npc_id,
        total_interactions=len(instances),
        available_count=sum(1 for i in instances if i.available)
    )

    return ListInteractionsResponse(
        interactions=instances,
        npcId=req.npc_id,
        worldId=req.world_id,
        sessionId=req.session_id,
        timestamp=current_time
    )


@router.post("/execute", response_model=ExecuteInteractionResponse)
async def execute_npc_interaction(
    req: ExecuteInteractionRequest,
    ctx: PluginContext = Depends(get_plugin_context("npc_interactions")),
    db: DatabaseSession = None,
    user: CurrentUser = None
) -> ExecuteInteractionResponse:
    """
    Execute an NPC interaction and apply all outcomes.

    This endpoint:
    1. Validates interaction availability
    2. Applies all outcome effects (relationships, flags, inventory, NPC effects)
    3. Launches scenes or generation flows if configured
    4. Tracks cooldown
    5. Persists session changes to database

    Uses PluginContext for logging and capability-based operations.

    Args:
        req: Request with world/session/NPC/interaction IDs
        ctx: Plugin context (provides logging and capabilities)
        db: Database session
        user: Current user

    Returns:
        Execution response with results
    """
    # TODO: Eventually migrate database queries to capability APIs
    ctx.log.info(
        "Executing NPC interaction",
        world_id=req.world_id,
        session_id=req.session_id,
        npc_id=req.npc_id,
        interaction_id=req.interaction_id
    )
    # Load world
    world = await db.get(GameWorld, req.world_id)
    if not world:
        ctx.log.warning("World not found for interaction execution", world_id=req.world_id)
        raise HTTPException(status_code=404, detail="World not found")

    # Load session
    session = await db.get(GameSession, req.session_id)
    if not session or session.user_id != user.id:
        ctx.log.warning(
            "Session not found or unauthorized for interaction execution",
            session_id=req.session_id,
            user_id=user.id
        )
        raise HTTPException(status_code=404, detail="Session not found")

    # Load NPC
    npc = await db.get(GameNPC, req.npc_id)
    if not npc:
        ctx.log.warning("NPC not found for interaction execution", npc_id=req.npc_id)
        raise HTTPException(status_code=404, detail="NPC not found")

    # Load interaction definitions
    ctx.log.debug("Loading interaction definitions for execution")
    definitions = await load_interaction_definitions(world, npc)

    # Find the requested interaction
    definition = next((d for d in definitions if d.id == req.interaction_id), None)
    if not definition:
        ctx.log.warning(
            "Interaction definition not found",
            interaction_id=req.interaction_id,
            available_definitions=[d.id for d in definitions]
        )
        raise HTTPException(status_code=404, detail=f"Interaction {req.interaction_id} not found")

    # Build context for availability check
    context = build_interaction_context(session, req.npc_id, req.context.get("locationId") if req.context else None)

    # Get world tier order
    tier_order = get_world_tier_order(world)

    # Check availability before executing
    ctx.log.debug("Checking interaction availability")
    available, disabled_reason, disabled_msg = evaluate_interaction_availability(
        definition,
        context,
        tier_order,
        int(time.time())
    )

    if not available:
        ctx.log.warning(
            "Interaction not available",
            interaction_id=req.interaction_id,
            disabled_reason=disabled_reason,
            disabled_msg=disabled_msg
        )
        raise HTTPException(
            status_code=400,
            detail=f"Interaction not available: {disabled_msg or disabled_reason}"
        )

    # Execute interaction
    ctx.log.info("Executing interaction logic", interaction_id=req.interaction_id)
    result = await execute_interaction_logic(
        db,
        session,
        req.npc_id,
        definition,
        req.player_input,
        req.context
    )

    # Persist session changes
    await db.commit()
    await db.refresh(session)

    # Attach updated session to response
    result.updatedSession = {
        "relationships": session.relationships,
        "flags": session.flags,
    }

    ctx.log.info(
        "Interaction executed successfully",
        interaction_id=req.interaction_id,
        npc_id=req.npc_id,
        success=result.success
    )

    return result
