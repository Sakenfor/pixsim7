"""
Analyzer API endpoints

Provides discovery of available analyzers (prompt and asset) for frontend configuration.
"""

from fastapi import APIRouter, Query, HTTPException, Request
from typing import List, Optional
from pydantic import BaseModel, Field

from pixsim7.backend.main.api.dependencies import (
    CurrentUser,
    CurrentAdminUser,
    DatabaseSession,
    AnalysisGatewaySvc,
)
from pixsim7.backend.main.services.prompt.parser import analyzer_registry, AnalyzerTarget, AnalyzerKind
from pixsim7.backend.main.infrastructure.services.gateway import ProxyResult
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

router = APIRouter()


async def _proxy_request(
    analysis_gateway: AnalysisGatewaySvc,
    req: Request,
    method: str,
    path: str,
    *,
    json: Optional[dict] = None,
    params: Optional[dict] = None,
) -> ProxyResult:
    return await analysis_gateway.proxy(
        req,
        method,
        path,
        json=json,
        params=params,
    )


class AnalyzerResponse(BaseModel):
    """Response schema for analyzer info."""
    id: str
    name: str
    description: str
    kind: AnalyzerKind
    target: AnalyzerTarget
    provider_id: Optional[str] = None
    model_id: Optional[str] = None
    source_plugin_id: Optional[str] = None
    enabled: bool
    is_default: bool


class AnalyzersListResponse(BaseModel):
    """Response for list of analyzers."""
    analyzers: List[AnalyzerResponse]
    default_id: str


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


class AnalyzerInstanceUpdate(BaseModel):
    """Update an analyzer instance."""
    provider_id: Optional[str] = None
    model_id: Optional[str] = None
    label: Optional[str] = None
    description: Optional[str] = None
    config: Optional[dict] = None
    enabled: Optional[bool] = None
    priority: Optional[int] = None


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
    provider_id: Optional[str] = Field(None, max_length=50)
    model_id: Optional[str] = Field(None, max_length=100)
    config: Optional[dict] = Field(default_factory=dict)
    enabled: bool = True
    is_default: bool = False


class AnalyzerDefinitionUpdate(BaseModel):
    """Update an analyzer definition."""
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    kind: Optional[AnalyzerKind] = None
    target: Optional[AnalyzerTarget] = None
    provider_id: Optional[str] = Field(None, max_length=50)
    model_id: Optional[str] = Field(None, max_length=100)
    base_analyzer_id: Optional[str] = Field(None, max_length=100)
    preset_id: Optional[str] = Field(None, max_length=100)
    config: Optional[dict] = None
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


@router.get("/analyzers", response_model=AnalyzersListResponse)
async def list_analyzers(
    req: Request,
    analysis_gateway: AnalysisGatewaySvc,
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
    proxy = await _proxy_request(
        analysis_gateway,
        req,
        "GET",
        "/api/v1/analyzers",
        params={
            "target": target,
            "include_legacy": include_legacy,
            "include_disabled": include_disabled,
        },
    )
    if proxy.called:
        return AnalyzersListResponse.model_validate(proxy.data)

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
    req: Request,
    analysis_gateway: AnalysisGatewaySvc,
):
    """
    Get info about a specific analyzer.
    """
    proxy = await _proxy_request(
        analysis_gateway,
        req,
        "GET",
        f"/api/v1/analyzers/{analyzer_id}",
    )
    if proxy.called:
        return AnalyzerResponse.model_validate(proxy.data)

    analyzer = analyzer_registry.get(analyzer_id)
    if not analyzer:
        raise HTTPException(status_code=404, detail=f"Analyzer '{analyzer_id}' not found")

    return _build_analyzer_response(analyzer)


@router.post("/analyzers", response_model=AnalyzerResponse, status_code=201)
async def create_analyzer(
    data: AnalyzerDefinitionCreate,
    req: Request,
    admin: CurrentAdminUser,
    db: DatabaseSession,
    analysis_gateway: AnalysisGatewaySvc,
):
    """
    Create a new analyzer definition (admin only).
    """
    proxy = await _proxy_request(
        analysis_gateway,
        req,
        "POST",
        "/api/v1/analyzers",
        json=data.model_dump(mode="json"),
    )
    if proxy.called:
        return AnalyzerResponse.model_validate(proxy.data)

    service = AnalyzerDefinitionService(db)

    try:
        definition = await service.create_definition(
            analyzer_id=data.analyzer_id,
            name=data.name,
            description=data.description,
            kind=data.kind,
            target=data.target,
            provider_id=data.provider_id,
            model_id=data.model_id,
            config=data.config,
            base_analyzer_id=data.base_analyzer_id,
            preset_id=data.preset_id,
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
    req: Request,
    admin: CurrentAdminUser,
    db: DatabaseSession,
    analysis_gateway: AnalysisGatewaySvc,
):
    """
    Update an analyzer definition (admin only).
    """
    proxy = await _proxy_request(
        analysis_gateway,
        req,
        "PATCH",
        f"/api/v1/analyzers/{analyzer_id}",
        json=data.model_dump(mode="json", exclude_unset=True),
    )
    if proxy.called:
        return AnalyzerResponse.model_validate(proxy.data)

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
    req: Request,
    admin: CurrentAdminUser,
    db: DatabaseSession,
    analysis_gateway: AnalysisGatewaySvc,
):
    """
    Delete an analyzer definition (admin only).
    """
    proxy = await _proxy_request(
        analysis_gateway,
        req,
        "DELETE",
        f"/api/v1/analyzers/{analyzer_id}",
    )
    if proxy.called:
        return None

    service = AnalyzerDefinitionService(db)
    deleted = await service.delete_definition(analyzer_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Analyzer not found")
    await db.commit()


@router.get("/analyzer-presets", response_model=AnalyzerPresetListResponse)
async def list_analyzer_presets(
    req: Request,
    user: CurrentUser,
    db: DatabaseSession,
    analysis_gateway: AnalysisGatewaySvc,
    analyzer_id: Optional[str] = None,
    status: Optional[str] = None,
    include_public: bool = False,
    owner_user_id: Optional[int] = None,
    include_all: bool = False,
):
    """
    List analyzer presets.

    - Default: list own presets
    - include_public: include approved presets
    - include_all (admin only): list all presets
    """
    if include_all and not user.is_admin():
        raise HTTPException(status_code=403, detail="Admin access required")
    if owner_user_id is not None and not user.is_admin():
        raise HTTPException(status_code=403, detail="Admin access required")

    proxy = await _proxy_request(
        analysis_gateway,
        req,
        "GET",
        "/api/v1/analyzer-presets",
        params={
            k: v
            for k, v in {
                "analyzer_id": analyzer_id,
                "status": status,
                "include_public": include_public,
                "owner_user_id": owner_user_id,
                "include_all": include_all,
            }.items()
            if v is not None
        },
    )
    if proxy.called:
        return AnalyzerPresetListResponse.model_validate(proxy.data)

    service = AnalyzerPresetService(db)
    status_enum = None
    if status:
        try:
            status_enum = ReviewStatus(status)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status '{status}'")

    try:
        presets = await service.list_presets(
            owner_user_id=owner_user_id or user.id,
            analyzer_id=analyzer_id,
            status=status_enum,
            include_public=include_public,
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
    req: Request,
    user: CurrentUser,
    db: DatabaseSession,
    analysis_gateway: AnalysisGatewaySvc,
):
    """
    Create a personal analyzer preset.
    """
    proxy = await _proxy_request(
        analysis_gateway,
        req,
        "POST",
        "/api/v1/analyzer-presets",
        json=data.model_dump(mode="json"),
    )
    if proxy.called:
        return AnalyzerPresetResponse.model_validate(proxy.data)

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
    req: Request,
    user: CurrentUser,
    db: DatabaseSession,
    analysis_gateway: AnalysisGatewaySvc,
):
    """
    Update a personal analyzer preset (draft/rejected only).
    """
    proxy = await _proxy_request(
        analysis_gateway,
        req,
        "PATCH",
        f"/api/v1/analyzer-presets/{preset_entry_id}",
        json=data.model_dump(mode="json", exclude_unset=True),
    )
    if proxy.called:
        return AnalyzerPresetResponse.model_validate(proxy.data)

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
    req: Request,
    user: CurrentUser,
    db: DatabaseSession,
    analysis_gateway: AnalysisGatewaySvc,
):
    """
    Delete a personal analyzer preset.
    """
    proxy = await _proxy_request(
        analysis_gateway,
        req,
        "DELETE",
        f"/api/v1/analyzer-presets/{preset_entry_id}",
    )
    if proxy.called:
        return None

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
    req: Request,
    user: CurrentUser,
    db: DatabaseSession,
    analysis_gateway: AnalysisGatewaySvc,
):
    """
    Submit a preset for admin approval.
    """
    proxy = await _proxy_request(
        analysis_gateway,
        req,
        "POST",
        f"/api/v1/analyzer-presets/{preset_entry_id}/submit",
    )
    if proxy.called:
        return AnalyzerPresetResponse.model_validate(proxy.data)

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
    req: Request,
    admin: CurrentAdminUser,
    db: DatabaseSession,
    analysis_gateway: AnalysisGatewaySvc,
):
    """
    Approve a preset (admin only).
    """
    proxy = await _proxy_request(
        analysis_gateway,
        req,
        "POST",
        f"/api/v1/analyzer-presets/{preset_entry_id}/approve",
    )
    if proxy.called:
        return AnalyzerPresetResponse.model_validate(proxy.data)

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
    req: Request,
    admin: CurrentAdminUser,
    db: DatabaseSession,
    analysis_gateway: AnalysisGatewaySvc,
):
    """
    Reject a preset (admin only).
    """
    proxy = await _proxy_request(
        analysis_gateway,
        req,
        "POST",
        f"/api/v1/analyzer-presets/{preset_entry_id}/reject",
        json=data.model_dump(mode="json"),
    )
    if proxy.called:
        return AnalyzerPresetResponse.model_validate(proxy.data)

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
    req: Request,
    user: CurrentUser,
    db: DatabaseSession,
    analysis_gateway: AnalysisGatewaySvc,
    analyzer_id: Optional[str] = None,
    provider_id: Optional[str] = None,
    include_disabled: bool = False,
):
    """
    List analyzer instances for the current user.
    """
    proxy = await _proxy_request(
        analysis_gateway,
        req,
        "GET",
        "/api/v1/analyzer-instances",
        params={
            k: v
            for k, v in {
                "analyzer_id": analyzer_id,
                "provider_id": provider_id,
                "include_disabled": include_disabled,
            }.items()
            if v is not None
        },
    )
    if proxy.called:
        return AnalyzerInstanceListResponse.model_validate(proxy.data)

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
                created_at=instance.created_at.isoformat() if instance.created_at else "",
                updated_at=instance.updated_at.isoformat() if instance.updated_at else "",
            )
            for instance in instances
        ]
    )


@router.post("/analyzer-instances", response_model=AnalyzerInstanceResponse, status_code=201)
async def create_analyzer_instance(
    data: AnalyzerInstanceCreate,
    req: Request,
    user: CurrentUser,
    db: DatabaseSession,
    analysis_gateway: AnalysisGatewaySvc,
):
    """
    Create a new analyzer instance (per-user).
    """
    proxy = await _proxy_request(
        analysis_gateway,
        req,
        "POST",
        "/api/v1/analyzer-instances",
        json=data.model_dump(mode="json"),
    )
    if proxy.called:
        return AnalyzerInstanceResponse.model_validate(proxy.data)

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
    req: Request,
    user: CurrentUser,
    db: DatabaseSession,
    analysis_gateway: AnalysisGatewaySvc,
):
    """
    Get a specific analyzer instance.
    """
    proxy = await _proxy_request(
        analysis_gateway,
        req,
        "GET",
        f"/api/v1/analyzer-instances/{instance_id}",
    )
    if proxy.called:
        return AnalyzerInstanceResponse.model_validate(proxy.data)

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
    req: Request,
    user: CurrentUser,
    db: DatabaseSession,
    analysis_gateway: AnalysisGatewaySvc,
):
    """
    Update an analyzer instance.
    """
    proxy = await _proxy_request(
        analysis_gateway,
        req,
        "PATCH",
        f"/api/v1/analyzer-instances/{instance_id}",
        json=data.model_dump(mode="json", exclude_unset=True),
    )
    if proxy.called:
        return AnalyzerInstanceResponse.model_validate(proxy.data)

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
    req: Request,
    user: CurrentUser,
    db: DatabaseSession,
    analysis_gateway: AnalysisGatewaySvc,
):
    """
    Delete an analyzer instance.
    """
    proxy = await _proxy_request(
        analysis_gateway,
        req,
        "DELETE",
        f"/api/v1/analyzer-instances/{instance_id}",
    )
    if proxy.called:
        return None

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


def _build_analyzer_response(analyzer) -> AnalyzerResponse:
    return AnalyzerResponse(
        id=analyzer.id,
        name=analyzer.name,
        description=analyzer.description,
        kind=analyzer.kind,
        target=analyzer.target,
        provider_id=analyzer.provider_id,
        model_id=analyzer.model_id,
        source_plugin_id=analyzer.source_plugin_id,
        enabled=analyzer.enabled,
        is_default=analyzer.is_default,
    )


def _build_preset_response(preset) -> AnalyzerPresetResponse:
    return AnalyzerPresetResponse(
        id=preset.id,
        analyzer_id=preset.analyzer_id,
        preset_id=preset.preset_id,
        name=preset.name,
        description=preset.description,
        config=preset.config or {},
        status=preset.status.value if hasattr(preset.status, "value") else str(preset.status),
        owner_user_id=preset.owner_user_id,
        approved_by_user_id=preset.approved_by_user_id,
        approved_at=preset.approved_at.isoformat() if preset.approved_at else None,
        rejected_at=preset.rejected_at.isoformat() if preset.rejected_at else None,
        rejection_reason=preset.rejection_reason,
        created_at=preset.created_at.isoformat() if preset.created_at else "",
        updated_at=preset.updated_at.isoformat() if preset.updated_at else "",
    )
