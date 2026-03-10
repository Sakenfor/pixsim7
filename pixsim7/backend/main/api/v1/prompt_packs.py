"""Prompt pack authoring API endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession
from pixsim7.backend.main.services.ownership.user_owned import (
    assert_can_write_user_owned,
    resolve_user_owner,
    resolve_user_owned_list_scope,
)
from pixsim7.backend.main.services.prompt.packs import (
    PromptPackCompileService,
    PromptPackDraftError,
    PromptPackDraftService,
    PromptPackVersionError,
    PromptPackVersionService,
)

router = APIRouter(prefix="/prompt-packs", tags=["prompt-packs"])


class PromptPackDraftCreate(BaseModel):
    namespace: Optional[str] = Field(default=None, max_length=255)
    pack_slug: str = Field(..., min_length=1, max_length=120)
    cue_source: str = Field(default="")
    status: Optional[str] = Field(default=None, max_length=32)


class PromptPackDraftUpdate(BaseModel):
    namespace: Optional[str] = Field(default=None, max_length=255)
    pack_slug: Optional[str] = Field(default=None, min_length=1, max_length=120)
    status: Optional[str] = Field(default=None, max_length=32)


class PromptPackDraftSourceUpdate(BaseModel):
    cue_source: str = Field(default="")


class PromptPackDraftResponse(BaseModel):
    id: UUID
    owner_user_id: int
    owner_ref: Optional[str] = None
    owner_username: Optional[str] = None
    namespace: str
    pack_slug: str
    status: str
    cue_source: str
    last_compile_status: Optional[str] = None
    last_compile_errors: List[Dict[str, Any]] = Field(default_factory=list)
    last_compiled_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class PromptPackCompileResponse(BaseModel):
    draft_id: UUID
    ok: bool
    status: str
    diagnostics: List[Dict[str, Any]] = Field(default_factory=list)
    pack_yaml: Optional[str] = None
    manifest_yaml: Optional[str] = None
    pack_json: Optional[Dict[str, Any]] = None
    blocks_json: List[Dict[str, Any]] = Field(default_factory=list)
    compiled_at: Optional[datetime] = None


class PromptPackVersionResponse(BaseModel):
    id: UUID
    draft_id: UUID
    owner_user_id: int
    owner_ref: Optional[str] = None
    owner_username: Optional[str] = None
    version: int
    cue_source: str
    compiled_schema_yaml: str
    compiled_manifest_yaml: str
    compiled_blocks_json: List[Dict[str, Any]] = Field(default_factory=list)
    checksum: str
    created_at: datetime


@router.post("/drafts", response_model=PromptPackDraftResponse, status_code=201)
async def create_prompt_pack_draft(
    request: PromptPackDraftCreate,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> PromptPackDraftResponse:
    """Create a new prompt pack draft for the current user."""
    service = PromptPackDraftService(db)
    try:
        draft = await service.create_draft(
            owner_user_id=current_user.id,
            namespace=request.namespace,
            pack_slug=request.pack_slug,
            cue_source=request.cue_source,
            status=request.status,
        )
        await db.commit()
    except PromptPackDraftError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return _build_draft_response(
        draft,
        current_user_id=current_user.id,
        current_username=current_user.username,
    )


@router.get("/drafts", response_model=List[PromptPackDraftResponse])
async def list_prompt_pack_drafts(
    current_user: CurrentUser,
    db: DatabaseSession,
    owner_user_id: Optional[int] = Query(None),
    mine: bool = Query(True, description="Return current user's drafts"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> List[PromptPackDraftResponse]:
    """List prompt pack drafts for the current user (or scoped owner for admin)."""
    scope = resolve_user_owned_list_scope(
        current_user=current_user,
        requested_owner_user_id=owner_user_id,
        requested_is_public=False,
        mine=mine,
        include_public_when_mine=False,
        mine_requires_auth_detail="Authentication required for mine=true",
        mine_forbidden_cross_owner_detail="Not allowed to query another user's drafts with mine=true",
        private_owner_forbidden_detail="Not allowed to query drafts of another user",
    )

    effective_owner = scope.owner_user_id if scope.owner_user_id is not None else current_user.id
    service = PromptPackDraftService(db)
    drafts = await service.list_drafts(
        owner_user_id=effective_owner,
        limit=limit,
        offset=offset,
    )
    return [
        _build_draft_response(
            draft,
            current_user_id=current_user.id,
            current_username=current_user.username,
        )
        for draft in drafts
    ]


@router.get("/drafts/{draft_id}", response_model=PromptPackDraftResponse)
async def get_prompt_pack_draft(
    draft_id: UUID,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> PromptPackDraftResponse:
    """Get a single prompt pack draft."""
    service = PromptPackDraftService(db)
    draft = await service.get_draft(draft_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")

    _assert_draft_access(draft=draft, current_user=current_user)
    return _build_draft_response(
        draft,
        current_user_id=current_user.id,
        current_username=current_user.username,
    )


@router.patch("/drafts/{draft_id}", response_model=PromptPackDraftResponse)
async def update_prompt_pack_draft(
    draft_id: UUID,
    request: PromptPackDraftUpdate,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> PromptPackDraftResponse:
    """Update draft metadata (namespace, slug, status)."""
    if request.namespace is None and request.pack_slug is None and request.status is None:
        raise HTTPException(status_code=400, detail="No metadata fields provided")

    service = PromptPackDraftService(db)
    draft = await service.get_draft(draft_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")

    _assert_draft_access(draft=draft, current_user=current_user)

    try:
        updated = await service.update_draft_metadata(
            draft_id=draft_id,
            owner_user_id=draft.owner_user_id,
            namespace=request.namespace,
            pack_slug=request.pack_slug,
            status=request.status,
        )
        if updated is None:
            raise HTTPException(status_code=404, detail="Draft not found")
        await db.commit()
    except PromptPackDraftError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return _build_draft_response(
        updated,
        current_user_id=current_user.id,
        current_username=current_user.username,
    )


@router.put("/drafts/{draft_id}/source", response_model=PromptPackDraftResponse)
async def replace_prompt_pack_draft_source(
    draft_id: UUID,
    request: PromptPackDraftSourceUpdate,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> PromptPackDraftResponse:
    """Replace CUE source and reset previous compile state."""
    service = PromptPackDraftService(db)
    draft = await service.get_draft(draft_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")

    _assert_draft_access(draft=draft, current_user=current_user)

    try:
        updated = await service.replace_draft_source(
            draft_id=draft_id,
            cue_source=request.cue_source,
        )
        if updated is None:
            raise HTTPException(status_code=404, detail="Draft not found")
        await db.commit()
    except PromptPackDraftError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return _build_draft_response(
        updated,
        current_user_id=current_user.id,
        current_username=current_user.username,
    )


@router.post("/drafts/{draft_id}/validate", response_model=PromptPackCompileResponse)
async def validate_prompt_pack_draft(
    draft_id: UUID,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> PromptPackCompileResponse:
    """Validate CUE draft source against prompt-pack contract."""
    draft_service = PromptPackDraftService(db)
    draft = await draft_service.get_draft(draft_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")

    _assert_draft_access(draft=draft, current_user=current_user)

    compile_service = PromptPackCompileService()
    result = await compile_service.validate_source(
        cue_source=draft.cue_source,
        namespace=draft.namespace,
    )

    try:
        updated = await draft_service.record_compile_result(
            draft_id=draft.id,
            status=result.status,
            diagnostics=result.diagnostics,
        )
        if updated is None:
            raise HTTPException(status_code=404, detail="Draft not found")
        await db.commit()
    except PromptPackDraftError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return PromptPackCompileResponse(
        draft_id=updated.id,
        ok=result.ok,
        status=result.status,
        diagnostics=result.diagnostics,
        compiled_at=updated.last_compiled_at,
    )


@router.post("/drafts/{draft_id}/compile", response_model=PromptPackCompileResponse)
async def compile_prompt_pack_draft(
    draft_id: UUID,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> PromptPackCompileResponse:
    """Compile CUE draft source and return generated artifacts."""
    draft_service = PromptPackDraftService(db)
    draft = await draft_service.get_draft(draft_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")

    _assert_draft_access(draft=draft, current_user=current_user)

    compile_service = PromptPackCompileService()
    result = await compile_service.compile_source(
        cue_source=draft.cue_source,
        namespace=draft.namespace,
    )

    try:
        updated = await draft_service.record_compile_result(
            draft_id=draft.id,
            status=result.status,
            diagnostics=result.diagnostics,
        )
        if updated is None:
            raise HTTPException(status_code=404, detail="Draft not found")
        await db.commit()
    except PromptPackDraftError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return PromptPackCompileResponse(
        draft_id=updated.id,
        ok=result.ok,
        status=result.status,
        diagnostics=result.diagnostics,
        pack_yaml=result.pack_yaml,
        manifest_yaml=result.manifest_yaml,
        pack_json=result.pack_json,
        blocks_json=result.blocks_json or [],
        compiled_at=updated.last_compiled_at,
    )


@router.post("/drafts/{draft_id}/versions", response_model=PromptPackVersionResponse, status_code=201)
async def create_prompt_pack_version(
    draft_id: UUID,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> PromptPackVersionResponse:
    """Create an immutable version snapshot from a compiled draft."""
    draft_service = PromptPackDraftService(db)
    draft = await draft_service.get_draft(draft_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")

    _assert_draft_access(draft=draft, current_user=current_user)

    version_service = PromptPackVersionService(db)
    try:
        version = await version_service.create_version_from_draft(draft)
        await db.commit()
    except PromptPackVersionError as exc:
        if exc.diagnostics:
            raise HTTPException(
                status_code=exc.status_code,
                detail={
                    "message": exc.message,
                    "diagnostics": exc.diagnostics,
                },
            )
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return _build_version_response(
        version=version,
        draft=draft,
        current_user_id=current_user.id,
        current_username=current_user.username,
    )


@router.get("/drafts/{draft_id}/versions", response_model=List[PromptPackVersionResponse])
async def list_prompt_pack_versions(
    draft_id: UUID,
    current_user: CurrentUser,
    db: DatabaseSession,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> List[PromptPackVersionResponse]:
    """List immutable versions for a draft."""
    draft_service = PromptPackDraftService(db)
    draft = await draft_service.get_draft(draft_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")

    _assert_draft_access(draft=draft, current_user=current_user)

    version_service = PromptPackVersionService(db)
    versions = await version_service.list_versions(
        draft_id=draft.id,
        limit=limit,
        offset=offset,
    )
    return [
        _build_version_response(
            version=version,
            draft=draft,
            current_user_id=current_user.id,
            current_username=current_user.username,
        )
        for version in versions
    ]


@router.get("/versions/{version_id}", response_model=PromptPackVersionResponse)
async def get_prompt_pack_version(
    version_id: UUID,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> PromptPackVersionResponse:
    """Get a single prompt pack version."""
    version_service = PromptPackVersionService(db)
    version = await version_service.get_version(version_id)
    if version is None:
        raise HTTPException(status_code=404, detail="Version not found")

    draft_service = PromptPackDraftService(db)
    draft = await draft_service.get_draft(version.draft_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Parent draft not found")

    _assert_draft_access(draft=draft, current_user=current_user)
    return _build_version_response(
        version=version,
        draft=draft,
        current_user_id=current_user.id,
        current_username=current_user.username,
    )


def _assert_draft_access(*, draft: Any, current_user: Any) -> None:
    assert_can_write_user_owned(
        user=current_user,
        owner_user_id=getattr(draft, "owner_user_id", None),
        denied_detail="Not allowed to access this draft",
    )


def _build_draft_response(
    draft: Any,
    *,
    current_user_id: Optional[int],
    current_username: Optional[str],
) -> PromptPackDraftResponse:
    created_by = None
    if current_user_id is not None and getattr(draft, "owner_user_id", None) == current_user_id:
        created_by = current_username
    owner_fields = resolve_user_owner(
        model_owner_user_id=getattr(draft, "owner_user_id", None),
        created_by=created_by,
    )

    errors = draft.last_compile_errors if isinstance(getattr(draft, "last_compile_errors", None), list) else []
    return PromptPackDraftResponse(
        id=draft.id,
        owner_user_id=draft.owner_user_id,
        owner_ref=owner_fields.get("owner_ref"),
        owner_username=owner_fields.get("owner_username"),
        namespace=draft.namespace,
        pack_slug=draft.pack_slug,
        status=draft.status,
        cue_source=draft.cue_source,
        last_compile_status=draft.last_compile_status,
        last_compile_errors=errors,
        last_compiled_at=draft.last_compiled_at,
        created_at=draft.created_at,
        updated_at=draft.updated_at,
    )


def _build_version_response(
    *,
    version: Any,
    draft: Any,
    current_user_id: Optional[int],
    current_username: Optional[str],
) -> PromptPackVersionResponse:
    created_by = None
    owner_user_id = getattr(draft, "owner_user_id", None)
    if current_user_id is not None and owner_user_id == current_user_id:
        created_by = current_username
    owner_fields = resolve_user_owner(
        model_owner_user_id=owner_user_id,
        created_by=created_by,
    )

    blocks = (
        version.compiled_blocks_json
        if isinstance(getattr(version, "compiled_blocks_json", None), list)
        else []
    )
    return PromptPackVersionResponse(
        id=version.id,
        draft_id=version.draft_id,
        owner_user_id=owner_user_id,
        owner_ref=owner_fields.get("owner_ref"),
        owner_username=owner_fields.get("owner_username"),
        version=version.version,
        cue_source=version.cue_source,
        compiled_schema_yaml=version.compiled_schema_yaml,
        compiled_manifest_yaml=version.compiled_manifest_yaml,
        compiled_blocks_json=blocks,
        checksum=version.checksum,
        created_at=version.created_at,
    )
