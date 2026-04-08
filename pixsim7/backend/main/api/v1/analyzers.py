"""
Analyzer API endpoints

Provides discovery of available analyzers (prompt and asset) for frontend configuration.
"""

import re

from fastapi import APIRouter, Query, HTTPException
from typing import Any, List, Optional
from pydantic import BaseModel, Field

from pixsim7.backend.main.api.dependencies import (
    CurrentUser,
    CurrentAdminUser,
    DatabaseSession,
)
from pixsim7.backend.main.domain import User
from pixsim7.backend.main.services.prompt.parser import (
    analyzer_registry,
    AnalyzerTarget,
    AnalyzerKind,
    AnalyzerInputModality,
    AnalyzerTaskFamily,
    get_effective_instance_options,
)
from pixsim7.backend.main.services.analysis.analyzer_instance_service import (
    AnalyzerInstanceService,
    AnalyzerInstanceConfigError,
)
from pixsim7.backend.main.services.analysis.analyzer_definition_service import (
    AnalyzerDefinitionService,
    AnalyzerDefinitionError,
)
from pixsim7.backend.main.services.analysis.analyzer_preset_service import (
    AnalyzerPresetService,
    AnalyzerPresetError,
)
from pixsim7.backend.main.domain.enums import ReviewStatus
from pixsim7.backend.main.services.ownership.user_owned import (
    resolve_user_owned_list_scope,
    resolve_user_owner,
)

router = APIRouter()


class InstanceOptionResponse(BaseModel):
    """Descriptor for a single instance-level option."""
    id: str
    type: str
    label: str
    description: str = ""
    default: Optional[object] = None
    storage: str = "config"


class AnalyzerResponse(BaseModel):
    """Response schema for analyzer info."""
    id: str
    name: str
    description: str
    kind: AnalyzerKind
    target: AnalyzerTarget
    input_modality: AnalyzerInputModality
    task_family: AnalyzerTaskFamily
    provider_id: Optional[str] = None
    model_id: Optional[str] = None
    source_plugin_id: Optional[str] = None
    enabled: bool
    is_default: bool
    instance_options: List[InstanceOptionResponse] = []


class AnalyzersListResponse(BaseModel):
    """Response for list of analyzers."""
    analyzers: List[AnalyzerResponse]
    default_id: str


class AnalysisPointResponse(BaseModel):
    """Runtime analysis point definition."""
    id: str
    label: str
    description: str
    group: str = Field(description="Point group: prompt | asset | system")
    target: Optional[AnalyzerTarget] = Field(
        default=None,
        description="Analyzer target associated with this point (if applicable)",
    )
    control: str = Field(
        description=(
            "Routing control type: prompt_default | image_default | video_default "
            "| intent_override | similarity_threshold"
        )
    )
    intent_key: Optional[str] = Field(
        default=None,
        description="Intent key for intent_override points",
    )
    media_type: Optional[str] = Field(
        default=None,
        description="Media type hint for defaults (image/video)",
    )
    supports_chain: bool = Field(
        default=True,
        description="Whether this point supports ordered analyzer chains",
    )
    source: str = Field(
        default="system",
        description="Point source: system | user | plugin",
    )
    editable: bool = Field(
        default=False,
        description="Whether current user can mutate this analysis point",
    )


class AnalysisPointsListResponse(BaseModel):
    """Response for list of runtime analysis points."""
    analysis_points: List[AnalysisPointResponse]


class CustomAnalysisPointCreate(BaseModel):
    """Create a custom user-defined analysis point."""
    id: Optional[str] = Field(
        default=None,
        max_length=120,
        description="Optional stable point ID suffix (auto-generated if omitted)",
    )
    label: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(default="", max_length=500)
    group: str = Field(default="asset", description="prompt | asset | system")
    target: Optional[str] = Field(default=None, description="prompt | asset")
    control: str = Field(
        ...,
        description=(
            "prompt_default | image_default | video_default | "
            "intent_override | similarity_threshold"
        ),
    )
    intent_key: Optional[str] = Field(default=None, max_length=120)
    media_type: Optional[str] = Field(default=None, description="image | video")
    supports_chain: bool = True
    default_analyzer_ids: Optional[List[str]] = Field(
        default=None,
        description="Optional initial analyzer chain override for this point",
    )


class CustomAnalysisPointUpdate(BaseModel):
    """Patch a custom user-defined analysis point."""
    label: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=500)
    group: Optional[str] = Field(default=None, description="prompt | asset | system")
    target: Optional[str] = Field(default=None, description="prompt | asset")
    control: Optional[str] = Field(
        default=None,
        description=(
            "prompt_default | image_default | video_default | "
            "intent_override | similarity_threshold"
        ),
    )
    intent_key: Optional[str] = Field(default=None, max_length=120)
    media_type: Optional[str] = Field(default=None, description="image | video")
    supports_chain: Optional[bool] = None
    default_analyzer_ids: Optional[List[str]] = Field(
        default=None,
        description="Optional analyzer chain override for this point",
    )


class AnalyzerInstanceCreate(BaseModel):
    """Create a new analyzer instance."""
    analyzer_id: str
    provider_id: Optional[str] = None
    model_id: Optional[str] = None
    label: str
    description: Optional[str] = None
    config: dict = Field(default_factory=dict)
    enabled: bool = True
    priority: int = 0
    on_ingest: bool = False


class AnalyzerInstanceUpdate(BaseModel):
    """Update an analyzer instance."""
    provider_id: Optional[str] = None
    model_id: Optional[str] = None
    label: Optional[str] = None
    description: Optional[str] = None
    config: Optional[dict] = None
    enabled: Optional[bool] = None
    priority: Optional[int] = None
    on_ingest: Optional[bool] = None


class AnalyzerInstanceResponse(BaseModel):
    """Analyzer instance response."""
    id: int
    analyzer_id: str
    provider_id: str
    model_id: Optional[str]
    label: str
    description: Optional[str]
    config: dict
    enabled: bool
    priority: int
    on_ingest: bool
    created_at: str
    updated_at: str


class AnalyzerInstanceListResponse(BaseModel):
    """List analyzer instances."""
    instances: List[AnalyzerInstanceResponse]


class AnalyzerDefinitionCreate(BaseModel):
    """Create a new analyzer definition."""
    analyzer_id: str = Field(
        ...,
        max_length=100,
        description="Analyzer ID (e.g., 'prompt:custom-llm')",
    )
    base_analyzer_id: Optional[str] = Field(
        None,
        max_length=100,
        description="Optional base analyzer ID to inherit presets/config",
    )
    preset_id: Optional[str] = Field(
        None,
        max_length=100,
        description="Optional preset ID to select from the base definition",
    )
    name: str = Field(..., max_length=255, description="Display name")
    description: Optional[str] = Field(None, description="Analyzer description")
    kind: AnalyzerKind
    target: AnalyzerTarget
    input_modality: Optional[AnalyzerInputModality] = None
    task_family: Optional[AnalyzerTaskFamily] = None
    provider_id: Optional[str] = Field(None, max_length=50)
    model_id: Optional[str] = Field(None, max_length=100)
    config: Optional[dict] = Field(default_factory=dict)
    instance_options: List[dict] = Field(default_factory=list)
    enabled: bool = True
    is_default: bool = False


class AnalyzerDefinitionUpdate(BaseModel):
    """Update an analyzer definition."""
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    kind: Optional[AnalyzerKind] = None
    target: Optional[AnalyzerTarget] = None
    input_modality: Optional[AnalyzerInputModality] = None
    task_family: Optional[AnalyzerTaskFamily] = None
    provider_id: Optional[str] = Field(None, max_length=50)
    model_id: Optional[str] = Field(None, max_length=100)
    base_analyzer_id: Optional[str] = Field(None, max_length=100)
    preset_id: Optional[str] = Field(None, max_length=100)
    config: Optional[dict] = None
    instance_options: Optional[List[dict]] = None
    enabled: Optional[bool] = None
    is_default: Optional[bool] = None


class AnalyzerPresetResponse(BaseModel):
    id: int
    analyzer_id: str
    preset_id: str
    name: str
    description: Optional[str]
    config: dict
    status: str
    owner_user_id: int
    owner_ref: Optional[str] = None
    owner_username: Optional[str] = None
    approved_by_user_id: Optional[int]
    approved_at: Optional[str]
    rejected_at: Optional[str]
    rejection_reason: Optional[str]
    created_at: str
    updated_at: str


class AnalyzerPresetListResponse(BaseModel):
    presets: List[AnalyzerPresetResponse]


class AnalyzerPresetCreate(BaseModel):
    analyzer_id: str = Field(..., max_length=100)
    preset_id: str = Field(..., max_length=100)
    name: str = Field(..., max_length=255)
    description: Optional[str] = None
    config: dict = Field(default_factory=dict)


class AnalyzerPresetUpdate(BaseModel):
    preset_id: Optional[str] = Field(None, max_length=100)
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    config: Optional[dict] = None


class AnalyzerPresetReject(BaseModel):
    reason: Optional[str] = None


@router.get("/analysis-points", response_model=AnalysisPointsListResponse)
async def list_analysis_points(
    user: CurrentUser,
    target: Optional[str] = Query(
        None,
        description="Filter by point group: prompt | asset | system",
    ),
):
    """
    List analysis point definitions used by routing/settings UIs.
    """
    points = _list_analysis_points(user=user)

    if target:
        normalized_target = target.strip().lower()
        if normalized_target not in {"prompt", "asset", "system"}:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Invalid target '{target}'. Must be one of: "
                    "'prompt', 'asset', 'system'."
                ),
            )
        points = [point for point in points if point.group == normalized_target]

    return AnalysisPointsListResponse(analysis_points=points)


@router.post("/analysis-points", response_model=AnalysisPointResponse, status_code=201)
async def create_custom_analysis_point(
    data: CustomAnalysisPointCreate,
    user: CurrentUser,
    db: DatabaseSession,
):
    """Create a user-defined custom analysis point."""
    user_record = await db.get(User, user.id)
    if not user_record:
        raise HTTPException(status_code=404, detail="User not found")

    preferences = user_record.preferences if isinstance(user_record.preferences, dict) else {}
    analyzer_prefs = _get_or_create_analyzer_preferences(preferences)
    custom_points = _get_custom_analysis_points(analyzer_prefs)

    existing_ids = {point.id for point in _list_analysis_points(user=user_record)}
    point = _normalize_custom_analysis_point_create(data, existing_ids=existing_ids)
    custom_points.append(point.model_dump(mode="json"))

    analyzer_prefs["analysis_points_custom"] = custom_points
    _apply_analysis_point_default_ids(
        analyzer_prefs=analyzer_prefs,
        point_id=point.id,
        analyzer_ids=data.default_analyzer_ids,
    )

    user_record.preferences = preferences
    await db.commit()
    await db.refresh(user_record)
    return point


@router.patch("/analysis-points/{point_id}", response_model=AnalysisPointResponse)
async def update_custom_analysis_point(
    point_id: str,
    data: CustomAnalysisPointUpdate,
    user: CurrentUser,
    db: DatabaseSession,
):
    """Update a user-defined custom analysis point."""
    user_record = await db.get(User, user.id)
    if not user_record:
        raise HTTPException(status_code=404, detail="User not found")

    preferences = user_record.preferences if isinstance(user_record.preferences, dict) else {}
    analyzer_prefs = _get_or_create_analyzer_preferences(preferences)
    custom_points = _get_custom_analysis_points(analyzer_prefs)

    target_index = -1
    current_point: AnalysisPointResponse | None = None
    for index, raw in enumerate(custom_points):
        candidate = _parse_custom_analysis_point(raw)
        if candidate and candidate.id == point_id:
            target_index = index
            current_point = candidate
            break

    if target_index < 0 or current_point is None:
        raise HTTPException(status_code=404, detail=f"Custom analysis point '{point_id}' not found")

    updated_point = _normalize_custom_analysis_point_update(current_point=current_point, updates=data)
    custom_points[target_index] = updated_point.model_dump(mode="json")
    analyzer_prefs["analysis_points_custom"] = custom_points

    if data.default_analyzer_ids is not None:
        _apply_analysis_point_default_ids(
            analyzer_prefs=analyzer_prefs,
            point_id=point_id,
            analyzer_ids=data.default_analyzer_ids,
        )

    user_record.preferences = preferences
    await db.commit()
    await db.refresh(user_record)
    return updated_point


@router.delete("/analysis-points/{point_id}", status_code=204)
async def delete_custom_analysis_point(
    point_id: str,
    user: CurrentUser,
    db: DatabaseSession,
):
    """Delete a user-defined custom analysis point."""
    user_record = await db.get(User, user.id)
    if not user_record:
        raise HTTPException(status_code=404, detail="User not found")

    preferences = user_record.preferences if isinstance(user_record.preferences, dict) else {}
    analyzer_prefs = _get_or_create_analyzer_preferences(preferences)
    custom_points = _get_custom_analysis_points(analyzer_prefs)

    retained: list[dict[str, Any]] = []
    deleted = False
    for raw in custom_points:
        point = _parse_custom_analysis_point(raw)
        if point and point.id == point_id:
            deleted = True
            continue
        if point:
            retained.append(point.model_dump(mode="json"))

    if not deleted:
        raise HTTPException(status_code=404, detail=f"Custom analysis point '{point_id}' not found")

    analyzer_prefs["analysis_points_custom"] = retained
    _clear_analysis_point_default_ids(analyzer_prefs=analyzer_prefs, point_id=point_id)

    user_record.preferences = preferences
    await db.commit()


@router.get("/analyzers", response_model=AnalyzersListResponse)
async def list_analyzers(
    target: Optional[str] = Query(
        None,
        description="Filter by target: 'prompt' or 'asset'. If not specified, returns all."
    ),
    include_legacy: bool = Query(
        False,
        description="Include legacy analyzer IDs (parser:*, llm:*)"
    ),
    include_disabled: bool = Query(
        False,
        description="Include disabled analyzers (admin/debug use)",
    ),
):
    """
    List available analyzers.

    Returns registered analyzers filtered by target.
    Frontend uses this to populate analyzer selection dropdowns.

    Query params:
    - target: 'prompt' for text analysis, 'asset' for media analysis
    - include_legacy: include backward-compatible aliases
    """
    try:
        target_enum = AnalyzerTarget(target) if target else None
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid target '{target}'. Must be 'prompt' or 'asset'."
        )

    if include_disabled:
        analyzers = analyzer_registry.list_all()
        if target_enum:
            analyzers = [a for a in analyzers if a.target == target_enum]
        if not include_legacy:
            analyzers = [a for a in analyzers if not a.is_legacy]
    else:
        if target_enum:
            analyzers = analyzer_registry.list_by_target(target_enum, include_legacy)
        else:
            analyzers = analyzer_registry.list_enabled(include_legacy)

    default = analyzer_registry.get_default(target_enum)

    return AnalyzersListResponse(
        analyzers=[
            _build_analyzer_response(a) for a in analyzers
        ],
        default_id=default.id if default else "prompt:simple",
    )


@router.get("/analyzers/{analyzer_id}", response_model=AnalyzerResponse)
async def get_analyzer(
    analyzer_id: str,
):
    """
    Get info about a specific analyzer.
    """
    analyzer = analyzer_registry.get(analyzer_id)
    if not analyzer:
        raise HTTPException(status_code=404, detail=f"Analyzer '{analyzer_id}' not found")

    return _build_analyzer_response(analyzer)


@router.post("/analyzers", response_model=AnalyzerResponse, status_code=201)
async def create_analyzer(
    data: AnalyzerDefinitionCreate,
    admin: CurrentAdminUser,
    db: DatabaseSession,
):
    """
    Create a new analyzer definition (admin only).
    """
    service = AnalyzerDefinitionService(db)

    try:
        definition = await service.create_definition(
            analyzer_id=data.analyzer_id,
            name=data.name,
            description=data.description,
            kind=data.kind,
            target=data.target,
            input_modality=data.input_modality,
            task_family=data.task_family,
            provider_id=data.provider_id,
            model_id=data.model_id,
            config=data.config,
            base_analyzer_id=data.base_analyzer_id,
            preset_id=data.preset_id,
            instance_options=data.instance_options,
            enabled=data.enabled,
            is_default=data.is_default,
            created_by_user_id=admin.id,
        )
    except AnalyzerDefinitionError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)

    await db.commit()

    analyzer = analyzer_registry.get(definition.analyzer_id)
    if not analyzer:
        raise HTTPException(status_code=500, detail="Analyzer registration failed")
    return _build_analyzer_response(analyzer)


@router.patch("/analyzers/{analyzer_id}", response_model=AnalyzerResponse)
async def update_analyzer(
    analyzer_id: str,
    data: AnalyzerDefinitionUpdate,
    admin: CurrentAdminUser,
    db: DatabaseSession,
):
    """
    Update an analyzer definition (admin only).
    """
    service = AnalyzerDefinitionService(db)
    updates = data.model_dump(exclude_unset=True)

    try:
        definition = await service.update_definition(analyzer_id, **updates)
    except AnalyzerDefinitionError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)

    if not definition:
        raise HTTPException(status_code=404, detail="Analyzer not found")

    await db.commit()

    analyzer = analyzer_registry.get(analyzer_id)
    if not analyzer:
        raise HTTPException(status_code=500, detail="Analyzer registration failed")
    return _build_analyzer_response(analyzer)


@router.delete("/analyzers/{analyzer_id}", status_code=204)
async def delete_analyzer(
    analyzer_id: str,
    admin: CurrentAdminUser,
    db: DatabaseSession,
):
    """
    Delete an analyzer definition (admin only).
    """
    service = AnalyzerDefinitionService(db)
    deleted = await service.delete_definition(analyzer_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Analyzer not found")
    await db.commit()


@router.get("/analyzer-presets", response_model=AnalyzerPresetListResponse)
async def list_analyzer_presets(
    user: CurrentUser,
    db: DatabaseSession,
    analyzer_id: Optional[str] = None,
    status: Optional[str] = None,
    include_public: bool = False,
    owner_user_id: Optional[int] = None,
    include_all: bool = False,
    mine: bool = False,
):
    """
    List analyzer presets.

    - Default: list own presets
    - mine: list own presets (explicit), with include_public to add approved presets
    - include_public: include approved presets
    - owner_user_id: filter by owner (non-admins can only see approved presets of others)
    - include_all (admin only): list all presets
    """
    if include_all and not user.is_admin():
        raise HTTPException(status_code=403, detail="Admin access required")

    scope = resolve_user_owned_list_scope(
        current_user=user,
        requested_owner_user_id=owner_user_id,
        requested_is_public=None,
        mine=mine,
        include_public_when_mine=include_public,
        mine_requires_auth_detail="Authentication required for mine=true",
        mine_forbidden_cross_owner_detail="Not allowed to query another user's presets with mine=true",
        private_owner_forbidden_detail="Not allowed to query private presets of another user",
    )

    # Map scope to service parameters.
    # Presets use status=APPROVED as the "public" concept (no is_public column).
    effective_owner = scope.owner_user_id or user.id
    effective_include_public = scope.include_public_for_owner or include_public

    status_enum = None
    if status:
        try:
            status_enum = ReviewStatus(status)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status '{status}'")

    # When scope forces is_public=True (non-admin querying another user),
    # restrict to approved presets only.
    if scope.is_public is True:
        if status_enum is not None and status_enum != ReviewStatus.APPROVED:
            return AnalyzerPresetListResponse(presets=[])
        status_enum = ReviewStatus.APPROVED
        effective_include_public = False

    service = AnalyzerPresetService(db)
    try:
        presets = await service.list_presets(
            owner_user_id=effective_owner,
            analyzer_id=analyzer_id,
            status=status_enum,
            include_public=effective_include_public,
            include_all=include_all,
        )
    except AnalyzerPresetError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)

    return AnalyzerPresetListResponse(
        presets=[_build_preset_response(p) for p in presets]
    )


@router.post("/analyzer-presets", response_model=AnalyzerPresetResponse, status_code=201)
async def create_analyzer_preset(
    data: AnalyzerPresetCreate,
    user: CurrentUser,
    db: DatabaseSession,
):
    """
    Create a personal analyzer preset.
    """
    service = AnalyzerPresetService(db)
    try:
        preset = await service.create_preset(
            owner_user_id=user.id,
            analyzer_id=data.analyzer_id,
            preset_id=data.preset_id,
            name=data.name,
            description=data.description,
            config=data.config,
        )
    except AnalyzerPresetError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)

    await db.commit()
    return _build_preset_response(preset)


@router.patch("/analyzer-presets/{preset_entry_id}", response_model=AnalyzerPresetResponse)
async def update_analyzer_preset(
    preset_entry_id: int,
    data: AnalyzerPresetUpdate,
    user: CurrentUser,
    db: DatabaseSession,
):
    """
    Update a personal analyzer preset (draft/rejected only).
    """
    service = AnalyzerPresetService(db)
    try:
        preset = await service.update_preset(
            preset_entry_id=preset_entry_id,
            owner_user_id=user.id,
            preset_id=data.preset_id,
            name=data.name,
            description=data.description,
            config=data.config,
        )
    except AnalyzerPresetError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)

    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")

    await db.commit()
    return _build_preset_response(preset)


@router.delete("/analyzer-presets/{preset_entry_id}", status_code=204)
async def delete_analyzer_preset(
    preset_entry_id: int,
    user: CurrentUser,
    db: DatabaseSession,
):
    """
    Delete a personal analyzer preset.
    """
    service = AnalyzerPresetService(db)
    try:
        deleted = await service.delete_preset(
            preset_entry_id=preset_entry_id,
            owner_user_id=user.id,
        )
    except AnalyzerPresetError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)

    if not deleted:
        raise HTTPException(status_code=404, detail="Preset not found")

    await db.commit()


@router.post("/analyzer-presets/{preset_entry_id}/submit", response_model=AnalyzerPresetResponse)
async def submit_analyzer_preset(
    preset_entry_id: int,
    user: CurrentUser,
    db: DatabaseSession,
):
    """
    Submit a preset for admin approval.
    """
    service = AnalyzerPresetService(db)
    try:
        preset = await service.submit_preset(
            preset_entry_id=preset_entry_id,
            owner_user_id=user.id,
        )
    except AnalyzerPresetError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)

    await db.commit()
    return _build_preset_response(preset)


@router.post("/analyzer-presets/{preset_entry_id}/approve", response_model=AnalyzerPresetResponse)
async def approve_analyzer_preset(
    preset_entry_id: int,
    admin: CurrentAdminUser,
    db: DatabaseSession,
):
    """
    Approve a preset (admin only).
    """
    service = AnalyzerPresetService(db)
    try:
        preset = await service.approve_preset(
            preset_entry_id=preset_entry_id,
            admin_user_id=admin.id,
        )
    except AnalyzerPresetError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)

    await db.commit()
    return _build_preset_response(preset)


@router.post("/analyzer-presets/{preset_entry_id}/reject", response_model=AnalyzerPresetResponse)
async def reject_analyzer_preset(
    preset_entry_id: int,
    data: AnalyzerPresetReject,
    admin: CurrentAdminUser,
    db: DatabaseSession,
):
    """
    Reject a preset (admin only).
    """
    service = AnalyzerPresetService(db)
    try:
        preset = await service.reject_preset(
            preset_entry_id=preset_entry_id,
            admin_user_id=admin.id,
            reason=data.reason,
        )
    except AnalyzerPresetError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)

    await db.commit()
    return _build_preset_response(preset)


@router.get("/analyzer-instances", response_model=AnalyzerInstanceListResponse)
async def list_analyzer_instances(
    user: CurrentUser,
    db: DatabaseSession,
    analyzer_id: Optional[str] = None,
    provider_id: Optional[str] = None,
    include_disabled: bool = False,
):
    """
    List analyzer instances for the current user.
    """
    service = AnalyzerInstanceService(db)
    instances = await service.list_instances(
        owner_user_id=user.id,
        analyzer_id=analyzer_id,
        provider_id=provider_id,
        enabled_only=not include_disabled,
    )

    return AnalyzerInstanceListResponse(
        instances=[
            AnalyzerInstanceResponse(
                id=instance.id,
                analyzer_id=instance.analyzer_id or "",
                provider_id=instance.provider_id,
                model_id=instance.model_id,
                label=instance.label,
                description=instance.description,
                config=_mask_instance_config(instance.config),
                enabled=instance.enabled,
                priority=instance.priority,
                on_ingest=instance.on_ingest,
                created_at=instance.created_at.isoformat() if instance.created_at else "",
                updated_at=instance.updated_at.isoformat() if instance.updated_at else "",
            )
            for instance in instances
        ]
    )


@router.post("/analyzer-instances", response_model=AnalyzerInstanceResponse, status_code=201)
async def create_analyzer_instance(
    data: AnalyzerInstanceCreate,
    user: CurrentUser,
    db: DatabaseSession,
):
    """
    Create a new analyzer instance (per-user).
    """
    service = AnalyzerInstanceService(db)
    try:
        instance = await service.create_instance(
            owner_user_id=user.id,
            analyzer_id=data.analyzer_id,
            provider_id=data.provider_id,
            model_id=data.model_id,
            label=data.label,
            description=data.description,
            config=data.config,
            enabled=data.enabled,
            priority=data.priority,
            on_ingest=data.on_ingest,
        )
    except AnalyzerInstanceConfigError as e:
        raise HTTPException(status_code=400, detail=f"Invalid instance config: {e.message}")

    await db.commit()

    return AnalyzerInstanceResponse(
        id=instance.id,
        analyzer_id=instance.analyzer_id or "",
        provider_id=instance.provider_id,
        model_id=instance.model_id,
        label=instance.label,
        description=instance.description,
        config=_mask_instance_config(instance.config),
        enabled=instance.enabled,
        priority=instance.priority,
        created_at=instance.created_at.isoformat() if instance.created_at else "",
        updated_at=instance.updated_at.isoformat() if instance.updated_at else "",
    )


@router.get("/analyzer-instances/{instance_id}", response_model=AnalyzerInstanceResponse)
async def get_analyzer_instance(
    instance_id: int,
    user: CurrentUser,
    db: DatabaseSession,
):
    """
    Get a specific analyzer instance.
    """
    service = AnalyzerInstanceService(db)
    instance = await service.get_instance_for_user(
        instance_id=instance_id,
        owner_user_id=user.id,
    )
    if not instance:
        raise HTTPException(status_code=404, detail="Analyzer instance not found")

    return AnalyzerInstanceResponse(
        id=instance.id,
        analyzer_id=instance.analyzer_id or "",
        provider_id=instance.provider_id,
        model_id=instance.model_id,
        label=instance.label,
        description=instance.description,
        config=_mask_instance_config(instance.config),
        enabled=instance.enabled,
        priority=instance.priority,
        created_at=instance.created_at.isoformat() if instance.created_at else "",
        updated_at=instance.updated_at.isoformat() if instance.updated_at else "",
    )


@router.patch("/analyzer-instances/{instance_id}", response_model=AnalyzerInstanceResponse)
async def update_analyzer_instance(
    instance_id: int,
    data: AnalyzerInstanceUpdate,
    user: CurrentUser,
    db: DatabaseSession,
):
    """
    Update an analyzer instance.
    """
    service = AnalyzerInstanceService(db)
    updates = data.model_dump(exclude_unset=True)

    try:
        instance = await service.update_instance(
            instance_id=instance_id,
            owner_user_id=user.id,
            **updates,
        )
    except AnalyzerInstanceConfigError as e:
        raise HTTPException(status_code=400, detail=f"Invalid instance config: {e.message}")

    if not instance:
        raise HTTPException(status_code=404, detail="Analyzer instance not found")

    await db.commit()

    return AnalyzerInstanceResponse(
        id=instance.id,
        analyzer_id=instance.analyzer_id or "",
        provider_id=instance.provider_id,
        model_id=instance.model_id,
        label=instance.label,
        description=instance.description,
        config=_mask_instance_config(instance.config),
        enabled=instance.enabled,
        priority=instance.priority,
        created_at=instance.created_at.isoformat() if instance.created_at else "",
        updated_at=instance.updated_at.isoformat() if instance.updated_at else "",
    )


@router.delete("/analyzer-instances/{instance_id}", status_code=204)
async def delete_analyzer_instance(
    instance_id: int,
    user: CurrentUser,
    db: DatabaseSession,
):
    """
    Delete an analyzer instance.
    """
    service = AnalyzerInstanceService(db)
    deleted = await service.delete_instance(
        instance_id=instance_id,
        owner_user_id=user.id,
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Analyzer instance not found")

    await db.commit()


def _mask_instance_config(config: dict) -> dict:
    """Mask sensitive values in instance config."""
    if not config:
        return config

    masked = config.copy()
    if "api_key" in masked and masked["api_key"]:
        key = masked["api_key"]
        if isinstance(key, str) and len(key) > 8:
            masked["api_key"] = f"{'*' * (len(key) - 4)}{key[-4:]}"
    return masked


_ALLOWED_POINT_GROUPS = {"prompt", "asset", "system"}
_ALLOWED_POINT_CONTROLS = {
    "prompt_default",
    "image_default",
    "video_default",
    "intent_override",
    "similarity_threshold",
}
_ALLOWED_MEDIA_TYPES = {"image", "video"}
_CUSTOM_POINTS_KEY = "analysis_points_custom"
_ANALYSIS_POINT_DEFAULT_IDS_KEY = "analysis_point_default_ids"


def _system_analysis_points() -> List[AnalysisPointResponse]:
    return [
        AnalysisPointResponse(
            id="prompt_parsing",
            label="Prompt parsing",
            description="Tag extraction and parser analysis during prompt editing.",
            group="prompt",
            target=AnalyzerTarget.PROMPT,
            control="prompt_default",
            supports_chain=True,
            source="system",
            editable=False,
        ),
        AnalysisPointResponse(
            id="prompt_generation",
            label="Generation workflow",
            description="Prompt analysis before generation execution.",
            group="prompt",
            target=AnalyzerTarget.PROMPT,
            control="prompt_default",
            supports_chain=True,
            source="system",
            editable=False,
        ),
        AnalysisPointResponse(
            id="asset_ingest_on_ingest",
            label="Asset ingestion (on_ingest fallback)",
            description="Default route when ingestion does not specify an analyzer.",
            group="asset",
            target=AnalyzerTarget.ASSET,
            control="image_default",
            media_type="image",
            supports_chain=True,
            source="system",
            editable=False,
        ),
        AnalysisPointResponse(
            id="character_ingest_face",
            label="Character ingest: Face",
            description="Face-mode character reference analysis.",
            group="asset",
            target=AnalyzerTarget.ASSET,
            control="intent_override",
            intent_key="character_ingest_face",
            supports_chain=True,
            source="system",
            editable=False,
        ),
        AnalysisPointResponse(
            id="character_ingest_sheet",
            label="Character ingest: Sheet / Composite",
            description="Sheet/composite character reference analysis.",
            group="asset",
            target=AnalyzerTarget.ASSET,
            control="intent_override",
            intent_key="character_ingest_sheet",
            supports_chain=True,
            source="system",
            editable=False,
        ),
        AnalysisPointResponse(
            id="scene_prep_location",
            label="Scene prep: Location",
            description="Scene prep location-reference analysis.",
            group="asset",
            target=AnalyzerTarget.ASSET,
            control="intent_override",
            intent_key="scene_prep_location",
            supports_chain=True,
            source="system",
            editable=False,
        ),
        AnalysisPointResponse(
            id="scene_prep_style",
            label="Scene prep: Style",
            description="Scene prep style-reference analysis.",
            group="asset",
            target=AnalyzerTarget.ASSET,
            control="intent_override",
            intent_key="scene_prep_style",
            supports_chain=True,
            source="system",
            editable=False,
        ),
        AnalysisPointResponse(
            id="manual_analysis_image",
            label="Manual analysis: Image",
            description="Image analysis calls when analyzer_id is omitted.",
            group="asset",
            target=AnalyzerTarget.ASSET,
            control="image_default",
            media_type="image",
            supports_chain=True,
            source="system",
            editable=False,
        ),
        AnalysisPointResponse(
            id="manual_analysis_video",
            label="Manual analysis: Video",
            description="Video analysis calls when analyzer_id is omitted.",
            group="asset",
            target=AnalyzerTarget.ASSET,
            control="video_default",
            media_type="video",
            supports_chain=True,
            source="system",
            editable=False,
        ),
        AnalysisPointResponse(
            id="similarity_threshold",
            label="Visual similarity threshold",
            description="Default threshold for similar-content search.",
            group="system",
            target=None,
            control="similarity_threshold",
            supports_chain=False,
            source="system",
            editable=False,
        ),
    ]


def _list_analysis_points(*, user: Optional[User] = None) -> List[AnalysisPointResponse]:
    system_points = _system_analysis_points()
    if user is None:
        return system_points

    custom_points = _extract_user_custom_analysis_points(user)
    if not custom_points:
        return system_points

    by_id: dict[str, AnalysisPointResponse] = {point.id: point for point in system_points}
    for point in custom_points:
        by_id[point.id] = point
    return list(by_id.values())


def _extract_user_custom_analysis_points(user: User) -> list[AnalysisPointResponse]:
    if not isinstance(user.preferences, dict):
        return []
    analyzer_prefs = user.preferences.get("analyzer")
    if not isinstance(analyzer_prefs, dict):
        return []
    raw_points = analyzer_prefs.get(_CUSTOM_POINTS_KEY)
    if not isinstance(raw_points, list):
        return []

    points: list[AnalysisPointResponse] = []
    for raw in raw_points:
        point = _parse_custom_analysis_point(raw)
        if point:
            points.append(point)
    return points


def _parse_custom_analysis_point(raw: Any) -> AnalysisPointResponse | None:
    if not isinstance(raw, dict):
        return None
    try:
        normalized = _normalize_custom_analysis_point_fields(
            raw,
            allow_missing=False,
        )
    except HTTPException:
        return None
    point_id = str(raw.get("id") or "").strip()
    if not point_id:
        return None
    normalized["id"] = point_id
    return AnalysisPointResponse(**normalized, source="user", editable=True)


def _normalize_custom_analysis_point_create(
    payload: CustomAnalysisPointCreate,
    *,
    existing_ids: set[str],
) -> AnalysisPointResponse:
    raw = payload.model_dump(exclude_none=True)
    normalized = _normalize_custom_analysis_point_fields(raw, allow_missing=False)
    requested_id = raw.get("id")
    normalized_id = _normalize_custom_point_id(
        requested=requested_id,
        label=normalized["label"],
        existing_ids=existing_ids,
    )
    normalized["id"] = normalized_id
    return AnalysisPointResponse(**normalized, source="user", editable=True)


def _normalize_custom_analysis_point_update(
    *,
    current_point: AnalysisPointResponse,
    updates: CustomAnalysisPointUpdate,
) -> AnalysisPointResponse:
    raw_updates = updates.model_dump(exclude_unset=True, exclude_none=True)
    merged = current_point.model_dump(mode="json")
    merged.update(raw_updates)
    normalized = _normalize_custom_analysis_point_fields(merged, allow_missing=False)
    normalized["id"] = current_point.id
    return AnalysisPointResponse(**normalized, source="user", editable=True)


def _normalize_custom_analysis_point_fields(
    raw: dict[str, Any],
    *,
    allow_missing: bool,
) -> dict[str, Any]:
    label = str(raw.get("label") or "").strip()
    if not label and not allow_missing:
        raise HTTPException(status_code=400, detail="Analysis point label is required")

    description = str(raw.get("description") or "").strip()
    group = str(raw.get("group") or "").strip().lower() or "asset"
    if group not in _ALLOWED_POINT_GROUPS:
        raise HTTPException(status_code=400, detail=f"Invalid analysis point group '{group}'")

    control = str(raw.get("control") or "").strip().lower()
    if control not in _ALLOWED_POINT_CONTROLS:
        raise HTTPException(status_code=400, detail=f"Invalid analysis point control '{control}'")

    target_raw = raw.get("target")
    target: Optional[str]
    if target_raw is None:
        if group == "prompt":
            target = AnalyzerTarget.PROMPT.value
        elif group == "asset":
            target = AnalyzerTarget.ASSET.value
        else:
            target = None
    else:
        target = str(target_raw).strip().lower() or None
        if target not in {AnalyzerTarget.PROMPT.value, AnalyzerTarget.ASSET.value, None}:
            raise HTTPException(status_code=400, detail=f"Invalid analysis point target '{target}'")

    media_type_raw = raw.get("media_type")
    media_type = None
    if media_type_raw is not None:
        media_type = str(media_type_raw).strip().lower() or None
        if media_type is not None and media_type not in _ALLOWED_MEDIA_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid media_type '{media_type}'")

    intent_key_raw = raw.get("intent_key")
    intent_key = None
    if intent_key_raw is not None:
        intent_key = str(intent_key_raw).strip() or None

    supports_chain = bool(raw.get("supports_chain", True))
    if control == "similarity_threshold":
        group = "system"
        target = None
        media_type = None
        intent_key = None
        supports_chain = False

    if control == "prompt_default" and target != AnalyzerTarget.PROMPT.value:
        raise HTTPException(status_code=400, detail="prompt_default points must target 'prompt'")
    if control in {"image_default", "video_default", "intent_override"} and target != AnalyzerTarget.ASSET.value:
        raise HTTPException(status_code=400, detail=f"{control} points must target 'asset'")
    if control == "intent_override" and not intent_key:
        raise HTTPException(status_code=400, detail="intent_override requires intent_key")
    if control in {"image_default", "video_default"} and media_type is None:
        media_type = "image" if control == "image_default" else "video"

    return {
        "id": str(raw.get("id") or "").strip(),
        "label": label,
        "description": description,
        "group": group,
        "target": target,
        "control": control,
        "intent_key": intent_key,
        "media_type": media_type,
        "supports_chain": supports_chain,
    }


def _normalize_custom_point_id(
    *,
    requested: Any,
    label: str,
    existing_ids: set[str],
) -> str:
    if isinstance(requested, str) and requested.strip():
        base = requested.strip()
        if base.startswith("user:"):
            candidate = base
        else:
            candidate = f"user:{base}"
        if candidate in existing_ids:
            raise HTTPException(status_code=409, detail=f"Analysis point '{candidate}' already exists")
        return candidate

    slug = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")
    if not slug:
        slug = "custom-point"
    candidate = f"user:{slug}"
    suffix = 2
    while candidate in existing_ids:
        candidate = f"user:{slug}-{suffix}"
        suffix += 1
    return candidate


def _get_or_create_analyzer_preferences(preferences: dict[str, Any]) -> dict[str, Any]:
    analyzer_prefs = preferences.get("analyzer")
    if not isinstance(analyzer_prefs, dict):
        analyzer_prefs = {}
        preferences["analyzer"] = analyzer_prefs
    return analyzer_prefs


def _get_custom_analysis_points(analyzer_prefs: dict[str, Any]) -> list[dict[str, Any]]:
    raw_points = analyzer_prefs.get(_CUSTOM_POINTS_KEY)
    if not isinstance(raw_points, list):
        return []
    return [item for item in raw_points if isinstance(item, dict)]


def _apply_analysis_point_default_ids(
    *,
    analyzer_prefs: dict[str, Any],
    point_id: str,
    analyzer_ids: Optional[list[str]],
) -> None:
    if analyzer_ids is None:
        return

    normalized: list[str] = []
    seen: set[str] = set()
    for raw in analyzer_ids:
        if not isinstance(raw, str):
            continue
        candidate = analyzer_registry.resolve_legacy(raw.strip())
        analyzer = analyzer_registry.get(candidate)
        if not analyzer or analyzer.target != AnalyzerTarget.ASSET or not analyzer.enabled:
            continue
        if candidate in seen:
            continue
        seen.add(candidate)
        normalized.append(candidate)

    id_map = analyzer_prefs.get(_ANALYSIS_POINT_DEFAULT_IDS_KEY)
    if not isinstance(id_map, dict):
        id_map = {}

    if normalized:
        id_map[point_id] = normalized
    else:
        id_map.pop(point_id, None)

    analyzer_prefs[_ANALYSIS_POINT_DEFAULT_IDS_KEY] = id_map


def _clear_analysis_point_default_ids(*, analyzer_prefs: dict[str, Any], point_id: str) -> None:
    id_map = analyzer_prefs.get(_ANALYSIS_POINT_DEFAULT_IDS_KEY)
    if isinstance(id_map, dict):
        id_map.pop(point_id, None)
        analyzer_prefs[_ANALYSIS_POINT_DEFAULT_IDS_KEY] = id_map


def _build_analyzer_response(analyzer) -> AnalyzerResponse:
    effective_options = get_effective_instance_options(analyzer)
    return AnalyzerResponse(
        id=analyzer.id,
        name=analyzer.name,
        description=analyzer.description,
        kind=analyzer.kind,
        target=analyzer.target,
        input_modality=analyzer.input_modality,
        task_family=analyzer.task_family,
        provider_id=analyzer.provider_id,
        model_id=analyzer.model_id,
        source_plugin_id=analyzer.source_plugin_id,
        enabled=analyzer.enabled,
        is_default=analyzer.is_default,
        instance_options=[
            InstanceOptionResponse(
                id=opt.id,
                type=opt.type,
                label=opt.label,
                description=opt.description,
                default=opt.default,
                storage=opt.storage,
            )
            for opt in effective_options
        ],
    )


def _build_preset_response(preset) -> AnalyzerPresetResponse:
    owner = resolve_user_owner(model_owner_user_id=preset.owner_user_id)
    return AnalyzerPresetResponse(
        id=preset.id,
        analyzer_id=preset.analyzer_id,
        preset_id=preset.preset_id,
        name=preset.name,
        description=preset.description,
        config=preset.config or {},
        status=preset.status.value if hasattr(preset.status, "value") else str(preset.status),
        owner_user_id=preset.owner_user_id,
        owner_ref=owner["owner_ref"],
        owner_username=owner["owner_username"],
        approved_by_user_id=preset.approved_by_user_id,
        approved_at=preset.approved_at.isoformat() if preset.approved_at else None,
        rejected_at=preset.rejected_at.isoformat() if preset.rejected_at else None,
        rejection_reason=preset.rejection_reason,
        created_at=preset.created_at.isoformat() if preset.created_at else "",
        updated_at=preset.updated_at.isoformat() if preset.updated_at else "",
    )
