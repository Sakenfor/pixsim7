"""
Asset management API endpoints

Core CRUD operations. Additional endpoints split into:
- assets_maintenance.py: SHA stats, storage sync, backfill
- assets_bulk.py: Bulk operations (tags, delete, export)
- assets_tags.py: Tag management
- assets_upload_helper.py: Shared upload preparation logic
"""
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form
from fastapi import status as http_status
from fastapi.responses import FileResponse
from pixsim7.backend.main.shared.errors import InvalidOperationError
from pixsim7.backend.main.api.dependencies import CurrentUser, AssetSvc, AccountSvc, DatabaseSession
from pixsim7.backend.main.shared.schemas.asset_schemas import (
    AssetResponse,
    AssetListResponse,
)
from pixsim7.backend.main.shared.schemas.tag_schemas import TagSummary, AssignTagsRequest
from pixsim7.backend.main.services.tag_service import TagService
from pixsim7.backend.main.domain.enums import MediaType, SyncStatus, OperationType, ContentDomain
from pixsim7.backend.main.shared.errors import ResourceNotFoundError
import json
import os, tempfile, hashlib
from pydantic import BaseModel, Field
from typing import Optional, List, Any, Literal, Union
from enum import Enum
from uuid import UUID
from datetime import datetime
from pixsim7.backend.main.services.asset.asset_factory import add_asset
from pixsim7.backend.main.domain.assets.upload_attribution import (
    build_upload_attribution_context,
    infer_upload_method,
)
from pixsim7.backend.main.services.asset.filter_registry import asset_filter_registry
from pixsim7.backend.main.shared.upload_context_schema import (
    UPLOAD_CONTEXT_SPEC,
    normalize_upload_context,
)
from pixsim_logging import get_logger

# Shared helper (used by this module and sub-modules)
from pixsim7.backend.main.api.v1.assets_helpers import build_asset_response_with_tags
from pixsim7.backend.main.api.v1.assets_upload_helper import prepare_upload

# Sub-routers for modular organization
from pixsim7.backend.main.api.v1 import assets_maintenance
from pixsim7.backend.main.api.v1 import assets_bulk
from pixsim7.backend.main.api.v1 import assets_tags
from pixsim7.backend.main.api.v1 import assets_versions

router = APIRouter(prefix="/assets")
logger = get_logger()

# Include sub-routers
router.include_router(assets_maintenance.router)
router.include_router(assets_bulk.router)
router.include_router(assets_tags.router)
router.include_router(assets_versions.router)


# ===== ASSET SEARCH =====

class AssetGroupBy(str, Enum):
    source = "source"
    generation = "generation"
    prompt = "prompt"


class AssetGroupPathEntry(BaseModel):
    group_by: AssetGroupBy
    group_key: str


class AssetSearchRequest(BaseModel):
    """Request body for asset search."""
    filters: dict[str, Any] = Field(
        default_factory=dict,
        description="Filter key/value pairs (registry-defined)",
    )
    group_filter: dict[str, Any] | None = Field(
        None,
        description="Optional registry filters that scope grouping eligibility",
    )
    group_path: list[AssetGroupPathEntry] = Field(
        default_factory=list,
        description="Nested grouping path (ordered list of group_by + group_key)",
    )
    tag: str | list[str] | None = Field(None, description="Filter assets containing tag (slug)")
    q: Optional[str] = Field(None, description="Full-text search over description/tags")
    include_archived: bool = Field(False, description="Include archived assets (default: false)")
    searchable: Optional[bool] = Field(True, description="Filter by searchable flag (default: true)")

    created_from: datetime | None = Field(None, description="Filter by created_at >= value")
    created_to: datetime | None = Field(None, description="Filter by created_at <= value")
    min_width: int | None = Field(None, ge=0, description="Minimum width")
    max_width: int | None = Field(None, ge=0, description="Maximum width")
    min_height: int | None = Field(None, ge=0, description="Minimum height")
    max_height: int | None = Field(None, ge=0, description="Maximum height")

    content_domain: ContentDomain | None = Field(None, description="Filter by content domain")
    content_category: str | None = Field(None, description="Filter by content category")
    content_rating: str | None = Field(None, description="Filter by content rating")

    provider_status: str | None = Field(None, description="Filter by provider status (ok, local_only, flagged, unknown)")
    sync_status: SyncStatus | None = Field(None, description="Filter by sync status")

    source_generation_id: int | None = Field(None, description="Filter by source generation ID")
    source_asset_id: int | None = Field(None, description="Filter by source asset ID")
    operation_type: OperationType | None = Field(None, description="Filter by lineage operation type")
    has_parent: bool | None = Field(None, description="Has lineage parent")
    has_children: bool | None = Field(None, description="Has lineage children")

    prompt_version_id: UUID | None = Field(None, description="Filter by prompt version ID")

    group_by: AssetGroupBy | None = Field(None, description="Group key to filter assets by (source, generation, prompt)")
    group_key: str | None = Field(
        None,
        description="Group value to filter assets by (use 'ungrouped' or 'other')",
    )

    sort_by: str | None = Field(None, pattern=r"^(created_at|file_size_bytes)$", description="Sort field")
    sort_dir: str = Field("desc", pattern=r"^(asc|desc)$", description="Sort direction")

    limit: int = Field(50, ge=1, le=100, description="Results per page")
    offset: int = Field(0, ge=0, description="Pagination offset (legacy)")
    cursor: str | None = Field(None, description="Opaque cursor for pagination")

# ===== SEARCH ASSETS =====

@router.post("/search", response_model=AssetListResponse)
async def search_assets(
    user: CurrentUser,
    asset_service: AssetSvc,
    db: DatabaseSession,
    request: AssetSearchRequest,
):
    """Search assets for current user with filters and pagination.

    Supports either offset or cursor pagination (cursor takes precedence if provided).
    Assets returned newest first by default (created_at DESC, id DESC for tie-break).

    By default:
    - Archived assets are excluded. Set include_archived=true to show them.
    - Only searchable assets are shown. Set searchable=false to include hidden assets.
    """
    try:
        assets = await asset_service.list_assets(
            user=user,
            filters=request.filters,
            group_filter=request.group_filter,
            group_path=request.group_path,
            sync_status=request.sync_status,
            provider_status=request.provider_status,
            tag=request.tag,
            q=request.q,
            include_archived=request.include_archived,
            limit=request.limit,
            offset=request.offset if request.cursor is None else 0,
            cursor=request.cursor,
            # New search filters
            created_from=request.created_from,
            created_to=request.created_to,
            min_width=request.min_width,
            max_width=request.max_width,
            min_height=request.min_height,
            max_height=request.max_height,
            content_domain=request.content_domain,
            content_category=request.content_category,
            content_rating=request.content_rating,
            searchable=request.searchable,
            source_generation_id=request.source_generation_id,
            source_asset_id=request.source_asset_id,
            operation_type=request.operation_type,
            has_parent=request.has_parent,
            has_children=request.has_children,
            prompt_version_id=request.prompt_version_id,
            group_by=request.group_by.value if isinstance(request.group_by, Enum) else request.group_by,
            group_key=request.group_key,
            sort_by=request.sort_by,
            sort_dir=request.sort_dir,
        )

        # Simple total (future: separate COUNT query)
        total = len(assets)

        # Generate cursor for next page
        next_cursor = None
        if len(assets) == request.limit:
            last = assets[-1]
            # Opaque format: created_at|id
            next_cursor = f"{last.created_at.isoformat()}|{last.id}"

        # Build responses with tags
        asset_responses: list[AssetResponse] = []
        for a in assets:
            ar = await build_asset_response_with_tags(a, db)
            asset_responses.append(ar)

        return AssetListResponse(
            assets=asset_responses,
            total=total,
            limit=request.limit,
            offset=request.offset,
            next_cursor=next_cursor,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list assets: {str(e)}")


# ===== ASSET GROUPS =====

class AssetGroupRequest(AssetSearchRequest):
    """Request body for asset grouping."""
    group_by: AssetGroupBy = Field(..., description="Group assets by this key")
    preview_limit: int = Field(4, ge=0, le=12, description="Preview assets per group")

class AssetGroupSourceMeta(BaseModel):
    kind: Literal["source"] = "source"
    asset_id: int
    media_type: str
    created_at: datetime
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    preview_url: Optional[str] = None
    remote_url: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None


class AssetGroupGenerationMeta(BaseModel):
    kind: Literal["generation"] = "generation"
    generation_id: int
    provider_id: str
    operation_type: str
    status: Optional[str] = None
    created_at: datetime
    final_prompt: Optional[str] = None
    prompt_version_id: Optional[UUID] = None


class AssetGroupPromptMeta(BaseModel):
    kind: Literal["prompt"] = "prompt"
    prompt_version_id: UUID
    prompt_text: str
    commit_message: Optional[str] = None
    author: Optional[str] = None
    version_number: Optional[int] = None
    family_id: Optional[UUID] = None
    family_title: Optional[str] = None
    family_slug: Optional[str] = None
    created_at: datetime
    tags: List[str] = Field(default_factory=list)


AssetGroupMeta = Union[AssetGroupSourceMeta, AssetGroupGenerationMeta, AssetGroupPromptMeta]


class AssetGroupSummary(BaseModel):
    key: str
    count: int
    latest_created_at: datetime
    preview_assets: list[AssetResponse] = Field(default_factory=list)
    meta: Optional[AssetGroupMeta] = None


class AssetGroupListResponse(BaseModel):
    groups: list[AssetGroupSummary]
    total: int
    limit: int
    offset: int


@router.post("/groups", response_model=AssetGroupListResponse)
async def list_asset_groups(
    user: CurrentUser,
    asset_service: AssetSvc,
    db: DatabaseSession,
    request: AssetGroupRequest,
):
    """Group assets for the current user with filters and pagination."""
    try:
        group_by = request.group_by.value if isinstance(request.group_by, Enum) else request.group_by
        groups, total_groups = await asset_service.list_asset_groups(
            user=user,
            group_by=group_by,
            filters=request.filters,
            group_filter=request.group_filter,
            group_path=request.group_path,
            sync_status=request.sync_status,
            provider_status=request.provider_status,
            tag=request.tag,
            q=request.q,
            include_archived=request.include_archived,
            searchable=request.searchable,
            created_from=request.created_from,
            created_to=request.created_to,
            min_width=request.min_width,
            max_width=request.max_width,
            min_height=request.min_height,
            max_height=request.max_height,
            content_domain=request.content_domain,
            content_category=request.content_category,
            content_rating=request.content_rating,
            source_generation_id=request.source_generation_id,
            source_asset_id=request.source_asset_id,
            prompt_version_id=request.prompt_version_id,
            operation_type=request.operation_type,
            has_parent=request.has_parent,
            has_children=request.has_children,
            limit=request.limit,
            offset=request.offset,
            preview_limit=request.preview_limit,
        )

        meta_map: dict[str, AssetGroupMeta] = {}
        group_keys = [
            group.key
            for group in groups
            if group.key and group.key not in {"ungrouped", "other"}
        ]

        if group_keys:
            if group_by == "source":
                from sqlalchemy import select
                from pixsim7.backend.main.domain import Asset

                source_ids: list[int] = []
                for key in group_keys:
                    try:
                        source_ids.append(int(key))
                    except (TypeError, ValueError):
                        continue
                if source_ids:
                    result = await db.execute(select(Asset).where(Asset.id.in_(source_ids)))
                    for asset in result.scalars().all():
                        asset_response = AssetResponse.model_validate(asset)
                        media_type = (
                            asset_response.media_type.value
                            if hasattr(asset_response.media_type, "value")
                            else str(asset_response.media_type)
                        )
                        meta_map[str(asset.id)] = AssetGroupSourceMeta(
                            asset_id=asset.id,
                            media_type=media_type,
                            created_at=asset.created_at,
                            description=asset.description,
                            thumbnail_url=asset_response.thumbnail_url,
                            preview_url=asset_response.preview_url,
                            remote_url=asset_response.remote_url,
                            width=asset_response.width,
                            height=asset_response.height,
                        )
            elif group_by == "generation":
                from sqlalchemy import select
                from pixsim7.backend.main.domain import Generation

                generation_ids: list[int] = []
                for key in group_keys:
                    try:
                        generation_ids.append(int(key))
                    except (TypeError, ValueError):
                        continue
                if generation_ids:
                    result = await db.execute(
                        select(Generation).where(Generation.id.in_(generation_ids))
                    )
                    for generation in result.scalars().all():
                        operation_type = (
                            generation.operation_type.value
                            if hasattr(generation.operation_type, "value")
                            else str(generation.operation_type)
                        )
                        status_value = (
                            generation.status.value
                            if hasattr(generation.status, "value")
                            else str(generation.status)
                        )
                        meta_map[str(generation.id)] = AssetGroupGenerationMeta(
                            generation_id=generation.id,
                            provider_id=generation.provider_id,
                            operation_type=operation_type,
                            status=status_value,
                            created_at=generation.created_at,
                            final_prompt=generation.final_prompt,
                            prompt_version_id=generation.prompt_version_id,
                        )
            elif group_by == "prompt":
                from sqlalchemy import select
                from pixsim7.backend.main.domain import PromptVersion, PromptFamily

                prompt_ids: list[UUID] = []
                for key in group_keys:
                    try:
                        prompt_ids.append(UUID(key))
                    except (TypeError, ValueError):
                        continue
                if prompt_ids:
                    result = await db.execute(
                        select(PromptVersion, PromptFamily)
                        .outerjoin(PromptFamily, PromptFamily.id == PromptVersion.family_id)
                        .where(PromptVersion.id.in_(prompt_ids))
                    )
                    for version, family in result.all():
                        meta_map[str(version.id)] = AssetGroupPromptMeta(
                            prompt_version_id=version.id,
                            prompt_text=version.prompt_text,
                            commit_message=version.commit_message,
                            author=version.author,
                            version_number=version.version_number,
                            family_id=version.family_id,
                            family_title=family.title if family else None,
                            family_slug=family.slug if family else None,
                            created_at=version.created_at,
                            tags=list(version.tags or []),
                        )

        response_groups: list[AssetGroupSummary] = []
        for group in groups:
            previews: list[AssetResponse] = []
            for asset in group.preview_assets:
                previews.append(await build_asset_response_with_tags(asset, db))
            response_groups.append(
                AssetGroupSummary(
                    key=group.key,
                    count=group.count,
                    latest_created_at=group.latest_created_at,
                    preview_assets=previews,
                    meta=meta_map.get(group.key),
                )
            )

        return AssetGroupListResponse(
            groups=response_groups,
            total=total_groups,
            limit=request.limit,
            offset=request.offset,
        )
    except Exception as e:
        logger.error("asset_groups_failed", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to group assets: {str(e)}")


# ===== FILTER OPTIONS =====

class FilterDefinition(BaseModel):
    """Definition of a single filter field."""
    key: str = Field(description="Filter parameter key")
    type: str = Field(description="Filter type: enum, boolean, search, autocomplete")
    label: Optional[str] = Field(None, description="Display label (optional, frontend can override)")
    description: Optional[str] = Field(None, description="Optional description for UI")
    depends_on: dict[str, list[str]] | None = Field(
        None,
        description="Context dependencies for showing this filter",
    )
    multi: Optional[bool] = Field(None, description="Allows selecting multiple values")
    match_modes: Optional[List[str]] = Field(
        None,
        description="Supported match modes (e.g., any/all)",
    )


class FilterOptionValue(BaseModel):
    """A single option value for enum/autocomplete filters."""
    value: str = Field(description="The filter value to use in query")
    label: Optional[str] = Field(None, description="Display label")
    count: Optional[int] = Field(None, description="Number of assets with this value")


class FilterOptionsRequest(BaseModel):
    """Request for filter definitions and options."""
    context: dict[str, Any] = Field(
        default_factory=dict,
        description="Current filter context (used for dependent filters)",
    )
    include_counts: bool = Field(False, description="Include asset counts per option (slower)")
    include: list[str] | None = Field(
        None,
        description="Optional filter keys to include (repeat or comma-separated)",
    )
    limit: int | None = Field(None, ge=1, le=500, description="Optional max options per filter")


class FilterOptionsResponse(BaseModel):
    """Response containing available filters and their options."""
    filters: List[FilterDefinition] = Field(description="Available filter definitions")
    options: dict[str, List[FilterOptionValue]] = Field(
        default_factory=dict,
        description="Available options per filter key (for enum types)",
    )


class UploadContextSchemaResponse(BaseModel):
    """Schema for upload_context fields by upload method."""
    schema_: dict[str, Any] = Field(alias="schema")


@router.post("/filter-options", response_model=FilterOptionsResponse)
async def get_filter_options(
    user: CurrentUser,
    db: DatabaseSession,
    request: FilterOptionsRequest,
):
    """
    Get available filter definitions and options for the assets gallery.

    The frontend should use this to dynamically render filter UI.
    Filter types:
    - enum: Dropdown with predefined options
    - boolean: Toggle/checkbox
    - search: Free-text search input
    - autocomplete: Async search (use /tags endpoint for values)
    """
    include_keys = None
    if request.include:
        include_keys = []
        for entry in request.include:
            if not entry:
                continue
            include_keys.extend([key for key in entry.split(",") if key])

    context = request.context or None
    filters = [
        FilterDefinition(
            key=spec.key,
            type=spec.type,
            label=spec.label,
            description=spec.description,
            depends_on={k: sorted(v) for k, v in spec.depends_on.items()} if spec.depends_on else None,
            multi=spec.multi,
            match_modes=sorted(spec.match_modes) if spec.match_modes else None,
        )
        for spec in asset_filter_registry.list_filters(include=include_keys, context=context)
    ]

    try:
        options_raw = await asset_filter_registry.build_options(
            db,
            user=user,
            include_counts=request.include_counts,
            include=include_keys,
            context=context,
            limit=request.limit,
        )
        options: dict[str, List[FilterOptionValue]] = {}
        for key, values in options_raw.items():
            options[key] = [
                FilterOptionValue(value=value, label=label, count=count)
                for value, label, count in values
            ]

        return FilterOptionsResponse(filters=filters, options=options)

    except Exception as e:
        logger.error("filter_options_failed", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get filter options: {str(e)}")


@router.get("/upload-context-schema", response_model=UploadContextSchemaResponse)
async def get_upload_context_schema():
    """Return the upload context schema for clients (extension, UI)."""
    return UploadContextSchemaResponse(schema=UPLOAD_CONTEXT_SPEC)


# ===== AUTOCOMPLETE =====

class AutocompleteResponse(BaseModel):
    """Response containing autocomplete suggestions."""
    suggestions: List[str] = Field(description="List of autocomplete suggestions")


@router.get("/autocomplete", response_model=AutocompleteResponse)
async def autocomplete_assets(
    user: CurrentUser,
    db: DatabaseSession,
    query: str = Query(..., min_length=2, max_length=100, description="Search query"),
    limit: int = Query(10, ge=1, le=50, description="Maximum number of suggestions"),
):
    """
    Lightweight autocomplete for asset descriptions and tags.

    Returns matching suggestions from:
    - Asset descriptions
    - Tag display names

    Use this for search input autocomplete.
    """
    from sqlalchemy import union_all, distinct
    from pixsim7.backend.main.domain.assets.models import Asset
    from pixsim7.backend.main.domain.assets.tag import AssetTag, Tag

    like = f"%{query}%"

    try:
        # Search descriptions (distinct values containing query)
        desc_query = (
            select(Asset.description.label('suggestion'))
            .where(
                Asset.user_id == user.id,
                Asset.description.isnot(None),
                Asset.description.ilike(like),
                Asset.is_archived == False,
            )
            .distinct()
            .limit(limit)
        )

        # Search tags (distinct display names containing query)
        tag_query = (
            select(Tag.display_name.label('suggestion'))
            .select_from(Tag)
            .join(AssetTag, Tag.id == AssetTag.tag_id)
            .join(Asset, Asset.id == AssetTag.asset_id)
            .where(
                Asset.user_id == user.id,
                Tag.display_name.isnot(None),
                Tag.display_name.ilike(like),
                Asset.is_archived == False,
            )
            .distinct()
            .limit(limit)
        )

        # Combine and limit total results
        combined = union_all(desc_query, tag_query).limit(limit)
        result = await db.execute(combined)

        suggestions = [r.suggestion for r in result.all() if r.suggestion]
        return AutocompleteResponse(suggestions=suggestions[:limit])

    except Exception as e:
        logger.error("autocomplete_failed", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get autocomplete suggestions: {str(e)}")


# ===== GET ASSET =====

@router.get("/{asset_id}", response_model=AssetResponse)
async def get_asset(
    asset_id: int,
    user: CurrentUser,
    asset_service: AssetSvc,
    db: DatabaseSession,
):
    """
    Get asset details

    Returns detailed information about a specific asset including:
    - URLs (provider and local)
    - Sync status
    - Video metadata (duration, resolution, format)
    - Thumbnail

    Users can only access their own assets.
    """
    try:
        asset = await asset_service.get_asset_for_user(asset_id, user)
        return await build_asset_response_with_tags(asset, db)

    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Asset not found")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get asset: {str(e)}")


# ===== CHECK ASSET BY HASH =====

class CheckByHashRequest(BaseModel):
    """Request body for checking if an asset exists by SHA256 hash."""
    sha256: str = Field(..., min_length=64, max_length=64, description="SHA256 hash of file content")
    provider_id: Optional[str] = Field(None, description="Optional: Check if uploaded to specific provider")


class CheckByHashResponse(BaseModel):
    """Response for hash check - returns asset info if found."""
    exists: bool = Field(..., description="Whether an asset with this hash exists")
    asset_id: Optional[int] = Field(None, description="Asset ID if found")
    provider_id: Optional[str] = Field(None, description="Original provider ID if found")
    uploaded_to_providers: Optional[List[str]] = Field(None, description="List of providers this asset is uploaded to")
    note: Optional[str] = Field(None, description="Additional information")


@router.post("/check-by-hash", response_model=CheckByHashResponse)
async def check_asset_by_hash(
    user: CurrentUser,
    asset_service: AssetSvc,
    request: CheckByHashRequest,
):
    """
    Check if an asset with the given SHA256 hash already exists for the current user.

    Returns asset metadata if found. This is a read-only check that does NOT
    update last_accessed_at or modify any data.

    Use this before uploading to avoid duplicate uploads.
    """
    try:
        # Find asset by hash (read-only, doesn't update last_accessed_at)
        from sqlmodel import select
        from pixsim7.backend.main.domain.assets.models import Asset

        stmt = select(Asset).where(
            Asset.user_id == user.id,
            Asset.sha256 == request.sha256
        )
        result = await asset_service.db.execute(stmt)
        asset = result.scalars().first()

        if not asset:
            return CheckByHashResponse(
                exists=False,
                note="No asset found with this hash"
            )

        # Build list of providers this asset is uploaded to
        uploaded_providers = [asset.provider_id]
        if asset.provider_uploads:
            uploaded_providers.extend(asset.provider_uploads.keys())

        # Check if uploaded to specific provider (if requested)
        note = "Asset exists"
        if request.provider_id:
            if request.provider_id in uploaded_providers:
                note = f"Asset already uploaded to {request.provider_id}"
            else:
                note = f"Asset exists but not uploaded to {request.provider_id}"

        return CheckByHashResponse(
            exists=True,
            asset_id=asset.id,
            provider_id=asset.provider_id,
            uploaded_to_providers=uploaded_providers,
            note=note
        )

    except Exception as e:
        logger.error(
            "check_by_hash_failed",
            sha256=request.sha256[:16],
            error=str(e),
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check asset by hash: {str(e)}"
        )


# ===== BATCH CHECK ASSETS BY HASH =====

class BatchCheckByHashRequest(BaseModel):
    """Request body for checking multiple assets by SHA256 hashes."""
    hashes: List[str] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="List of SHA256 hashes to check (max 500)"
    )


class BatchHashResult(BaseModel):
    """Result for a single hash in batch check."""
    sha256: str
    exists: bool
    asset_id: Optional[int] = None


class BatchCheckByHashResponse(BaseModel):
    """Response for batch hash check."""
    results: List[BatchHashResult] = Field(..., description="Results for each hash")
    found_count: int = Field(..., description="Number of hashes that matched existing assets")


@router.post("/check-by-hash-batch", response_model=BatchCheckByHashResponse)
async def check_assets_by_hash_batch(
    user: CurrentUser,
    asset_service: AssetSvc,
    request: BatchCheckByHashRequest,
):
    """
    Check if assets with the given SHA256 hashes already exist for the current user.

    Returns a list of results indicating which hashes have matching assets.
    This is a read-only check that does NOT modify any data.

    Use this to check multiple local files at once before uploading.
    """
    try:
        from sqlmodel import select
        from pixsim7.backend.main.domain.assets.models import Asset

        # Validate hashes (64 hex chars)
        valid_hashes = [h for h in request.hashes if len(h) == 64]
        if not valid_hashes:
            return BatchCheckByHashResponse(results=[], found_count=0)

        # Query all matching assets in one query
        stmt = select(Asset.sha256, Asset.id).where(
            Asset.user_id == user.id,
            Asset.sha256.in_(valid_hashes)
        )
        result = await asset_service.db.execute(stmt)
        found_assets = {row.sha256: row.id for row in result.all()}

        # Build results
        results = []
        for sha256 in valid_hashes:
            asset_id = found_assets.get(sha256)
            results.append(BatchHashResult(
                sha256=sha256,
                exists=asset_id is not None,
                asset_id=asset_id
            ))

        return BatchCheckByHashResponse(
            results=results,
            found_count=len(found_assets)
        )

    except Exception as e:
        logger.error(
            "batch_check_by_hash_failed",
            hash_count=len(request.hashes),
            error=str(e),
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check assets by hash: {str(e)}"
        )


@router.post("/{asset_id}/sync", response_model=AssetResponse, status_code=http_status.HTTP_200_OK)
async def sync_asset(asset_id: int, user: CurrentUser, asset_service: AssetSvc):
    """Download remote provider asset locally and optionally extract embedded assets."""
    try:
        asset = await asset_service.sync_asset(asset_id=asset_id, user=user)
        return AssetResponse.model_validate(asset)
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Asset sync failed")


# ===== DELETE ASSET =====

@router.delete("/{asset_id}", status_code=204)
async def delete_asset(
    asset_id: int,
    user: CurrentUser,
    asset_service: AssetSvc,
    delete_from_provider: bool = Query(
        default=True,
        description="Also delete asset from provider if it has a provider_asset_id"
    ),
):
    """
    Delete an asset

    Deletes the asset record and local file (if downloaded).
    Optionally deletes the asset from the provider (enabled by default).

    Users can only delete their own assets.
    """
    try:
        await asset_service.delete_asset(asset_id, user, delete_from_provider=delete_from_provider)
        return None

    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Asset not found")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete asset: {str(e)}")


# ===== ARCHIVE ASSET =====

class ArchiveAssetRequest(BaseModel):
    """Request body for archive/unarchive operation."""
    archived: bool = Field(description="True to archive, False to unarchive")


class ArchiveAssetResponse(BaseModel):
    """Response for archive operation."""
    id: int
    is_archived: bool
    message: str


@router.patch("/{asset_id}/archive", response_model=ArchiveAssetResponse)
async def archive_asset(
    asset_id: int,
    request: ArchiveAssetRequest,
    user: CurrentUser,
    asset_service: AssetSvc,
    db: DatabaseSession,
):
    """
    Archive or unarchive an asset.

    Archived assets are soft-hidden from the default gallery view but remain
    in the database and can be restored at any time.

    Example request:
    ```json
    {"archived": true}
    ```
    """
    try:
        asset = await asset_service.get_asset_for_user(asset_id, user)
        asset.is_archived = request.archived
        db.add(asset)
        await db.commit()
        await db.refresh(asset)

        action = "archived" if request.archived else "unarchived"
        return ArchiveAssetResponse(
            id=asset.id,
            is_archived=asset.is_archived,
            message=f"Asset {action} successfully"
        )

    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Asset not found")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.error(
            "archive_asset_failed",
            asset_id=asset_id,
            archived=request.archived,
            error=str(e),
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail=f"Failed to archive asset: {str(e)}")


# ===== SERVE LOCAL ASSET FILE =====

@router.get("/{asset_id}/file")
async def serve_asset_file(
    asset_id: int,
    user: CurrentUser,
    asset_service: AssetSvc
):
    """
    Serve locally-stored asset file

    Returns the local file if it exists and the user owns the asset.
    This allows the frontend to display locally-stored assets even if
    the remote provider URL is unavailable or invalid.

    Prioritizes stored_key (content-addressed) over local_path for
    better deduplication support.
    """
    try:
        asset = await asset_service.get_asset_for_user(asset_id, user)

        # Determine file path to serve (prioritize stored_key for content-addressed storage)
        file_path = None
        if asset.stored_key:
            from pixsim7.backend.main.services.storage.storage_service import get_storage_service
            storage_service = get_storage_service()
            file_path = storage_service.get_path(asset.stored_key)
        elif asset.local_path:
            file_path = asset.local_path

        if not file_path:
            raise HTTPException(
                status_code=404,
                detail="Asset has no local file (sync_status is REMOTE)"
            )

        if not os.path.exists(file_path):
            raise HTTPException(
                status_code=404,
                detail=f"Local file not found at {file_path}"
            )

        # Determine media type
        media_type = asset.mime_type or "application/octet-stream"

        return FileResponse(
            path=file_path,
            media_type=media_type,
            filename=f"asset_{asset.id}{os.path.splitext(file_path)[1]}"
        )

    except HTTPException:
        raise
    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Asset not found")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.error(
            "serve_asset_file_failed",
            asset_id=asset_id,
            error=str(e),
            exc_info=True
        )
        raise HTTPException(status_code=500, detail=f"Failed to serve file: {str(e)}")


# ===== ASSET SIBLINGS (Same Input Variations) =====

@router.get("/{asset_id}/siblings")
async def get_asset_siblings(
    asset_id: int,
    user: CurrentUser,
    db: DatabaseSession,
    workspace_id: Optional[int] = Query(None, description="Filter by workspace"),
):
    """
    Find sibling assets - variations generated from the same inputs.

    Siblings share the same reproducible_hash (same prompt + same input assets).
    Useful for finding all variations of a generation attempt.

    Returns only assets owned by the current user for privacy.
    """
    from pixsim7.backend.main.services.generation.synthetic import find_sibling_assets

    try:
        siblings = await find_sibling_assets(
            db,
            asset_id=asset_id,
            user_id=user.id,
            workspace_id=workspace_id,
        )

        return {
            "asset_id": asset_id,
            "sibling_count": len(siblings),
            "siblings": [
                {
                    "id": s.id,
                    "provider_id": s.provider_id,
                    "provider_asset_id": s.provider_asset_id,
                    "media_type": s.media_type.value if s.media_type else None,
                    "thumbnail_url": s.thumbnail_url,
                    "remote_url": s.remote_url,
                    "created_at": s.created_at.isoformat() if s.created_at else None,
                }
                for s in siblings
            ],
        }
    except Exception as e:
        logger.error(
            "get_asset_siblings_failed",
            asset_id=asset_id,
            user_id=user.id,
            error=str(e),
            exc_info=True
        )
        raise HTTPException(status_code=500, detail=f"Failed to find siblings: {str(e)}")


# ===== UPLOAD MEDIA (Provider-hosted) =====

class UploadAssetResponse(BaseModel):
    provider_id: str
    media_type: MediaType
    external_url: str | None = None
    provider_asset_id: str | None = None
    asset_id: int | None = None
    note: str | None = None


@router.post("/upload", response_model=UploadAssetResponse)
async def upload_asset_to_provider(
    user: CurrentUser,
    db: DatabaseSession,
    account_service: AccountSvc,
    asset_service: AssetSvc,
    file: UploadFile = File(...),
    provider_id: str = Form(...),
    source_folder_id: Optional[str] = Form(None),
    source_relative_path: Optional[str] = Form(None),
    upload_method: Optional[str] = Form(
        None,
        description="Upload method identifier (e.g., web, local, pixverse_sync, generated)",
    ),
    upload_context: Optional[str] = Form(
        None,
        description="Optional JSON-encoded upload context",
    ),
):
    """
    Upload media to the specified provider (no cross-provider Pixverse override).

    Pixverse: OpenAPI usage is internal preference via UploadService (based on api_keys).
    If provider rejects (e.g., unsupported mime/dimensions), returns error.

    Optional source tracking fields:
    - source_folder_id: ID of local folder if uploaded from Local Folders panel
    - source_relative_path: Relative path within folder if uploaded from Local Folders
    - upload_method: Explicit upload method override (e.g., extension, api)
    - upload_context: JSON-encoded object with additional context
    """
    content_type = file.content_type or ""
    media_type = MediaType.IMAGE if content_type.startswith("image/") else MediaType.VIDEO if content_type.startswith("video/") else None
    if media_type is None:
        raise HTTPException(status_code=400, detail=f"Unsupported content type: {content_type}")

    # Save to temp
    try:
        suffix = os.path.splitext(file.filename or "upload.bin")[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {e}")

    ext = os.path.splitext(file.filename or "upload.bin")[1] or (
        ".mp4" if media_type == MediaType.VIDEO else ".jpg"
    )
    prep = await prepare_upload(
        tmp_path=tmp_path,
        user_id=user.id,
        media_type=media_type,
        asset_service=asset_service,
        provider_id=provider_id,
        file_ext=ext,
    )

    sha256 = prep.sha256
    image_hash = prep.image_hash
    phash64 = prep.phash64
    width = prep.width
    height = prep.height
    stored_key = prep.stored_key
    local_path = prep.local_path
    existing = prep.existing_asset

    if existing and prep.dedup_note and "already on" in prep.dedup_note:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

        existing_external = existing.remote_url
        if not existing_external or not (
            isinstance(existing_external, str)
            and (existing_external.startswith("http://") or existing_external.startswith("https://"))
        ):
            existing_external = f"/api/v1/assets/{existing.id}/file"

        provider_specific_id = existing.provider_uploads.get(provider_id) if existing.provider_uploads else None
        if not provider_specific_id:
            provider_specific_id = existing.provider_asset_id

        return UploadAssetResponse(
            provider_id=provider_id,
            media_type=existing.media_type,
            external_url=existing_external,
            provider_asset_id=provider_specific_id,
            asset_id=existing.id,
            note=prep.dedup_note,
        )

    if existing:
        already_on_provider = (
            existing.provider_id == provider_id or
            provider_id in (existing.provider_uploads or {})
        )
        if not already_on_provider:
            logger.info(
                "asset_cross_provider_upload",
                asset_id=existing.id,
                original_provider=existing.provider_id,
                target_provider=provider_id,
                detail="Uploading duplicate asset to additional provider",
            )

    # Use UploadService
    from pixsim7.backend.main.services.upload.upload_service import UploadService
    upload_service = UploadService(db, account_service)
    try:
        result = await upload_service.upload(provider_id=provider_id, media_type=media_type, tmp_path=tmp_path)
        # Persist as Asset (best-effort):
        # Derive provider_asset_id and remote_url with fallbacks
        provider_asset_id_raw = result.provider_asset_id or (result.external_url or "")
        remote_url = result.external_url or (f"{provider_id}:{provider_asset_id_raw}")
        # Ensure provider_asset_id fits DB constraints (max_length=128)
        if provider_asset_id_raw:
            provider_asset_id = str(provider_asset_id_raw)
            if len(provider_asset_id) > 120:
                digest = hashlib.sha256(remote_url.encode("utf-8")).hexdigest()[:16]
                provider_asset_id = f"upload_{digest}"
        else:
            digest = hashlib.sha256(remote_url.encode("utf-8")).hexdigest()[:16]
            provider_asset_id = f"upload_{digest}"

        # Determine upload method (canonical source)
        upload_method = infer_upload_method(
            upload_method=upload_method,
            source_folder_id=source_folder_id,
        )

        # Parse optional upload context (JSON-encoded)
        upload_context_payload = None
        if upload_context:
            try:
                upload_context_payload = json.loads(upload_context)
            except json.JSONDecodeError as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"upload_context must be valid JSON: {e}",
                )
            if not isinstance(upload_context_payload, dict):
                raise HTTPException(
                    status_code=400,
                    detail="upload_context must be a JSON object",
                )

        context_input = dict(upload_context_payload or {})
        if source_folder_id and "source_folder_id" not in context_input:
            context_input["source_folder_id"] = source_folder_id
        if source_relative_path and "source_relative_path" not in context_input:
            context_input["source_relative_path"] = source_relative_path
        normalized_context = normalize_upload_context(upload_method, context_input)

        # Build upload attribution metadata (rich context only)
        upload_attribution = build_upload_attribution_context(
            upload_context=normalized_context,
        )

        media_metadata = {}
        if upload_attribution:
            media_metadata["upload_attribution"] = upload_attribution

        created_asset_id = None
        try:
            # Check if we're updating an existing asset (cross-provider upload)
            if existing and not (existing.provider_id == provider_id or provider_id in (existing.provider_uploads or {})):
                # Update existing asset with new provider mapping
                if not existing.provider_uploads:
                    existing.provider_uploads = {}
                existing.provider_uploads[provider_id] = provider_asset_id

                # Mark as modified
                db.add(existing)
                await db.commit()
                await db.refresh(existing)

                logger.info(
                    "asset_provider_uploads_updated",
                    asset_id=existing.id,
                    provider_id=provider_id,
                    provider_asset_id=provider_asset_id,
                )

                # Return existing asset with new provider info
                return UploadAssetResponse(
                    provider_id=provider_id,
                    media_type=existing.media_type,
                    external_url=remote_url,
                    provider_asset_id=provider_asset_id,
                    asset_id=existing.id,
                    note=f"Reused existing asset (deduplicated by sha256, uploaded to {provider_id})",
                )
            else:
                # Create new asset with CAS storage
                new_asset = await add_asset(
                    db,
                    user_id=user.id,
                    media_type=media_type,
                    provider_id=provider_id,
                    provider_asset_id=provider_asset_id,
                    remote_url=remote_url,
                    width=width or result.width,
                    height=height or result.height,
                    duration_sec=None,
                    mime_type=result.mime_type or content_type,
                    file_size_bytes=result.file_size_bytes,
                    sha256=sha256,
                    stored_key=stored_key,
                    local_path=local_path,
                    sync_status=SyncStatus.DOWNLOADED if stored_key else SyncStatus.REMOTE,
                    image_hash=image_hash,
                    phash64=phash64,
                    media_metadata=media_metadata or None,
                    upload_method=upload_method,
                    upload_context=normalized_context or None,
                )

                if new_asset:
                    created_asset_id = new_asset.id

                # Queue thumbnail generation if we have a local copy
                if stored_key and new_asset:
                    try:
                        from pixsim7.backend.main.services.asset.ingestion import AssetIngestionService
                        ingestion_service = AssetIngestionService(db)
                        await ingestion_service.queue_ingestion(new_asset.id)
                    except Exception as e:
                        logger.warning(
                            "thumbnail_queue_failed",
                            asset_id=new_asset.id,
                            error=str(e),
                        )

                # Record upload history
                if new_asset:
                    try:
                        await asset_service.record_upload_attempt(
                            new_asset,
                            provider_id=provider_id,
                            status='success',
                            method='upload_to_provider',
                            context={"upload_method": upload_method},
                        )
                    except Exception as e:
                        logger.warning(
                            "upload_history_record_failed",
                            asset_id=new_asset.id,
                            error=str(e),
                        )

                # Create lineage if source_asset_id provided (for video captures and image crops)
                source_asset_id = normalized_context.get('source_asset_id') if normalized_context else None
                if source_asset_id and new_asset:
                    from pixsim7.backend.main.services.asset.asset_factory import create_lineage_links
                    from pixsim7.backend.main.domain.relation_types import PAUSED_FRAME, CROPPED_REGION

                    relation_type = PAUSED_FRAME if upload_method == 'video_capture' else CROPPED_REGION

                    try:
                        await create_lineage_links(
                            db,
                            child_asset_id=new_asset.id,
                            parent_asset_ids=[source_asset_id],
                            relation_type=relation_type,
                            operation_type=OperationType.FRAME_EXTRACTION,
                        )
                        logger.info(
                            "capture_lineage_created",
                            child_asset_id=new_asset.id,
                            parent_asset_id=source_asset_id,
                            relation_type=relation_type,
                            upload_method=upload_method,
                        )
                    except Exception as e:
                        logger.warning(
                            "capture_lineage_failed",
                            child_asset_id=new_asset.id,
                            parent_asset_id=source_asset_id,
                            error=str(e),
                        )
        except Exception as e:
            # Non-fatal if asset creation fails; log and return upload response anyway
            logger.error(
                "asset_create_failed",
                provider_id=provider_id,
                media_type=str(media_type),
                remote_url=remote_url,
                error=str(e),
                exc_info=True,
            )
        return UploadAssetResponse(
            provider_id=result.provider_id,
            media_type=result.media_type,
            external_url=result.external_url,
            provider_asset_id=result.provider_asset_id,
            asset_id=created_asset_id,
            note=result.note,
        )
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Provider upload failed: {e}")
    finally:
        try:
            os.unlink(tmp_path)
        except Exception as e:
            logger.warning(
                "temp_file_cleanup_failed",
                file_path=tmp_path,
                error=str(e),
                detail="Failed to clean up temporary file after upload"
              )



# ===== UPLOAD FROM URL (backend fetches the image) =====

class UploadFromUrlRequest(BaseModel):
    url: str = Field(description="Publicly accessible URL to image/video")
    provider_id: str = Field(description="Target provider ID, e.g., pixverse")
    ensure_asset: bool = Field(
        default=True,
        description=(
            "If true (default), always persist a local asset even when the "
            "provider upload fails. If false, provider upload failures will "
            "roll back the asset creation and return an error."
        ),
    )
    source_url: Optional[str] = Field(
        default=None,
        description="Full page URL where asset was found (for extension uploads)"
    )
    source_site: Optional[str] = Field(
        default=None,
        description="Hostname/domain of source site (e.g., twitter.com)"
    )
    upload_method: Optional[str] = Field(
        default=None,
        description="Upload method identifier (e.g., web, local, pixverse_sync, generated)",
    )
    upload_context: Optional[dict] = Field(
        default=None,
        description="Optional upload context (validated against schema)",
    )
    skip_dedup: bool = Field(
        default=False,
        description="Skip phash deduplication check (for small region changes)",
    )


@router.post("/upload-from-url", response_model=UploadAssetResponse)
async def upload_asset_from_url(
    request: UploadFromUrlRequest,
    user: CurrentUser,
    db: DatabaseSession,
    account_service: AccountSvc,
    asset_service: AssetSvc,
):
    """
    Backend-side fetch of a remote URL and upload to the chosen provider.

    - Fetches bytes via HTTP(S)
    - Infers media type from Content-Type or URL suffix
    - Preps temp file and delegates to UploadService
    """
    import httpx
    import mimetypes
    import tempfile
    import base64

    url = request.url

    # Handle data URLs (from extension uploading local files)
    if url.startswith("data:"):
        try:
            # Parse data URL: data:[<mediatype>][;base64],<data>
            header, encoded = url.split(",", 1)
            content_type = header.split(":")[1].split(";")[0] if ":" in header else ""
            if ";base64" in header:
                content = base64.b64decode(encoded)
            else:
                content = encoded.encode("utf-8")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid data URL: {e}")
    elif url.startswith("http://") or url.startswith("https://"):
        # Fetch remote content
        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True, headers={
                "User-Agent": "PixSim7/1.0 (+https://github.com/Sakenfor/pixsim7)"
            }) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                content = resp.content
                content_type = resp.headers.get("content-type", "")
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Failed to fetch URL: {e}")
    else:
        raise HTTPException(status_code=400, detail="URL must be http(s) or data:")

    # Infer media type
    media_type: MediaType | None = None
    if content_type.startswith("image/"):
        media_type = MediaType.IMAGE
    elif content_type.startswith("video/"):
        media_type = MediaType.VIDEO
    else:
        # Fallback by extension
        guess, _ = mimetypes.guess_type(url)
        if guess and guess.startswith("image/"):
            media_type = MediaType.IMAGE
        elif guess and guess.startswith("video/"):
            media_type = MediaType.VIDEO

    if media_type is None:
        raise HTTPException(status_code=400, detail=f"Unsupported content type: {content_type or 'unknown'}")

    # Save to temp
    try:
        suffix = mimetypes.guess_extension(content_type) or mimetypes.guess_extension(mimetypes.guess_type(url)[0] or "") or ".bin"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save temp file: {e}")

    # Validate video duration if it's a video (5-30 seconds)
    if media_type == MediaType.VIDEO:
        try:
            import subprocess
            result = subprocess.run(
                ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', tmp_path],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                duration = float(result.stdout.strip())
                if duration < 5 or duration > 30:
                    os.unlink(tmp_path)
                    raise HTTPException(
                        status_code=400,
                        detail=f"Video duration must be between 5-30 seconds (got {duration:.1f}s)"
                    )
        except subprocess.TimeoutExpired:
            os.unlink(tmp_path)
            raise HTTPException(status_code=500, detail="Video validation timeout")
        except FileNotFoundError:
            # ffprobe not available, skip validation
            logger.warning(
                "video_duration_validation_skipped",
                reason="ffprobe_not_found",
                detail="ffprobe tool not available, skipping video duration validation"
            )
        except ValueError as e:
            # Invalid duration output, skip validation
            logger.warning(
                "video_duration_validation_skipped",
                reason="invalid_duration_output",
                error=str(e),
                detail="Could not parse video duration from ffprobe output"
            )

    # NEW WORKFLOW: Save locally FIRST, then optionally upload to provider
    # This ensures the asset is always accessible even if provider upload fails

    import shutil

    # Step 1: Save to temporary file for processing
    ext = mimetypes.guess_extension(content_type) or (".mp4" if media_type == MediaType.VIDEO else ".jpg")
    temp_local_path = tempfile.mktemp(suffix=ext)

    # Step 2: Save to temp location and compute metadata
    try:
        shutil.copy2(tmp_path, temp_local_path)
        file_size_bytes = os.path.getsize(temp_local_path)

        prep = await prepare_upload(
            tmp_path=temp_local_path,
            user_id=user.id,
            media_type=media_type,
            asset_service=asset_service,
            provider_id=request.provider_id,
            file_ext=ext,
            skip_phash_dedup=request.skip_dedup,
        )

        sha256 = prep.sha256
        width = prep.width
        height = prep.height
        image_hash = prep.image_hash
        phash64 = prep.phash64
        stored_key = prep.stored_key
        final_local_path = prep.local_path

        if not sha256:
            raise ValueError("Failed to compute sha256 for upload")

        if prep.existing_asset:
            # Clean up temp files since we're reusing an existing asset
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
            try:
                if os.path.exists(temp_local_path):
                    os.unlink(temp_local_path)
            except Exception:
                pass

            existing = prep.existing_asset
            existing_external = existing.remote_url
            if not existing_external or not (
                existing_external.startswith("http://") or existing_external.startswith("https://")
            ):
                existing_external = f"/api/v1/assets/{existing.id}/file"

            provider_specific_id = existing.provider_uploads.get(request.provider_id) if existing.provider_uploads else None
            if not provider_specific_id:
                provider_specific_id = existing.provider_asset_id

            note = "Reused existing asset (deduplicated by sha256)"
            if prep.dedup_note and "phash" in prep.dedup_note:
                note = "Reused existing asset (phash match)"

            return UploadAssetResponse(
                provider_id=request.provider_id,
                media_type=existing.media_type,
                external_url=existing_external,
                provider_asset_id=provider_specific_id,
                asset_id=existing.id,
                note=note,
            )

        if not stored_key or not final_local_path:
            raise ValueError("Failed to store file")

        # Extract video duration if it's a video
        duration_sec = None
        if media_type == MediaType.VIDEO:
            from pixsim7.backend.main.shared.video_utils import extract_duration_safe
            duration_sec = extract_duration_safe(temp_local_path)
            if duration_sec:
                logger.debug(f"Extracted video duration: {duration_sec:.2f}s")
            else:
                logger.debug("Could not extract video duration (ffprobe not available or extraction failed)")

    except Exception as e:
        # Clean up temp files
        try:
            os.unlink(tmp_path)
            if os.path.exists(temp_local_path):
                os.unlink(temp_local_path)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Failed to save to local storage: {e}")

    # Step 3: Try to upload to provider FIRST (before creating asset)
    # This prevents emitting asset:created event for assets that fail provider upload
    from pixsim7.backend.main.services.upload.upload_service import UploadService
    upload_service = UploadService(db, account_service)

    provider_upload_result = None
    provider_upload_error = None

    try:
        provider_upload_result = await upload_service.upload(
            provider_id=request.provider_id,
            media_type=media_type,
            tmp_path=final_local_path  # Upload from saved file
        )
        logger.info(
            "provider_upload_success",
            provider_id=request.provider_id,
            external_url=provider_upload_result.external_url,
            provider_asset_id=provider_upload_result.provider_asset_id,
        )
    except Exception as e:
        provider_upload_error = str(e)
        logger.warning(
            "provider_upload_failed",
            provider_id=request.provider_id,
            error=provider_upload_error,
            ensure_asset=request.ensure_asset,
            exc_info=True,
        )

        # If caller does NOT want a local-only asset, fail immediately without creating asset
        if not request.ensure_asset:
            # Clean up temp files
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
            raise HTTPException(
                status_code=502,
                detail=f"Provider upload failed: {provider_upload_error}",
            )

    # Step 4: Create asset in database (only after provider upload attempt)
    # Determine upload method (canonical source)
    upload_method = infer_upload_method(
        upload_method=request.upload_method,
        source_url=request.source_url,
        source_site=request.source_site,
    )

    context_input = dict(request.upload_context or {})
    if request.source_url and "source_url" not in context_input:
        context_input["source_url"] = request.source_url
    if request.source_site and "source_site" not in context_input:
        context_input["source_site"] = request.source_site
    normalized_context = normalize_upload_context(upload_method, context_input)

    # Build upload attribution metadata (rich context only)
    upload_attribution = build_upload_attribution_context(
        upload_context=normalized_context,
    )

    media_metadata = {}
    if upload_attribution:
        media_metadata["upload_attribution"] = upload_attribution

    # Determine provider_asset_id and remote_url based on upload result
    if provider_upload_result:
        provider_asset_id = provider_upload_result.provider_asset_id or f"local_{sha256[:16]}"
        remote_url = None
        if provider_upload_result.external_url:
            if provider_upload_result.external_url.startswith("http://") or provider_upload_result.external_url.startswith("https://"):
                remote_url = provider_upload_result.external_url
        provider_upload_note = provider_upload_result.note or "Uploaded to provider successfully"
    else:
        # Provider upload failed but ensure_asset=true, create local-only asset
        provider_asset_id = f"local_{sha256[:16]}"
        remote_url = None
        provider_upload_note = f"Asset saved locally; provider upload failed: {provider_upload_error}"

    try:
        asset = await add_asset(
            db,
            user_id=user.id,
            media_type=media_type,
            provider_id=request.provider_id,
            provider_asset_id=provider_asset_id,
            remote_url=remote_url,
            local_path=final_local_path,  # Content-addressed path
            stored_key=stored_key,  # Stable storage key
            sync_status=SyncStatus.DOWNLOADED,  # Already have it locally!
            width=width,
            height=height,
            duration_sec=duration_sec,  # Extracted from video via ffprobe
            mime_type=content_type,
            file_size_bytes=file_size_bytes,
            sha256=sha256,
            image_hash=image_hash,
            phash64=phash64,
            media_metadata=media_metadata or None,
            upload_method=upload_method,
            upload_context=normalized_context or None,
        )

        logger.info(
            "asset_created",
            asset_id=asset.id,
            provider_id=request.provider_id,
            provider_upload_succeeded=provider_upload_result is not None,
        )

    except Exception as e:
        # Clean up temp files on failure
        try:
            os.unlink(tmp_path)
            if os.path.exists(temp_local_path):
                os.unlink(temp_local_path)
        except Exception:
            pass
        logger.error(
            "asset_create_failed",
            provider_id=request.provider_id,
            media_type=str(media_type),
            error=str(e),
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail=f"Failed to create asset: {e}")
    finally:
        # Clean up temp file (stored_key file is already in permanent location)
        try:
            if os.path.exists(temp_local_path):
                os.unlink(temp_local_path)
        except Exception:
            pass

    # Clean up original temp file
    try:
        os.unlink(tmp_path)
    except Exception as e:
        logger.warning(
            "temp_file_cleanup_failed",
            file_path=tmp_path,
            error=str(e),
            detail="Failed to clean up temporary file, may need manual cleanup"
        )

    # Return response
    return UploadAssetResponse(
        provider_id=request.provider_id,
        media_type=media_type,
        external_url=asset.remote_url or f"/api/v1/assets/{asset.id}/file",
        provider_asset_id=asset.provider_asset_id,
        asset_id=asset.id,
        note=provider_upload_note,
    )


# ===== FRAME EXTRACTION =====

class ExtractFrameRequest(BaseModel):
    """Request to extract frame from video"""
    video_asset_id: int = Field(description="Source video asset ID")
    timestamp: float = Field(0, description="Time in seconds to extract frame", ge=0)
    frame_number: Optional[int] = Field(None, description="Optional frame number for metadata")
    last_frame: bool = Field(False, description="If true, extract the very last frame (ignores timestamp)")
    provider_id: Optional[str] = Field(None, description="If provided, upload extracted frame to this provider")


@router.post("/extract-frame", response_model=AssetResponse)
async def extract_frame(
    request: ExtractFrameRequest,
    user: CurrentUser,
    asset_service: AssetSvc
):
    """
    Extract frame from video at specific timestamp

    Creates a new image asset with automatic deduplication:
    - If frame was previously extracted (same SHA256), returns existing asset
    - Otherwise creates new asset and links to parent video via lineage

    The extracted frame will have:
    - media_type: IMAGE
    - lineage link to parent video with PAUSED_FRAME relation
    - SHA256 hash for deduplication
    - Local storage (already downloaded)

    If provider_id is specified, the extracted frame will be uploaded to that
    provider and the provider_uploads field will be populated.

    Example request:
    ```json
    {
      "video_asset_id": 123,
      "timestamp": 10.5,
      "frame_number": 315,
      "provider_id": "pixverse"
    }
    ```

    Returns:
    - Image asset (either existing or newly created)
    - Asset includes lineage link to parent video via AssetLineage
    - Based on settings and source video, may upload to provider
    """
    from pixsim7.backend.main.services.asset import get_media_settings

    try:
        # Get video asset first to determine source provider
        video_asset = await asset_service.get_asset_for_user(request.video_asset_id, user)

        frame_asset = await asset_service.create_asset_from_paused_frame(
            video_asset_id=request.video_asset_id,
            user=user,
            timestamp=request.timestamp,
            frame_number=request.frame_number,
            last_frame=request.last_frame,
        )

        # Determine upload target based on settings
        settings = get_media_settings()
        upload_behavior = settings.frame_extraction_upload
        target_provider_id = None

        if request.provider_id:
            # Explicit provider_id in request always takes precedence
            target_provider_id = request.provider_id
        elif upload_behavior == 'always':
            # Always upload to default provider
            target_provider_id = settings.default_upload_provider
        elif upload_behavior == 'source_provider' and video_asset.provider_id:
            # Upload to source video's provider
            target_provider_id = video_asset.provider_id
        # 'never' or no provider -> don't upload

        logger.info(
            "extract_frame_upload_decision",
            asset_id=frame_asset.id,
            upload_behavior=upload_behavior,
            source_provider=video_asset.provider_id,
            target_provider=target_provider_id,
        )

        # Upload to provider if determined
        if target_provider_id:
            try:
                provider_asset_id = await asset_service.get_asset_for_provider(
                    asset_id=frame_asset.id,
                    target_provider_id=target_provider_id
                )
                # Refresh asset to get updated provider_uploads
                frame_asset = await asset_service.get_asset(frame_asset.id)

                # Update remote_url to the provider URL (like badge uploads do)
                provider_url = frame_asset.provider_uploads.get(target_provider_id)
                if provider_url and provider_url.startswith('http'):
                    frame_asset.remote_url = provider_url
                    await asset_service.db.commit()
                    # Refresh again to get the updated remote_url
                    frame_asset = await asset_service.get_asset(frame_asset.id)

                logger.info(
                    "extract_frame_uploaded_to_provider",
                    asset_id=frame_asset.id,
                    provider_id=target_provider_id,
                    provider_asset_id=provider_asset_id,
                    remote_url=frame_asset.remote_url,
                )
            except Exception as upload_error:
                # Log but don't fail - asset was created successfully
                logger.warning(
                    "extract_frame_provider_upload_failed",
                    asset_id=frame_asset.id,
                    provider_id=target_provider_id,
                    error=str(upload_error),
                )

        return AssetResponse.model_validate(frame_asset)

    except ResourceNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Video asset {request.video_asset_id} not found"
        )
    except InvalidOperationError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to extract frame: {str(e)}"
        )


# ===== ASSET REUPLOAD (UPLOAD EXISTING ASSET TO PROVIDER) =====

class ReuploadAssetRequest(BaseModel):
    """Request to upload an existing asset to a provider"""
    provider_id: str = Field(..., description="Target provider ID (e.g., 'pixverse')")


class ReuploadAssetResponse(BaseModel):
    """Response from asset reupload"""
    asset_id: int
    provider_id: str
    provider_asset_id: str
    message: str = "Asset uploaded to provider"


@router.post("/{asset_id}/reupload", response_model=ReuploadAssetResponse)
async def reupload_asset_to_provider(
    asset_id: int,
    request: ReuploadAssetRequest,
    user: CurrentUser,
    asset_service: AssetSvc,
):
    """
    Upload an existing asset to a specific provider.

    This is useful for:
    - Uploading extracted frames to a provider
    - Cross-provider operations (asset exists on one provider, need it on another)
    - Re-uploading assets that failed previous upload attempts

    The asset must already exist in the system (have a local file or remote URL).
    """
    # Verify asset belongs to user
    asset = await asset_service.get_asset_for_user(asset_id, user)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    try:
        # Use the cross-provider upload functionality
        provider_asset_id = await asset_service.get_asset_for_provider(
            asset_id=asset_id,
            target_provider_id=request.provider_id
        )

        return ReuploadAssetResponse(
            asset_id=asset_id,
            provider_id=request.provider_id,
            provider_asset_id=provider_asset_id,
        )
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(
            "reupload_asset_failed",
            asset_id=asset_id,
            provider_id=request.provider_id,
            error=str(e),
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload asset to provider: {str(e)}"
        )


# ===== ASSET ENRICHMENT (SYNC METADATA FROM PROVIDER) =====

class EnrichAssetResponse(BaseModel):
    """Response from asset enrichment"""
    asset_id: int
    enriched: bool
    generation_id: Optional[int] = None
    message: str


@router.post("/{asset_id}/test-enrich")
async def test_enrich(asset_id: int):
    """Minimal test endpoint - no auth, no dependencies"""
    return {"test": "success", "asset_id": asset_id}


@router.post("/{asset_id}/enrich", response_model=EnrichAssetResponse)
async def enrich_asset(
    asset_id: int,
    user: CurrentUser,
    db: DatabaseSession,
    asset_service: AssetSvc,
    force: bool = Query(default=False, description="Force re-enrichment even if generation exists"),
):
    """
    Enrich an asset by fetching metadata from the provider and running synthetic generation.

    This will:
    1. Fetch full metadata from the provider API (e.g., prompt, settings, source images)
    2. Extract embedded assets and create lineage links
    3. Create a synthetic Generation record with prompt/params

    Useful for assets synced without full metadata (e.g., from extension badge click).

    Set force=true to re-enrich assets that already have generations (for debugging/re-sync).
    """
    from pixsim7.backend.main.domain import Asset, Generation
    from pixsim7.backend.main.domain.providers import ProviderAccount
    from pixsim7.backend.main.domain.assets.lineage import AssetLineage
    from pixsim7.backend.main.services.asset.enrichment import AssetEnrichmentService
    from pixsim7.backend.main.services.provider.adapters.pixverse import PixverseProvider
    from sqlalchemy import select, delete

    # Get the asset
    asset = await asset_service.get_asset_for_user(asset_id, user)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    logger.info(
        "enrich_asset_start",
        asset_id=asset.id,
        provider_id=asset.provider_id,
        provider_asset_id=asset.provider_asset_id,
        media_type=asset.media_type.value if asset.media_type else None,
        provider_account_id=asset.provider_account_id,
        force=force,
    )

    # Only supported for pixverse currently
    if asset.provider_id != "pixverse":
        raise HTTPException(
            status_code=400,
            detail=f"Enrichment not supported for provider: {asset.provider_id}"
        )

    # Need provider_account_id to fetch metadata
    if not asset.provider_account_id:
        raise HTTPException(
            status_code=400,
            detail="Asset has no linked provider account. Cannot fetch metadata."
        )

    # Get the account
    account_stmt = select(ProviderAccount).where(
        ProviderAccount.id == asset.provider_account_id,
        ProviderAccount.user_id == user.id,
    )
    result = await db.execute(account_stmt)
    account = result.scalar_one_or_none()

    if not account:
        raise HTTPException(
            status_code=400,
            detail="Provider account not found or not accessible"
        )

    # Fetch metadata from provider
    try:
        provider = PixverseProvider()
        provider_metadata = None
        parent_video_id = None
        is_synthetic_source = False

        # Workaround: Detect synthetic _src_X IDs (e.g., "12345_src_0", "12345_src_video")
        # These are source assets extracted from video metadata that can't be looked up directly.
        # Instead, we fetch the parent video's metadata.
        # Pattern handles:
        #   - Numeric IDs: 12345_src_0, 12345_src_video
        #   - UUIDs: abc123de-f456-7890-abcd-ef1234567890_src_0
        import re
        synthetic_match = re.match(
            r'^(\d+|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})_src_(?:video|\d+)$',
            asset.provider_asset_id or '',
            re.IGNORECASE
        )
        if synthetic_match:
            parent_video_id = synthetic_match.group(1)
            is_synthetic_source = True
            logger.info(
                "enrich_asset_synthetic_id_detected",
                asset_id=asset.id,
                provider_asset_id=asset.provider_asset_id,
                parent_video_id=parent_video_id,
            )

        if is_synthetic_source and parent_video_id:
            # Fetch parent video metadata - it contains source image/video info
            client = provider._create_client(account)
            provider_metadata = await client.get_video(parent_video_id)
            if provider_metadata:
                # Convert Pydantic model to dict if needed
                if hasattr(provider_metadata, 'model_dump'):
                    provider_metadata = provider_metadata.model_dump()
                elif hasattr(provider_metadata, 'dict'):
                    provider_metadata = provider_metadata.dict()
                logger.info(
                    "enrich_asset_parent_video_fetched",
                    asset_id=asset.id,
                    parent_video_id=parent_video_id,
                    has_prompt=bool(provider_metadata.get("prompt") or provider_metadata.get("customer_paths", {}).get("prompt") if isinstance(provider_metadata, dict) else False),
                )
        elif asset.media_type.value == "VIDEO":
            client = provider._create_client(account)
            provider_metadata = await client.get_video(asset.provider_asset_id)
        else:
            provider_metadata = await provider.fetch_image_metadata(
                account=account,
                provider_asset_id=asset.provider_asset_id,
                asset_id=asset.id,
                remote_url=asset.remote_url,
                media_metadata=asset.media_metadata,
                max_pages=20,
                limit=100,
                log_prefix="enrich_asset",
            )
    except Exception as e:
        logger.warning(
            "enrich_asset_fetch_failed",
            asset_id=asset.id,
            error=str(e),
        )
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch metadata from provider: {str(e)}"
        )

    if not provider_metadata:
        return EnrichAssetResponse(
            asset_id=asset.id,
            enriched=False,
            message="No metadata returned from provider"
        )

    if asset.media_metadata and isinstance(provider_metadata, dict):
        merged_metadata = dict(asset.media_metadata)
        merged_metadata.update(provider_metadata)
        provider_metadata = merged_metadata

    # Update asset's media_metadata
    asset.media_metadata = provider_metadata
    await db.commit()

    # Debug logging to see what metadata we got
    customer_img_urls = (
        provider_metadata.get("customer_img_urls")
        or provider_metadata.get("customer_paths", {}).get("customer_img_urls")
    )
    if not isinstance(customer_img_urls, list):
        customer_img_urls = [customer_img_urls] if customer_img_urls else []

    logger.info(
        "enrich_asset_metadata_fetched",
        asset_id=asset.id,
        has_customer_paths=bool(provider_metadata.get("customer_paths")),
        has_prompt=bool(provider_metadata.get("prompt") or provider_metadata.get("customer_paths", {}).get("prompt")),
        has_customer_img_url=bool(
            provider_metadata.get("customer_img_url")
            or provider_metadata.get("customer_paths", {}).get("customer_img_url")
            or customer_img_urls
        ),
        customer_img_url_count=len(customer_img_urls),
        create_mode=provider_metadata.get("customer_paths", {}).get("create_mode") or provider_metadata.get("create_mode"),
        metadata_keys=list(provider_metadata.keys()) if provider_metadata else [],
    )

    # Run enrichment pipeline
    enrichment_service = AssetEnrichmentService(db)

    # If already has generation and force=true, re-enrich (update existing)
    # Otherwise, create new generation
    if asset.source_generation_id and force:
        logger.info(
            "enrich_asset_re_populate",
            asset_id=asset.id,
            generation_id=asset.source_generation_id,
        )
        generation = await enrichment_service.re_enrich_synced_asset(asset, user, provider_metadata)
    elif asset.source_generation_id:
        # Already has generation, skip
        return EnrichAssetResponse(
            asset_id=asset.id,
            enriched=False,
            generation_id=asset.source_generation_id,
            message="Asset already has generation record (use force=true to re-enrich)"
        )
    else:
        # No generation yet, create one
        generation = await enrichment_service.enrich_synced_asset(asset, user, provider_metadata)

    logger.info(
        "enrich_asset_generation_result",
        asset_id=asset.id,
        generation_id=generation.id if generation else None,
        has_generation=bool(generation),
        source_generation_id=asset.source_generation_id,
        force=force,
    )

    return EnrichAssetResponse(
        asset_id=asset.id,
        enriched=True,
        generation_id=generation.id if generation else None,
        message="Asset enriched successfully" if generation else "Enriched but no generation created"
    )
