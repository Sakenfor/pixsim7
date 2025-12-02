from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ValidationError

from pixsim7.backend.main.api.dependencies import CurrentUser, GameWorldSvc
from pixsim7.backend.main.domain.game.schemas import (
    WorldMetaSchemas,
    RelationshipTierSchema,
    detect_tier_gaps,
    CURRENT_SCHEMA_VERSION,
    auto_migrate_schema,
)


router = APIRouter()


class GameWorldSummary(BaseModel):
    id: int
    name: str


class PaginatedWorldsResponse(BaseModel):
    worlds: List[GameWorldSummary]
    total: int
    offset: int
    limit: int


class GameWorldDetail(BaseModel):
    id: int
    name: str
    meta: Optional[Dict[str, Any]] = None
    world_time: float


class CreateWorldRequest(BaseModel):
    name: str
    meta: Optional[Dict[str, Any]] = None


class AdvanceWorldTimeRequest(BaseModel):
    delta_seconds: float


class UpdateWorldMetaRequest(BaseModel):
    meta: Dict[str, Any]


async def _get_owned_world(world_id: int, user: CurrentUser, game_world_service: GameWorldSvc):
    """Fetch a world and ensure the requesting user owns it."""

    world = await game_world_service.get_world(world_id)
    if not world or world.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="World not found")
    return world


async def _build_world_detail(
    world,
    game_world_service: GameWorldSvc,
    *,
    state=None,
) -> GameWorldDetail:
    """Serialize a world with its current global time."""

    world_state = state or await game_world_service.get_world_state(world.id)
    world_time = world_state.world_time if world_state else 0.0
    return GameWorldDetail(id=world.id, name=world.name, meta=world.meta, world_time=world_time)


@router.get("/", response_model=PaginatedWorldsResponse)
async def list_worlds(
    game_world_service: GameWorldSvc,
    user: CurrentUser,
    offset: int = 0,
    limit: int = 100,
) -> PaginatedWorldsResponse:
    """
    List game worlds owned by the current user with pagination.

    Args:
        offset: Number of records to skip (default: 0)
        limit: Maximum records to return (default: 100, max: 1000)
    """
    from sqlalchemy import select, func
    from pixsim7.backend.main.domain.game.models import GameWorld

    # Clamp limit to reasonable range
    limit = min(max(1, limit), 1000)

    # Get total count
    count_result = await game_world_service.db.execute(
        select(func.count()).select_from(GameWorld).where(GameWorld.owner_user_id == user.id)
    )
    total = count_result.scalar_one()

    # Get paginated results
    result = await game_world_service.db.execute(
        select(GameWorld)
        .where(GameWorld.owner_user_id == user.id)
        .order_by(GameWorld.id)
        .offset(offset)
        .limit(limit)
    )
    worlds = list(result.scalars().all())

    return PaginatedWorldsResponse(
        worlds=[GameWorldSummary(id=w.id, name=w.name) for w in worlds],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post("/", response_model=GameWorldDetail)
async def create_world(
    req: CreateWorldRequest,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> GameWorldDetail:
    """
    Create a new game world for the current user.
    """
    # Validate world-level schemas inside meta (if present)
    if req.meta is not None:
        try:
            WorldMetaSchemas.parse_obj(req.meta)
        except ValidationError as e:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "invalid_world_schemas",
                    "details": e.errors(),
                },
            )

    world = await game_world_service.create_world(
        owner_user_id=user.id,
        name=req.name,
        meta=req.meta or {},
    )
    state = await game_world_service.get_world_state(world.id)
    return await _build_world_detail(world, game_world_service, state=state)


@router.get("/{world_id}", response_model=GameWorldDetail)
async def get_world(
    world_id: int,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> GameWorldDetail:
    """
    Get a world and its current global time.
    """
    world = await _get_owned_world(world_id, user, game_world_service)
    return await _build_world_detail(world, game_world_service)


@router.post("/{world_id}/advance", response_model=GameWorldDetail)
async def advance_world_time(
    world_id: int,
    req: AdvanceWorldTimeRequest,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> GameWorldDetail:
    """
    Manually advance global world time for a world.

    This is primarily intended for development and editor tools; production
    environments may advance time via background jobs instead.
    """
    world = await _get_owned_world(world_id, user, game_world_service)

    try:
        state = await game_world_service.advance_world_time(
            world_id=world_id,
            delta_seconds=req.delta_seconds,
        )
    except ValueError as e:
        if str(e) == "world_not_found":
            raise HTTPException(status_code=404, detail="World not found")
        raise

    return await _build_world_detail(world, game_world_service, state=state)


@router.put("/{world_id}/meta", response_model=GameWorldDetail)
async def update_world_meta(
    world_id: int,
    req: UpdateWorldMetaRequest,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> GameWorldDetail:
    """
    Update the metadata for a game world.

    This allows designers to configure per-world settings like HUD layouts,
    enabled plugins, and other UI/UX customizations.

    Also validates relationship/intimacy schemas stored in meta to prevent
    invalid configurations from breaking relationship computations.
    """
    await _get_owned_world(world_id, user, game_world_service)

    try:
        WorldMetaSchemas.parse_obj(req.meta)
    except ValidationError as e:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_world_schemas",
                "details": e.errors(),
            },
        )

    # Update the world metadata
    updated_world = await game_world_service.update_world_meta(world_id, req.meta)

    # Get current world time
    return await _build_world_detail(updated_world, game_world_service)


def generate_migration_suggestions(errors: List[str]) -> List[str]:
    """Generate actionable migration suggestions based on validation errors."""
    suggestions = []

    for error in errors:
        if 'max' in error and 'must be >=' in error and 'min' in error:
            suggestions.append('Swap min and max values, or adjust thresholds')
        elif 'Duplicate' in error:
            suggestions.append('Rename duplicate IDs to be unique')
        elif 'Overlapping' in error or 'overlap' in error:
            suggestions.append('Adjust tier ranges to eliminate overlaps')
        elif 'cannot be empty' in error:
            suggestions.append('Provide a valid non-empty ID')
        elif 'must be between 0 and 100' in error:
            suggestions.append('Adjust values to be within valid range (0-100)')
        elif 'at least one threshold' in error:
            suggestions.append('Add at least one threshold value for the intimacy level')

    # Add generic suggestion if no specific ones matched
    if not suggestions and errors:
        suggestions.append('Review the error messages and adjust schema configuration')

    return suggestions


class WorldSchemaValidationResult(BaseModel):
    """Result of schema validation for a single world."""
    world_id: int
    world_name: str
    is_valid: bool
    errors: List[str] = []
    warnings: List[str] = []
    suggestions: List[str] = []


class BatchValidationResponse(BaseModel):
    """Response for batch validation containing summary and individual results."""
    total_worlds: int
    valid_worlds: int
    invalid_worlds: int
    results: List[WorldSchemaValidationResult]


@router.get("/debug/validate-schemas", response_model=BatchValidationResponse)
async def validate_all_world_schemas(
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> BatchValidationResponse:
    """
    Development endpoint to validate schemas for all worlds owned by the current user.

    Returns validation results for each world, identifying any that have invalid
    relationship_schemas or intimacy_schema configurations. Also includes warnings
    for potential issues (like gaps in tier coverage) and suggestions for fixing
    validation errors.
    """
    worlds = await game_world_service.list_worlds_for_user(owner_user_id=user.id)
    results = []

    for world in worlds:
        errors = []
        warnings = []
        suggestions = []
        is_valid = True

        if not world.meta:
            # No meta means no schemas to validate - this is valid
            results.append(
                WorldSchemaValidationResult(
                    world_id=world.id,
                    world_name=world.name,
                    is_valid=True,
                )
            )
            continue

        try:
            # Validate schemas
            WorldMetaSchemas.parse_obj(world.meta)

            # Check for gaps (warnings only)
            if 'relationship_schemas' in world.meta:
                for schema_key, tiers_data in world.meta['relationship_schemas'].items():
                    try:
                        tier_schemas = [RelationshipTierSchema.parse_obj(t) for t in tiers_data]
                        gaps = detect_tier_gaps(tier_schemas)
                        if gaps:
                            warnings.extend([f"[{schema_key}] {gap}" for gap in gaps])
                    except Exception:
                        # If tier parsing fails, it will be caught in the main validation
                        pass

        except ValidationError as e:
            is_valid = False
            # Convert Pydantic errors to readable strings
            errors = [f"{'.'.join(str(loc) for loc in err['loc'])}: {err['msg']}" for err in e.errors()]
            suggestions = generate_migration_suggestions(errors)

        results.append(
            WorldSchemaValidationResult(
                world_id=world.id,
                world_name=world.name,
                is_valid=is_valid,
                errors=errors,
                warnings=warnings,
                suggestions=suggestions,
            )
        )

    valid_count = sum(1 for r in results if r.is_valid)

    return BatchValidationResponse(
        total_worlds=len(results),
        valid_worlds=valid_count,
        invalid_worlds=len(results) - valid_count,
        results=results,
    )


class SchemaHealth(BaseModel):
    """Health status for a specific schema type."""
    schema_type: str  # "relationship", "intimacy", "mood", "reputation"
    is_valid: bool
    entry_count: int
    errors: List[str] = []
    warnings: List[str] = []
    suggestions: List[str] = []


class WorldSchemaReport(BaseModel):
    """Detailed schema validation report for a single world."""
    world_id: int
    world_name: str
    overall_valid: bool
    schema_health: List[SchemaHealth]


@router.get("/{world_id}/schema-report", response_model=WorldSchemaReport)
async def get_world_schema_report(
    world_id: int,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> WorldSchemaReport:
    """
    Generate detailed schema validation report for a single world.

    Provides per-schema-type health information including:
    - Validation status
    - Entry counts
    - Specific errors and warnings
    - Migration suggestions
    """
    world = await _get_owned_world(world_id, user, game_world_service)
    schema_health = []

    if not world.meta:
        return WorldSchemaReport(
            world_id=world.id,
            world_name=world.name,
            overall_valid=True,
            schema_health=[],
        )

    # Validate relationship schemas
    if 'relationship_schemas' in world.meta:
        for schema_key, tiers_data in world.meta['relationship_schemas'].items():
            errors = []
            warnings = []
            suggestions = []
            is_valid = True
            entry_count = len(tiers_data)

            try:
                tier_schemas = [RelationshipTierSchema.parse_obj(t) for t in tiers_data]

                # Check for duplicates and overlaps (these are caught by WorldMetaSchemas)
                try:
                    from pixsim7.backend.main.domain.game.schemas import detect_tier_overlaps
                    overlaps = detect_tier_overlaps(tier_schemas)
                    if overlaps:
                        errors.extend(overlaps)
                        is_valid = False
                except Exception:
                    pass

                # Check for gaps (warnings)
                gaps = detect_tier_gaps(tier_schemas)
                if gaps:
                    warnings.extend(gaps)

            except ValidationError as e:
                is_valid = False
                errors = [f"{'.'.join(str(loc) for loc in err['loc'])}: {err['msg']}" for err in e.errors()]
                suggestions = generate_migration_suggestions(errors)

            schema_health.append(
                SchemaHealth(
                    schema_type=f"relationship:{schema_key}",
                    is_valid=is_valid,
                    entry_count=entry_count,
                    errors=errors,
                    warnings=warnings,
                    suggestions=suggestions,
                )
            )

    # Validate intimacy schema
    if 'intimacy_schema' in world.meta:
        errors = []
        warnings = []
        suggestions = []
        is_valid = True
        entry_count = 0

        intimacy_data = world.meta['intimacy_schema']
        if isinstance(intimacy_data, dict) and 'levels' in intimacy_data:
            entry_count = len(intimacy_data['levels'])

        try:
            from pixsim7.backend.main.domain.game.schemas import IntimacySchema
            IntimacySchema.parse_obj(intimacy_data)
        except ValidationError as e:
            is_valid = False
            errors = [f"{'.'.join(str(loc) for loc in err['loc'])}: {err['msg']}" for err in e.errors()]
            suggestions = generate_migration_suggestions(errors)

        schema_health.append(
            SchemaHealth(
                schema_type="intimacy",
                is_valid=is_valid,
                entry_count=entry_count,
                errors=errors,
                warnings=warnings,
                suggestions=suggestions,
            )
        )

    # Validate mood schema
    if 'npc_mood_schema' in world.meta:
        errors = []
        warnings = []
        suggestions = []
        is_valid = True
        entry_count = 0

        mood_data = world.meta['npc_mood_schema']

        # Count entries
        if isinstance(mood_data, dict):
            if 'moods' in mood_data:
                entry_count += len(mood_data['moods'])
            if 'general' in mood_data and isinstance(mood_data['general'], dict):
                for moods_list in mood_data['general'].values():
                    if isinstance(moods_list, list):
                        entry_count += len(moods_list)
            if 'intimate' in mood_data and isinstance(mood_data['intimate'], dict):
                for moods_list in mood_data['intimate'].values():
                    if isinstance(moods_list, list):
                        entry_count += len(moods_list)

        try:
            from pixsim7.backend.main.domain.game.schemas import MoodSchemaConfig
            MoodSchemaConfig.parse_obj(mood_data)
        except ValidationError as e:
            is_valid = False
            errors = [f"{'.'.join(str(loc) for loc in err['loc'])}: {err['msg']}" for err in e.errors()]
            suggestions = generate_migration_suggestions(errors)

        schema_health.append(
            SchemaHealth(
                schema_type="mood",
                is_valid=is_valid,
                entry_count=entry_count,
                errors=errors,
                warnings=warnings,
                suggestions=suggestions,
            )
        )

    # Validate reputation schemas
    if 'reputation_schemas' in world.meta:
        for schema_key, reputation_data in world.meta['reputation_schemas'].items():
            errors = []
            warnings = []
            suggestions = []
            is_valid = True
            entry_count = 0

            if isinstance(reputation_data, dict) and 'bands' in reputation_data:
                entry_count = len(reputation_data['bands'])

            try:
                from pixsim7.backend.main.domain.game.schemas import ReputationSchemaConfig
                ReputationSchemaConfig.parse_obj(reputation_data)
            except ValidationError as e:
                is_valid = False
                errors = [f"{'.'.join(str(loc) for loc in err['loc'])}: {err['msg']}" for err in e.errors()]
                suggestions = generate_migration_suggestions(errors)

            schema_health.append(
                SchemaHealth(
                    schema_type=f"reputation:{schema_key}",
                    is_valid=is_valid,
                    entry_count=entry_count,
                    errors=errors,
                    warnings=warnings,
                    suggestions=suggestions,
                )
            )

    overall_valid = all(h.is_valid for h in schema_health)

    return WorldSchemaReport(
        world_id=world.id,
        world_name=world.name,
        overall_valid=overall_valid,
        schema_health=schema_health,
    )


# Phase 16: Schema Migration Helpers


class SchemaDiff(BaseModel):
    """Differences between old and new schema configurations."""
    added_ids: List[str] = []
    removed_ids: List[str] = []
    changed_ranges: Dict[str, Dict[str, Any]] = {}


def diff_relationship_schemas(
    old_tiers: List[RelationshipTierSchema],
    new_tiers: List[RelationshipTierSchema]
) -> SchemaDiff:
    """Detect differences between old and new tier schemas."""
    old_ids = {t.id for t in old_tiers}
    new_ids = {t.id for t in new_tiers}

    diff = SchemaDiff(
        added_ids=list(new_ids - old_ids),
        removed_ids=list(old_ids - new_ids)
    )

    # Detect changed ranges for existing IDs
    for tier_id in old_ids & new_ids:
        old_tier = next(t for t in old_tiers if t.id == tier_id)
        new_tier = next(t for t in new_tiers if t.id == tier_id)

        if old_tier.min != new_tier.min or old_tier.max != new_tier.max:
            diff.changed_ranges[tier_id] = {
                'old': {'min': old_tier.min, 'max': old_tier.max},
                'new': {'min': new_tier.min, 'max': new_tier.max}
            }

    return diff


class SchemaEvolutionRequest(BaseModel):
    """Request to evolve world schemas with validation."""
    new_schemas: Dict[str, Any]
    dry_run: bool = True


class SchemaEvolutionResponse(BaseModel):
    """Response from schema evolution analysis."""
    is_safe: bool
    diff: Optional[SchemaDiff] = None
    warnings: List[str] = []
    changes_applied: bool = False


@router.post("/{world_id}/evolve-schemas", response_model=SchemaEvolutionResponse)
async def evolve_world_schemas(
    world_id: int,
    req: SchemaEvolutionRequest,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> SchemaEvolutionResponse:
    """
    Safely evolve world schemas with migration planning.

    In dry_run mode (default), only analyzes impact without making changes.
    Set dry_run=false to apply changes if they are safe (no removed IDs).

    A schema change is considered "safe" if:
    - No tier/level IDs are removed (would break existing sessions)
    - All new schemas pass validation

    For breaking changes, manual migration is required.
    """
    world = await _get_owned_world(world_id, user, game_world_service)

    # Validate new schemas
    try:
        WorldMetaSchemas.parse_obj(req.new_schemas)
    except ValidationError as e:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_new_schemas",
                "details": e.errors(),
            }
        )

    warnings = []
    diff = None
    is_safe = True

    # Diff relationship schemas if both old and new have them
    if world.meta and 'relationship_schemas' in world.meta and 'relationship_schemas' in req.new_schemas:
        # For simplicity, just check the 'default' schema
        if 'default' in world.meta.get('relationship_schemas', {}) and 'default' in req.new_schemas.get('relationship_schemas', {}):
            old_tiers = [RelationshipTierSchema.parse_obj(t) for t in world.meta['relationship_schemas']['default']]
            new_tiers = [RelationshipTierSchema.parse_obj(t) for t in req.new_schemas['relationship_schemas']['default']]

            diff = diff_relationship_schemas(old_tiers, new_tiers)

            # Check if safe (no removed IDs)
            if diff.removed_ids:
                is_safe = False
                warnings.append(f"Breaking change: {len(diff.removed_ids)} tier IDs removed: {diff.removed_ids}")
                warnings.append("Manual migration required for existing sessions using these tiers")

            if diff.added_ids:
                warnings.append(f"New tiers added: {diff.added_ids}")

            if diff.changed_ranges:
                warnings.append(f"Tier ranges changed for: {list(diff.changed_ranges.keys())}")
                warnings.append("Existing session relationships may need recomputation")

    # Apply changes if not dry run and is safe
    changes_applied = False
    if not req.dry_run and is_safe:
        await game_world_service.update_world_meta(world_id, req.new_schemas)
        changes_applied = True
        warnings.append("Schema changes applied successfully")
    elif not req.dry_run and not is_safe:
        warnings.append("Changes NOT applied due to breaking changes (removed IDs)")

    return SchemaEvolutionResponse(
        is_safe=is_safe,
        diff=diff,
        warnings=warnings,
        changes_applied=changes_applied,
    )


# Phase 19: Schema Versioning and Migration


class SchemaMigrationResponse(BaseModel):
    """Response from schema migration."""
    old_version: int
    new_version: int
    success: bool
    message: str


@router.post("/{world_id}/migrate-schema", response_model=SchemaMigrationResponse)
async def migrate_world_schema(
    world_id: int,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> SchemaMigrationResponse:
    """
    Automatically migrate world schema to latest version.

    This endpoint applies any necessary schema migrations to bring the world's
    metadata schemas up to the current version. Safe to call multiple times.

    Returns the old and new version numbers.
    """
    world = await _get_owned_world(world_id, user, game_world_service)

    if not world.meta:
        raise HTTPException(status_code=400, detail="No schema to migrate")

    old_version = world.meta.get('schema_version', 1)

    if old_version >= CURRENT_SCHEMA_VERSION:
        return SchemaMigrationResponse(
            old_version=old_version,
            new_version=old_version,
            success=True,
            message="Schema already up to date"
        )

    # Migrate
    new_meta = auto_migrate_schema(world.meta.copy())

    # Validate migrated schema
    try:
        WorldMetaSchemas.parse_obj(new_meta)
    except ValidationError as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "migration_failed_validation",
                "details": e.errors(),
            }
        )

    # Apply migration
    await game_world_service.update_world_meta(world_id, new_meta)

    return SchemaMigrationResponse(
        old_version=old_version,
        new_version=new_meta['schema_version'],
        success=True,
        message=f"Schema migrated from version {old_version} to {new_meta['schema_version']}"
    )


# Phase 21: World Simulation Scheduler Control


class SchedulerStatsResponse(BaseModel):
    """Scheduler statistics for a world."""
    world_id: int
    current_world_time: float
    ticks_processed: int
    npcs_per_tier: Dict[str, int]
    last_tick_duration_ms: float
    average_tick_duration_ms: float
    config: Dict[str, Any]


class UpdateSchedulerConfigRequest(BaseModel):
    """Request to update scheduler configuration."""
    timeScale: Optional[float] = None
    maxNpcTicksPerStep: Optional[int] = None
    maxJobOpsPerStep: Optional[int] = None
    tickIntervalSeconds: Optional[float] = None
    pauseSimulation: Optional[bool] = None


@router.get("/{world_id}/scheduler/config", response_model=Dict[str, Any])
async def get_scheduler_config(
    world_id: int,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> Dict[str, Any]:
    """
    Get current scheduler configuration for a world.

    Returns the simulation config from GameWorld.meta.simulation,
    or default config if not set.
    """
    world = await _get_owned_world(world_id, user, game_world_service)

    if world.meta and "simulation" in world.meta:
        return world.meta["simulation"]
    else:
        # Return default config
        from pixsim7.backend.main.domain.game.schemas import get_default_world_scheduler_config
        return get_default_world_scheduler_config()


@router.put("/{world_id}/scheduler/config", response_model=Dict[str, Any])
async def update_scheduler_config(
    world_id: int,
    req: UpdateSchedulerConfigRequest,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> Dict[str, Any]:
    """
    Update scheduler configuration for a world.

    Allows runtime adjustment of:
    - timeScale: Game time multiplier
    - maxNpcTicksPerStep: NPC simulation budget
    - maxJobOpsPerStep: Generation job budget
    - tickIntervalSeconds: Real-time tick interval
    - pauseSimulation: Pause/resume flag

    Only specified fields are updated (partial update).
    """
    world = await _get_owned_world(world_id, user, game_world_service)

    # Get current config or default
    from pixsim7.backend.main.domain.game.schemas import (
        get_default_world_scheduler_config,
        WorldSchedulerConfigSchema,
    )

    current_config = {}
    if world.meta and "simulation" in world.meta:
        current_config = world.meta["simulation"]
    else:
        current_config = get_default_world_scheduler_config()

    # Apply updates
    updates = req.dict(exclude_unset=True)
    for key, value in updates.items():
        current_config[key] = value

    # Business logic validation
    if "timeScale" in updates and updates["timeScale"] <= 0:
        raise HTTPException(
            status_code=400,
            detail="timeScale must be positive"
        )

    if "maxNpcTicksPerStep" in updates and updates["maxNpcTicksPerStep"] < 0:
        raise HTTPException(
            status_code=400,
            detail="maxNpcTicksPerStep cannot be negative"
        )

    if "maxJobOpsPerStep" in updates and updates["maxJobOpsPerStep"] < 0:
        raise HTTPException(
            status_code=400,
            detail="maxJobOpsPerStep cannot be negative"
        )

    if "tickIntervalSeconds" in updates and updates["tickIntervalSeconds"] <= 0:
        raise HTTPException(
            status_code=400,
            detail="tickIntervalSeconds must be positive"
        )

    # Validate updated config
    try:
        WorldSchedulerConfigSchema(**current_config)
    except ValidationError as e:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_scheduler_config",
                "details": e.errors(),
            }
        )

    # Update world meta
    new_meta = world.meta.copy() if world.meta else {}
    new_meta["simulation"] = current_config

    await game_world_service.update_world_meta(world_id, new_meta)

    return current_config


@router.post("/{world_id}/scheduler/pause")
async def pause_simulation(
    world_id: int,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> Dict[str, str]:
    """
    Pause simulation for a world.

    Sets pauseSimulation=true in the scheduler config.
    The scheduler will stop advancing world_time and processing ticks.
    """
    await _get_owned_world(world_id, user, game_world_service)

    await update_scheduler_config(
        world_id,
        UpdateSchedulerConfigRequest(pauseSimulation=True),
        game_world_service,
        user,
    )

    return {"status": "paused", "world_id": str(world_id)}


@router.post("/{world_id}/scheduler/resume")
async def resume_simulation(
    world_id: int,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> Dict[str, str]:
    """
    Resume simulation for a world.

    Sets pauseSimulation=false in the scheduler config.
    The scheduler will resume advancing world_time and processing ticks.
    """
    await _get_owned_world(world_id, user, game_world_service)

    await update_scheduler_config(
        world_id,
        UpdateSchedulerConfigRequest(pauseSimulation=False),
        game_world_service,
        user,
    )

    return {"status": "resumed", "world_id": str(world_id)}
