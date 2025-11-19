"""
NPC Interaction API Endpoints

Phase 17.3+: REST API for listing and executing NPC interactions
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional
import time

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7_backend.api.dependencies import CurrentUser, DatabaseSession
from pixsim7_backend.domain.game.models import GameWorld, GameSession, GameNPC
from pixsim7_backend.domain.game.npc_interactions import (
    ListInteractionsRequest,
    ListInteractionsResponse,
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
    db: DatabaseSession,
    user: CurrentUser
) -> ListInteractionsResponse:
    """
    List available interactions for an NPC at the current moment.

    This endpoint:
    1. Loads interaction definitions from world + NPC metadata
    2. Filters by target NPC/roles
    3. Evaluates gating for each interaction
    4. Returns list of interaction instances with availability flags

    Args:
        req: Request with world/session/NPC IDs
        db: Database session
        user: Current user

    Returns:
        List of interaction instances
    """
    # Load world
    world = await db.get(GameWorld, req.world_id)
    if not world:
        raise HTTPException(status_code=404, detail="World not found")

    # Load session
    session = await db.get(GameSession, req.session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")

    # Load NPC
    npc = await db.get(GameNPC, req.npc_id)
    if not npc:
        raise HTTPException(status_code=404, detail="NPC not found")

    # Load interaction definitions
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

    return ListInteractionsResponse(
        interactions=instances,
        npcId=req.npc_id,
        worldId=req.world_id,
        sessionId=req.session_id,
        timestamp=current_time
    )
