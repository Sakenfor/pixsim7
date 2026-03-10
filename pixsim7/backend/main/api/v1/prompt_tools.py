"""Prompt tool catalog, preset CRUD, and execution API endpoints."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, Field

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession
from pixsim7.backend.main.domain.prompt import PromptToolPreset
from pixsim7.backend.main.services.ownership.user_owned import resolve_user_owner
from pixsim7.backend.main.services.prompt.tools import (
    assert_can_execute_prompt_tool,
    create_prompt_tool_preset,
    delete_prompt_tool_preset,
    dispatch_prompt_tool_execution,
    get_prompt_tool_preset,
    list_prompt_tool_catalog,
    list_prompt_tool_presets,
    normalize_prompt_tool_execution_result,
    resolve_prompt_tool_preset,
    update_prompt_tool_preset,
)
from pixsim7.backend.main.services.prompt.tools.types import PromptToolPresetRecord

router = APIRouter(prefix="/prompt-tools", tags=["prompt-tools"])


class PromptToolCatalogScope(str, Enum):
    SELF = "self"
    SHARED = "shared"
    BUILTIN = "builtin"
    ALL = "all"


class PromptToolPresetResponse(BaseModel):
    id: str
    label: str
    description: str
    source: str
    category: str
    enabled: bool
    requires: List[str] = Field(default_factory=list)
    defaults: Dict[str, Any] = Field(default_factory=dict)
    owner_user_id: Optional[int] = None
    owner_ref: Optional[str] = None
    owner_username: Optional[str] = None


class PromptToolCatalogResponse(BaseModel):
    scope: str
    presets: List[PromptToolPresetResponse] = Field(default_factory=list)


class PromptToolExecuteRequest(BaseModel):
    preset_id: str = Field(..., min_length=1, max_length=255)
    prompt_text: str = Field(default="")
    params: Dict[str, Any] = Field(default_factory=dict)
    run_context: Dict[str, Any] = Field(default_factory=dict)


class PromptToolExecutionProvenance(BaseModel):
    preset_id: str
    analyzer_id: Optional[str] = None
    model_id: Optional[str] = None


class PromptToolExecuteResponse(BaseModel):
    prompt_text: str
    block_overlay: Optional[List[Dict[str, Any]]] = None
    guidance_patch: Optional[Dict[str, Any]] = None
    composition_assets_patch: Optional[List[Dict[str, Any]]] = None
    warnings: Optional[List[str]] = None
    provenance: PromptToolExecutionProvenance


class PromptToolPresetCreateRequest(BaseModel):
    preset_id: str = Field(..., min_length=1, max_length=120)
    label: str = Field(..., min_length=1, max_length=120)
    description: str = Field(default="")
    category: str = Field(default="rewrite", min_length=1, max_length=32)
    enabled: bool = Field(default=True)
    requires: List[str] = Field(default_factory=list)
    defaults: Dict[str, Any] = Field(default_factory=dict)
    is_public: bool = Field(default=False)


class PromptToolPresetUpdateRequest(BaseModel):
    preset_id: Optional[str] = Field(default=None, min_length=1, max_length=120)
    label: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None)
    category: Optional[str] = Field(default=None, min_length=1, max_length=32)
    enabled: Optional[bool] = Field(default=None)
    requires: Optional[List[str]] = Field(default=None)
    defaults: Optional[Dict[str, Any]] = Field(default=None)
    is_public: Optional[bool] = Field(default=None)


class PromptToolPresetCrudResponse(PromptToolPresetResponse):
    entry_id: UUID
    is_public: bool
    created_at: datetime
    updated_at: datetime


@router.get("/catalog", response_model=PromptToolCatalogResponse)
async def list_prompt_tool_catalog_route(
    current_user: CurrentUser,
    db: DatabaseSession,
    scope: PromptToolCatalogScope = Query(
        PromptToolCatalogScope.ALL,
        description="Catalog scope: self | shared | builtin | all",
    ),
) -> PromptToolCatalogResponse:
    """List prompt tool presets by catalog scope."""
    presets = await list_prompt_tool_catalog(
        scope=scope.value,
        current_user=current_user,
        db=db,
    )
    return PromptToolCatalogResponse(
        scope=scope.value,
        presets=[_build_preset_response(preset) for preset in presets],
    )


@router.get("/presets", response_model=List[PromptToolPresetCrudResponse])
async def list_prompt_tool_presets_route(
    current_user: CurrentUser,
    db: DatabaseSession,
    owner_user_id: Optional[int] = Query(None),
    mine: bool = Query(True, description="Return current user's presets"),
    is_public: Optional[bool] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> List[PromptToolPresetCrudResponse]:
    """List DB-backed prompt tool presets with owner/public scope filters."""
    rows = await list_prompt_tool_presets(
        current_user=current_user,
        db=db,
        owner_user_id=owner_user_id,
        mine=mine,
        is_public=is_public,
        limit=limit,
        offset=offset,
    )
    return [_build_preset_crud_response(row, current_user=current_user) for row in rows]


@router.post("/presets", response_model=PromptToolPresetCrudResponse, status_code=201)
async def create_prompt_tool_preset_route(
    request: PromptToolPresetCreateRequest,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> PromptToolPresetCrudResponse:
    """Create a user-owned prompt tool preset."""
    row = await create_prompt_tool_preset(
        current_user=current_user,
        db=db,
        preset_id=request.preset_id,
        label=request.label,
        description=request.description,
        category=request.category,
        enabled=request.enabled,
        requires=request.requires,
        defaults=request.defaults,
        is_public=request.is_public,
    )
    await db.commit()
    return _build_preset_crud_response(row, current_user=current_user)


@router.get("/presets/{entry_id}", response_model=PromptToolPresetCrudResponse)
async def get_prompt_tool_preset_route(
    entry_id: UUID,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> PromptToolPresetCrudResponse:
    """Get one prompt tool preset by entry UUID."""
    row = await get_prompt_tool_preset(
        current_user=current_user,
        db=db,
        entry_id=entry_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Prompt tool preset not found")
    return _build_preset_crud_response(row, current_user=current_user)


@router.patch("/presets/{entry_id}", response_model=PromptToolPresetCrudResponse)
async def update_prompt_tool_preset_route(
    entry_id: UUID,
    request: PromptToolPresetUpdateRequest,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> PromptToolPresetCrudResponse:
    """Patch mutable prompt tool preset fields."""
    if not request.model_fields_set:
        raise HTTPException(status_code=400, detail="No preset fields provided")

    row = await update_prompt_tool_preset(
        current_user=current_user,
        db=db,
        entry_id=entry_id,
        preset_id=request.preset_id,
        label=request.label,
        description=request.description,
        category=request.category,
        enabled=request.enabled,
        requires=request.requires,
        defaults=request.defaults,
        is_public=request.is_public,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Prompt tool preset not found")
    await db.commit()
    return _build_preset_crud_response(row, current_user=current_user)


@router.delete(
    "/presets/{entry_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
async def delete_prompt_tool_preset_route(
    entry_id: UUID,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> Response:
    """Delete a prompt tool preset entry."""
    deleted = await delete_prompt_tool_preset(
        current_user=current_user,
        db=db,
        entry_id=entry_id,
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Prompt tool preset not found")
    await db.commit()
    return Response(status_code=204)


@router.post(
    "/execute",
    response_model=PromptToolExecuteResponse,
    response_model_exclude_none=True,
)
async def execute_prompt_tool(
    request: PromptToolExecuteRequest,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> PromptToolExecuteResponse:
    """Execute a prompt tool preset and return normalized output."""
    preset = await resolve_prompt_tool_preset(
        preset_id=request.preset_id,
        current_user=current_user,
        db=db,
    )
    if preset is None or not preset.enabled:
        raise HTTPException(
            status_code=404,
            detail=f"Prompt tool preset '{request.preset_id}' not found",
        )

    assert_can_execute_prompt_tool(
        preset=preset,
        current_user=current_user,
    )

    raw_result = dispatch_prompt_tool_execution(
        preset=preset,
        prompt_text=request.prompt_text,
        params=request.params,
        run_context=request.run_context,
    )
    normalized = normalize_prompt_tool_execution_result(
        raw_result=raw_result,
        preset_id=preset.id,
        fallback_prompt_text=request.prompt_text,
    )
    return PromptToolExecuteResponse.model_validate(normalized)


def _build_preset_response(preset: PromptToolPresetRecord) -> PromptToolPresetResponse:
    owner = resolve_user_owner(
        model_owner_user_id=preset.owner_user_id,
        owner_payload=preset.owner_payload,
    )
    return PromptToolPresetResponse(
        id=preset.id,
        label=preset.label,
        description=preset.description,
        source=preset.source,
        category=preset.category,
        enabled=preset.enabled,
        requires=list(preset.requires),
        defaults=dict(preset.defaults),
        owner_user_id=owner.get("owner_user_id"),
        owner_ref=owner.get("owner_ref"),
        owner_username=owner.get("owner_username"),
    )


def _build_preset_crud_response(
    row: PromptToolPreset,
    *,
    current_user: Any,
) -> PromptToolPresetCrudResponse:
    owner_payload = row.owner_payload if isinstance(row.owner_payload, dict) else {}
    created_by = None
    if getattr(current_user, "id", None) == row.owner_user_id:
        created_by = getattr(current_user, "username", None)
    owner = resolve_user_owner(
        model_owner_user_id=row.owner_user_id,
        owner_payload=owner_payload,
        created_by=created_by,
    )
    source = "shared" if row.is_public and row.owner_user_id != getattr(current_user, "id", None) else "user"
    return PromptToolPresetCrudResponse(
        entry_id=row.id,
        id=row.preset_id,
        label=row.label,
        description=row.description or "",
        source=source,
        category=row.category,
        enabled=bool(row.enabled),
        requires=[value for value in (row.requires or []) if isinstance(value, str)],
        defaults=dict(row.defaults or {}),
        owner_user_id=owner.get("owner_user_id"),
        owner_ref=owner.get("owner_ref"),
        owner_username=owner.get("owner_username"),
        is_public=bool(row.is_public),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )
