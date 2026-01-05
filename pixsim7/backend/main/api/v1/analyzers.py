"""
Analyzer API endpoints

Provides discovery of available analyzers (prompt and asset) for frontend configuration.
"""

from fastapi import APIRouter, Query, HTTPException
from typing import List, Optional
from pydantic import BaseModel, Field

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession
from pixsim7.backend.main.services.prompt.parser import analyzer_registry, AnalyzerTarget, AnalyzerKind
from pixsim7.backend.main.services.analysis.analyzer_instance_service import (
    AnalyzerInstanceService,
    AnalyzerInstanceConfigError,
)

router = APIRouter()


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
):
    """
    List available analyzers.

    Returns registered analyzers filtered by target.
    Frontend uses this to populate analyzer selection dropdowns.

    Query params:
    - target: 'prompt' for text analysis, 'asset' for media analysis
    - include_legacy: include backward-compatible aliases
    """
    # Filter by target if specified
    if target:
        try:
            target_enum = AnalyzerTarget(target)
            analyzers = analyzer_registry.list_by_target(target_enum, include_legacy)
            default = analyzer_registry.get_default(target_enum)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid target '{target}'. Must be 'prompt' or 'asset'."
            )
    else:
        analyzers = analyzer_registry.list_enabled(include_legacy)
        default = analyzer_registry.get_default()

    return AnalyzersListResponse(
        analyzers=[
            AnalyzerResponse(
                id=a.id,
                name=a.name,
                description=a.description,
                kind=a.kind,
                target=a.target,
                provider_id=a.provider_id,
                model_id=a.model_id,
                source_plugin_id=a.source_plugin_id,
                enabled=a.enabled,
                is_default=a.is_default,
            )
            for a in analyzers
        ],
        default_id=default.id if default else "prompt:simple",
    )


@router.get("/analyzers/{analyzer_id}", response_model=AnalyzerResponse)
async def get_analyzer(analyzer_id: str):
    """
    Get info about a specific analyzer.
    """
    analyzer = analyzer_registry.get(analyzer_id)
    if not analyzer:
        raise HTTPException(status_code=404, detail=f"Analyzer '{analyzer_id}' not found")

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
