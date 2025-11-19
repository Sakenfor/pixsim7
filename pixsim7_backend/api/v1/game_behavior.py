"""
Behavior System API Routes

Provides endpoints for managing NPC behavior configurations:
- Activity catalog CRUD
- Routine graph CRUD
- NPC preferences management
- Behavior config validation
- Activity simulation/preview
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ValidationError

from pixsim7_backend.api.dependencies import CurrentUser, GameWorldSvc
from pixsim7_backend.domain.game.schemas import (
    BehaviorConfigSchema,
    ActivitySchema,
    RoutineGraphSchema,
    NpcPreferencesSchema,
    auto_migrate_behavior_config,
)
from pixsim7_backend.domain.behavior import (
    calculate_activity_score,
    score_and_filter_activities,
    choose_activity,
    merge_preferences,
)


router = APIRouter()


# ==================
# Request/Response Models
# ==================


class BehaviorConfigResponse(BaseModel):
    """Response model for behavior config."""
    version: int
    activityCategories: Optional[Dict] = None
    activities: Optional[Dict] = None
    routines: Optional[Dict] = None
    scoringConfig: Optional[Dict] = None
    simulationConfig: Optional[Dict] = None
    customConditionEvaluators: Optional[Dict] = None
    customEffectHandlers: Optional[Dict] = None
    presets: Optional[Dict] = None
    meta: Optional[Dict] = None


class UpdateBehaviorConfigRequest(BaseModel):
    """Request to update behavior config."""
    config: Dict[str, Any]


class CreateActivityRequest(BaseModel):
    """Request to create a new activity."""
    activity: Dict[str, Any]


class UpdateActivityRequest(BaseModel):
    """Request to update an activity."""
    activity: Dict[str, Any]


class CreateRoutineRequest(BaseModel):
    """Request to create a new routine graph."""
    routine: Dict[str, Any]


class UpdateRoutineRequest(BaseModel):
    """Request to update a routine graph."""
    routine: Dict[str, Any]


class ValidateBehaviorConfigRequest(BaseModel):
    """Request to validate behavior config."""
    config: Dict[str, Any]


class ValidationResult(BaseModel):
    """Result of behavior config validation."""
    is_valid: bool
    errors: List[str] = []
    warnings: List[str] = []


class ActivityPreviewRequest(BaseModel):
    """Request to preview activity selection for an NPC."""
    npc_id: int
    session_id: int
    candidate_activity_ids: Optional[List[str]] = None  # If None, use all activities


class ActivityPreviewResponse(BaseModel):
    """Response for activity preview."""
    selected_activity_id: Optional[str]
    scores: Dict[str, float]  # activity_id -> score
    npc_state: Dict[str, Any]


# ==================
# Helper Functions
# ==================


async def _get_owned_world(world_id: int, user: CurrentUser, game_world_service: GameWorldSvc):
    """Fetch a world and ensure the requesting user owns it."""
    world = await game_world_service.get_world(world_id)
    if not world or world.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="World not found")
    return world


def _get_behavior_config(world) -> Dict[str, Any]:
    """Extract behavior config from world meta."""
    meta = world.meta or {}
    return meta.get("behavior", {})


def _set_behavior_config(world, behavior_config: Dict[str, Any]):
    """Set behavior config in world meta."""
    if not hasattr(world, "meta") or world.meta is None:
        world.meta = {}
    world.meta["behavior"] = behavior_config


# ==================
# Endpoints
# ==================


@router.get("/{world_id}/behavior", response_model=BehaviorConfigResponse)
async def get_behavior_config(
    world_id: int,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> BehaviorConfigResponse:
    """
    Get behavior configuration for a world.
    """
    world = await _get_owned_world(world_id, user, game_world_service)
    behavior_config = _get_behavior_config(world)

    # Auto-migrate if needed
    if behavior_config:
        behavior_config = auto_migrate_behavior_config(behavior_config)

    return BehaviorConfigResponse(**behavior_config) if behavior_config else BehaviorConfigResponse(version=1)


@router.put("/{world_id}/behavior", response_model=BehaviorConfigResponse)
async def update_behavior_config(
    world_id: int,
    req: UpdateBehaviorConfigRequest,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> BehaviorConfigResponse:
    """
    Update behavior configuration for a world.

    Validates the entire config before saving.
    """
    world = await _get_owned_world(world_id, user, game_world_service)

    # Validate behavior config
    try:
        BehaviorConfigSchema.parse_obj(req.config)
    except ValidationError as e:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_behavior_config",
                "details": e.errors(),
            },
        )

    # Update world meta with behavior config
    meta = world.meta or {}
    meta["behavior"] = req.config

    updated_world = await game_world_service.update_world_meta(world_id, meta)

    behavior_config = _get_behavior_config(updated_world)
    return BehaviorConfigResponse(**behavior_config)


@router.post("/{world_id}/behavior/validate", response_model=ValidationResult)
async def validate_behavior_config(
    world_id: int,
    req: ValidateBehaviorConfigRequest,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> ValidationResult:
    """
    Validate behavior configuration without saving it.

    Returns validation errors and warnings.
    """
    await _get_owned_world(world_id, user, game_world_service)

    errors = []
    warnings = []

    try:
        BehaviorConfigSchema.parse_obj(req.config)
    except ValidationError as e:
        for error in e.errors():
            loc = " -> ".join(str(x) for x in error["loc"])
            msg = error["msg"]
            errors.append(f"{loc}: {msg}")

    # Check for potential warnings
    config = req.config
    if config.get("activities") and not config.get("activityCategories"):
        warnings.append("Activities defined but no activity categories")

    if config.get("routines") and not config.get("activities"):
        warnings.append("Routines defined but no activities")

    return ValidationResult(
        is_valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
    )


# ==================
# Activity Catalog Endpoints
# ==================


@router.post("/{world_id}/behavior/activities", response_model=Dict[str, Any])
async def create_activity(
    world_id: int,
    req: CreateActivityRequest,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> Dict[str, Any]:
    """
    Create a new activity in the catalog.
    """
    world = await _get_owned_world(world_id, user, game_world_service)

    # Validate activity
    try:
        ActivitySchema.parse_obj(req.activity)
    except ValidationError as e:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_activity",
                "details": e.errors(),
            },
        )

    activity_id = req.activity.get("id")
    if not activity_id:
        raise HTTPException(status_code=400, detail="Activity ID is required")

    behavior_config = _get_behavior_config(world)
    if not behavior_config:
        behavior_config = {"version": 1}

    if "activities" not in behavior_config:
        behavior_config["activities"] = {}

    # Check if activity already exists
    if activity_id in behavior_config["activities"]:
        raise HTTPException(status_code=409, detail=f"Activity {activity_id} already exists")

    behavior_config["activities"][activity_id] = req.activity

    # Update world meta
    meta = world.meta or {}
    meta["behavior"] = behavior_config
    await game_world_service.update_world_meta(world_id, meta)

    return req.activity


@router.put("/{world_id}/behavior/activities/{activity_id}", response_model=Dict[str, Any])
async def update_activity(
    world_id: int,
    activity_id: str,
    req: UpdateActivityRequest,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> Dict[str, Any]:
    """
    Update an existing activity.
    """
    world = await _get_owned_world(world_id, user, game_world_service)

    # Validate activity
    try:
        ActivitySchema.parse_obj(req.activity)
    except ValidationError as e:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_activity",
                "details": e.errors(),
            },
        )

    behavior_config = _get_behavior_config(world)
    if not behavior_config or "activities" not in behavior_config:
        raise HTTPException(status_code=404, detail="No activities found")

    if activity_id not in behavior_config["activities"]:
        raise HTTPException(status_code=404, detail=f"Activity {activity_id} not found")

    behavior_config["activities"][activity_id] = req.activity

    # Update world meta
    meta = world.meta or {}
    meta["behavior"] = behavior_config
    await game_world_service.update_world_meta(world_id, meta)

    return req.activity


@router.delete("/{world_id}/behavior/activities/{activity_id}")
async def delete_activity(
    world_id: int,
    activity_id: str,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
):
    """
    Delete an activity from the catalog.
    """
    world = await _get_owned_world(world_id, user, game_world_service)

    behavior_config = _get_behavior_config(world)
    if not behavior_config or "activities" not in behavior_config:
        raise HTTPException(status_code=404, detail="No activities found")

    if activity_id not in behavior_config["activities"]:
        raise HTTPException(status_code=404, detail=f"Activity {activity_id} not found")

    del behavior_config["activities"][activity_id]

    # Update world meta
    meta = world.meta or {}
    meta["behavior"] = behavior_config
    await game_world_service.update_world_meta(world_id, meta)

    return {"deleted": activity_id}


# ==================
# Routine Graph Endpoints
# ==================


@router.post("/{world_id}/behavior/routines", response_model=Dict[str, Any])
async def create_routine(
    world_id: int,
    req: CreateRoutineRequest,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> Dict[str, Any]:
    """
    Create a new routine graph.
    """
    world = await _get_owned_world(world_id, user, game_world_service)

    # Validate routine
    try:
        RoutineGraphSchema.parse_obj(req.routine)
    except ValidationError as e:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_routine",
                "details": e.errors(),
            },
        )

    routine_id = req.routine.get("id")
    if not routine_id:
        raise HTTPException(status_code=400, detail="Routine ID is required")

    behavior_config = _get_behavior_config(world)
    if not behavior_config:
        behavior_config = {"version": 1}

    if "routines" not in behavior_config:
        behavior_config["routines"] = {}

    if routine_id in behavior_config["routines"]:
        raise HTTPException(status_code=409, detail=f"Routine {routine_id} already exists")

    behavior_config["routines"][routine_id] = req.routine

    # Update world meta
    meta = world.meta or {}
    meta["behavior"] = behavior_config
    await game_world_service.update_world_meta(world_id, meta)

    return req.routine


@router.put("/{world_id}/behavior/routines/{routine_id}", response_model=Dict[str, Any])
async def update_routine(
    world_id: int,
    routine_id: str,
    req: UpdateRoutineRequest,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> Dict[str, Any]:
    """
    Update an existing routine graph.
    """
    world = await _get_owned_world(world_id, user, game_world_service)

    # Validate routine
    try:
        RoutineGraphSchema.parse_obj(req.routine)
    except ValidationError as e:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_routine",
                "details": e.errors(),
            },
        )

    behavior_config = _get_behavior_config(world)
    if not behavior_config or "routines" not in behavior_config:
        raise HTTPException(status_code=404, detail="No routines found")

    if routine_id not in behavior_config["routines"]:
        raise HTTPException(status_code=404, detail=f"Routine {routine_id} not found")

    behavior_config["routines"][routine_id] = req.routine

    # Update world meta
    meta = world.meta or {}
    meta["behavior"] = behavior_config
    await game_world_service.update_world_meta(world_id, meta)

    return req.routine


@router.delete("/{world_id}/behavior/routines/{routine_id}")
async def delete_routine(
    world_id: int,
    routine_id: str,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
):
    """
    Delete a routine graph.
    """
    world = await _get_owned_world(world_id, user, game_world_service)

    behavior_config = _get_behavior_config(world)
    if not behavior_config or "routines" not in behavior_config:
        raise HTTPException(status_code=404, detail="No routines found")

    if routine_id not in behavior_config["routines"]:
        raise HTTPException(status_code=404, detail=f"Routine {routine_id} not found")

    del behavior_config["routines"][routine_id]

    # Update world meta
    meta = world.meta or {}
    meta["behavior"] = behavior_config
    await game_world_service.update_world_meta(world_id, meta)

    return {"deleted": routine_id}


# ==================
# Activity Preview/Simulation Endpoint
# ==================


@router.post("/{world_id}/behavior/preview-activity", response_model=ActivityPreviewResponse)
async def preview_activity_selection(
    world_id: int,
    req: ActivityPreviewRequest,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> ActivityPreviewResponse:
    """
    Preview which activity an NPC would choose given current state.

    This is useful for debugging and tuning activity scores.
    """
    world = await _get_owned_world(world_id, user, game_world_service)

    # TODO: Get NPC, session, and state from services
    # For now, return mock response

    return ActivityPreviewResponse(
        selected_activity_id="activity:work_office",
        scores={
            "activity:work_office": 0.8,
            "activity:socialize": 0.5,
            "activity:rest": 0.3,
        },
        npc_state={
            "energy": 50,
            "moodState": {"valence": 0, "arousal": 0, "tags": ["neutral"]},
        },
    )
