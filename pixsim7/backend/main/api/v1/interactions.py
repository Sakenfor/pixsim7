"""
Interaction API Endpoints

Phase 17.3+: REST API for listing and executing interactions
Updated: Phase 2.0 - Uses PluginContext for modern patterns
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional
import time

from fastapi import APIRouter, HTTPException, Depends

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession
from pixsim7.backend.main.infrastructure.plugins.dependencies import get_plugin_context
from pixsim7.backend.main.infrastructure.plugins.context import PluginContext
# Note: Fully migrated to capability APIs - reads via ctx.world/ctx.session,
# writes via ctx.session_mutations.execute_interaction()
from pixsim7.backend.main.domain.game.interactions.interactions import (
    ListInteractionsRequest,
    ListInteractionsResponse,
    ExecuteInteractionRequest,
    ExecuteInteractionResponse,
    InteractionTarget,
    InteractionContext,
    InteractionDefinition,
)
from pixsim7.backend.main.domain.game.interactions.interaction_availability import (
    evaluate_interaction_availability,
    create_interaction_instance,
    filter_interactions_by_target,
)
from pixsim7.backend.main.services.links.template_resolver import (
    resolve_template_to_runtime,
)


router = APIRouter()


async def load_interaction_definitions(
    world: Dict[str, Any],
    target: Optional[Dict[str, Any]] = None
) -> List[InteractionDefinition]:
    """
    Load interaction definitions from world and target metadata.

    Args:
        world: World dict with meta.interactions (from capability API)
        target: Optional target dict with meta.interactions overrides (from capability API)

    Returns:
        List of interaction definitions (world + target-specific)
    """
    definitions = []

    # Load world-level definitions
    world_meta = world.get("meta") or {}
    if "interactions" in world_meta:
        interactions_meta = world_meta["interactions"]
        if isinstance(interactions_meta, dict) and "definitions" in interactions_meta:
            for defn_data in interactions_meta["definitions"].values():
                try:
                    defn = InteractionDefinition(**defn_data)
                    definitions.append(defn)
                except Exception as e:
                    # Log but don't fail on malformed definitions
                    print(f"Warning: Failed to parse interaction definition: {e}")

    # Apply target-level overrides and additions
    if target:
        target_meta = target.get("meta") or {}
        if "interactions" in target_meta:
            target_interactions = target_meta["interactions"]

            # Apply definition overrides
            if "definitionOverrides" in target_interactions:
                overrides = target_interactions["definitionOverrides"]
                for i, defn in enumerate(definitions):
                    if defn.id in overrides:
                        override_data = overrides[defn.id]
                        # Merge override into definition
                        updated_data = defn.dict()
                        updated_data.update(override_data)
                        definitions[i] = InteractionDefinition(**updated_data)

            # Filter out disabled interactions
            if "disabledInteractions" in target_interactions:
                disabled = set(target_interactions["disabledInteractions"])
                definitions = [d for d in definitions if d.id not in disabled]

            # Add target-specific interactions
            if "additionalInteractions" in target_interactions:
                for add_data in target_interactions["additionalInteractions"]:
                    try:
                        defn = InteractionDefinition(**add_data)
                        definitions.append(defn)
                    except Exception as e:
                        print(f"Warning: Failed to parse target-specific interaction: {e}")

    return definitions


def build_interaction_context(
    session: Dict[str, Any],
    target_kind: str,
    target_id: int,
    location_id: Optional[int] = None
) -> InteractionContext:
    """
    Build interaction context from session state.

    Args:
        session: Session dict with flags and stats (from capability API)
        target_kind: Target kind
        target_id: Target ID
        location_id: Optional location ID

    Returns:
        InteractionContext for gating checks
    """
    # Extract stats snapshot
    stats_snapshot = session.get("stats") or {}

    flags = session.get("flags", {})
    current_activity = None
    state_tags = []
    mood_tags = []
    last_used_at = {}
    if target_kind == "npc":
        npc_key = f"npc:{target_id}"
        # Extract NPC state from session flags
        npc_flags = flags.get("npcs", {}).get(npc_key, {})
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
        statsSnapshot=stats_snapshot or None,
        worldTime=int(session.get("world_time", 0)),
        sessionFlags=flags,
        lastUsedAt=last_used_at
    )


def get_world_stat_definitions(world: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Extract stat definitions from world metadata.

    Args:
        world: World dict with meta (from capability API)

    Returns:
        Raw stats_config.definitions dict or None
    """
    world_meta = world.get("meta") or {}
    if not world_meta:
        return None

    stats_config = world_meta.get("stats_config") or {}
    definitions = stats_config.get("definitions")
    if isinstance(definitions, dict):
        return definitions

    return None


@router.post("/list", response_model=ListInteractionsResponse)
async def list_interactions(
    req: ListInteractionsRequest,
    ctx: PluginContext = Depends(get_plugin_context("interactions")),
    db: DatabaseSession = None,
    user: CurrentUser = None
) -> ListInteractionsResponse:
    """
    List available interactions for a target at the current moment.

    This endpoint:
    1. Loads interaction definitions from world + target metadata
    2. Filters by target and roles
    3. Evaluates gating for each interaction
    4. Returns list of interaction instances with availability flags

    Uses PluginContext for logging and capability-based operations.

    Args:
        req: Request with world/session/target IDs
        ctx: Plugin context (provides logging and capabilities)
        db: Database session
        user: Current user

    Returns:
        List of interaction instances
    """
    target = req.target
    ctx.log.info(
        "Listing interactions",
        world_id=req.world_id,
        session_id=req.session_id,
        target_kind=target.kind,
        target_id=target.id,
        include_unavailable=req.include_unavailable
    )

    # Load world via capability API
    world = await ctx.world.get_world(req.world_id)
    if not world:
        ctx.log.warning("World not found", world_id=req.world_id)
        raise HTTPException(status_code=404, detail="World not found")

    # Load session via capability API
    session = await ctx.session.get_session(req.session_id)
    if not session:
        ctx.log.warning("Session not found", session_id=req.session_id)
        raise HTTPException(status_code=404, detail="Session not found")

    # Note: Authorization checked by capability API based on plugin permissions

    if target.kind != "npc":
        raise HTTPException(status_code=400, detail=f"Unsupported target kind: {target.kind}")
    target_id = target.id
    if target_id is None and target.template_kind and target.template_id:
        if not db:
            raise HTTPException(status_code=500, detail="Database required for template resolution")
        target_id = await resolve_template_to_runtime(
            db,
            target.template_kind,
            target.template_id,
            link_id=target.link_id,
        )
    if target_id is None:
        raise HTTPException(status_code=400, detail="target.id or template reference is required")
    target = target.model_copy(update={"id": target_id})

    # Load NPC via capability API
    npc = await ctx.world.get_npc(target_id)
    if not npc:
        ctx.log.warning("NPC not found", npc_id=target_id)
        raise HTTPException(status_code=404, detail="NPC not found")

    # Load interaction definitions
    ctx.log.debug("Loading interaction definitions", world_id=req.world_id, target_id=target_id)
    definitions = await load_interaction_definitions(world, npc)

    # Get NPC roles (from world NPC mappings)
    target_roles = []
    world_meta = world.get("meta") or {}
    if "npcs" in world_meta:
        npc_mappings = world_meta["npcs"]
        for role, mapped_id in npc_mappings.items():
            if mapped_id == target_id:
                target_roles.append(role)

    # Filter by target
    applicable = filter_interactions_by_target(definitions, target.kind, target_id, target_roles)

    # Build context
    context = build_interaction_context(session, target.kind, target_id, req.location_id)

    # Get world stat definitions for gating comparisons
    stat_definitions = get_world_stat_definitions(world)

    # Evaluate each interaction
    instances = []
    current_time = int(time.time())

    for defn in applicable:
        available, disabled_reason, disabled_msg = evaluate_interaction_availability(
            defn,
            context,
            stat_definitions,
            target,
            current_time
        )

        # Skip unavailable interactions unless explicitly requested
        if not available and not req.include_unavailable:
            continue

        instance = create_interaction_instance(
            defn,
            target,
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
        target_kind=target.kind,
        target_id=target_id,
        total_interactions=len(instances),
        available_count=sum(1 for i in instances if i.available)
    )

    return ListInteractionsResponse(
        interactions=instances,
        target=target,
        worldId=req.world_id,
        sessionId=req.session_id,
        timestamp=current_time
    )


@router.post("/execute", response_model=ExecuteInteractionResponse)
async def execute_interaction(
    req: ExecuteInteractionRequest,
    ctx: PluginContext = Depends(get_plugin_context("interactions")),
    db: DatabaseSession = None,
    user: CurrentUser = None
) -> ExecuteInteractionResponse:
    """
    Execute an interaction and apply all outcomes.

    This endpoint:
    1. Validates interaction availability
    2. Applies all outcome effects (relationships, flags, inventory, target effects)
    3. Launches scenes or generation flows if configured
    4. Tracks cooldown
    5. Persists session changes to database

    Uses PluginContext for logging and capability-based operations.

    Args:
        req: Request with world/session/target/interaction IDs
        ctx: Plugin context (provides logging and capabilities)
        db: Database session
        user: Current user

    Returns:
        Execution response with results
    """
    target = req.target
    ctx.log.info(
        "Executing interaction",
        world_id=req.world_id,
        session_id=req.session_id,
        target_kind=target.kind,
        target_id=target.id,
        interaction_id=req.interaction_id
    )

    # Load world via capability API
    world = await ctx.world.get_world(req.world_id)
    if not world:
        ctx.log.warning("World not found for interaction execution", world_id=req.world_id)
        raise HTTPException(status_code=404, detail="World not found")

    # Load session via capability API
    session = await ctx.session.get_session(req.session_id)
    if not session:
        ctx.log.warning("Session not found for interaction execution", session_id=req.session_id)
        raise HTTPException(status_code=404, detail="Session not found")

    # Note: Authorization checked by capability API based on plugin permissions

    if target.kind != "npc":
        raise HTTPException(status_code=400, detail=f"Unsupported target kind: {target.kind}")
    target_id = target.id
    if target_id is None and target.template_kind and target.template_id:
        if not db:
            raise HTTPException(status_code=500, detail="Database required for template resolution")
        target_id = await resolve_template_to_runtime(
            db,
            target.template_kind,
            target.template_id,
            link_id=target.link_id,
        )
    if target_id is None:
        raise HTTPException(status_code=400, detail="target.id or template reference is required")
    target = target.model_copy(update={"id": target_id})

    # Load NPC via capability API
    npc = await ctx.world.get_npc(target_id)
    if not npc:
        ctx.log.warning("NPC not found for interaction execution", npc_id=target_id)
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
    context = build_interaction_context(
        session,
        target.kind,
        target_id,
        req.context.get("locationId") if req.context else None,
    )

    # Get world stat definitions for gating comparisons
    stat_definitions = get_world_stat_definitions(world)

    # Check availability before executing
    ctx.log.debug("Checking interaction availability")
    available, disabled_reason, disabled_msg = evaluate_interaction_availability(
        definition,
        context,
        stat_definitions,
        target,
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

    # Execute interaction via capability API
    ctx.log.info("Executing interaction logic", interaction_id=req.interaction_id)

    result_dict = await ctx.session_mutations.execute_interaction(
        session_id=req.session_id,
        target_kind=target.kind,
        target_id=target_id,
        interaction_definition=definition,
        player_input=req.player_input,
        context=req.context,
    )

    if not result_dict:
        ctx.log.error("Failed to execute interaction", session_id=req.session_id)
        raise HTTPException(status_code=500, detail="Failed to execute interaction")

    ctx.log.info(
        "Interaction executed successfully",
        interaction_id=req.interaction_id,
        target_kind=target.kind,
        target_id=target_id,
        success=result_dict["success"]
    )

    # Convert dict back to response model
    return ExecuteInteractionResponse(
        success=result_dict["success"],
        message=result_dict.get("message"),
        statDeltas=result_dict.get("stat_deltas"),
        flagChanges=result_dict.get("flag_changes"),
        inventoryChanges=result_dict.get("inventory_changes"),
        launchedSceneId=result_dict.get("launched_scene_id"),
        generationRequestId=result_dict.get("generation_request_id"),
        updatedSession=result_dict.get("updated_session"),
        timestamp=result_dict["timestamp"],
    )
