"""Prompt tool catalog and execution API endpoints."""
from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from pixsim7.backend.main.api.dependencies import CurrentUser
from pixsim7.backend.main.services.ownership.user_owned import resolve_user_owner
from pixsim7.backend.main.services.prompt.tools import (
    assert_can_execute_prompt_tool,
    dispatch_prompt_tool_execution,
    list_prompt_tool_catalog,
    normalize_prompt_tool_execution_result,
    resolve_prompt_tool_preset,
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


@router.get("/catalog", response_model=PromptToolCatalogResponse)
async def list_prompt_tool_catalog_route(
    current_user: CurrentUser,
    scope: PromptToolCatalogScope = Query(
        PromptToolCatalogScope.ALL,
        description="Catalog scope: self | shared | builtin | all",
    ),
) -> PromptToolCatalogResponse:
    """List prompt tool presets by catalog scope."""
    presets = list_prompt_tool_catalog(
        scope=scope.value,
        current_user=current_user,
    )
    return PromptToolCatalogResponse(
        scope=scope.value,
        presets=[_build_preset_response(preset) for preset in presets],
    )


@router.post(
    "/execute",
    response_model=PromptToolExecuteResponse,
    response_model_exclude_none=True,
)
async def execute_prompt_tool(
    request: PromptToolExecuteRequest,
    current_user: CurrentUser,
) -> PromptToolExecuteResponse:
    """Execute a prompt tool preset and return normalized output."""
    preset = resolve_prompt_tool_preset(
        preset_id=request.preset_id,
        current_user=current_user,
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
