"""
Asset search & discovery API endpoints

Search, groups, filter options, upload context schema, and autocomplete.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Any
from enum import Enum

from pixsim7.backend.main.api.dependencies import CurrentUser, AssetSvc, DatabaseSession
from pixsim7.backend.main.shared.schemas.asset_schemas import (
    AssetGroupBy,
    AssetGroupGenerationMeta,
    AssetGroupListResponse,
    AssetGroupMeta,
    AssetGroupPromptMeta,
    AssetGroupRequest,
    AssetGroupSiblingMeta,
    AssetGroupSourceMeta,
    AssetGroupSummary,
    AssetSearchRequest,
    AssetResponse,
    AssetListResponse,
)
from pixsim7.backend.main.services.asset.filter_registry import asset_filter_registry
from pixsim7.backend.main.shared.upload_context_schema import UPLOAD_CONTEXT_SPEC
from pixsim7.backend.main.api.v1.assets_helpers import build_asset_response_with_tags
from pixsim_logging import get_logger

router = APIRouter(tags=["assets-search"])
logger = get_logger()


# ===== SIMILARITY CURSOR HELPERS =====

SIMILARITY_CURSOR_PREFIX = "simoff:"


def _parse_similarity_cursor(cursor: str | None) -> int | None:
    if not cursor:
        return None
    if not cursor.startswith(SIMILARITY_CURSOR_PREFIX):
        return None
    try:
        offset = int(cursor[len(SIMILARITY_CURSOR_PREFIX):])
    except ValueError:
        return None
    if offset < 0:
        return None
    return offset


def _build_similarity_cursor(offset: int) -> str:
    return f"{SIMILARITY_CURSOR_PREFIX}{offset}"


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
        is_similarity_mode = request.similar_to is not None
        similarity_offset = request.offset
        if is_similarity_mode and request.cursor:
            parsed_similarity_offset = _parse_similarity_cursor(request.cursor)
            if parsed_similarity_offset is not None:
                similarity_offset = parsed_similarity_offset

        effective_offset = (
            similarity_offset
            if is_similarity_mode
            else (request.offset if request.cursor is None else 0)
        )

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
            offset=effective_offset,
            cursor=None if is_similarity_mode else request.cursor,
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
            sha256=request.sha256,
            operation_type=request.operation_type,
            has_parent=request.has_parent,
            has_children=request.has_children,
            prompt_version_id=request.prompt_version_id,
            group_by=request.group_by.value if isinstance(request.group_by, Enum) else request.group_by,
            group_key=request.group_key,
            sort_by=request.sort_by,
            sort_dir=request.sort_dir,
            similar_to=request.similar_to,
            similarity_threshold=request.similarity_threshold,
        )

        # Simple total (future: separate COUNT query)
        total = len(assets)

        # Generate cursor for next page
        next_cursor = None
        if len(assets) == request.limit:
            if is_similarity_mode:
                next_cursor = _build_similarity_cursor(effective_offset + request.limit)
            else:
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
            offset=effective_offset,
            next_cursor=next_cursor,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list assets: {str(e)}")


# ===== ASSET GROUPS =====


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

        group_keys = [
            group.key
            for group in groups
            if group.key and group.key not in {"ungrouped", "other"}
        ]

        meta_payloads = await asset_service.build_group_meta_payloads(
            user=user,
            group_by=group_by,
            group_keys=group_keys,
            filters=request.filters,
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
            group_path=request.group_path,
        )

        meta_map: dict[str, AssetGroupMeta] = {}
        for key, payload in meta_payloads.items():
            kind = payload.get("kind")
            if kind == "source":
                meta_map[key] = AssetGroupSourceMeta.model_validate(payload)
            elif kind == "generation":
                meta_map[key] = AssetGroupGenerationMeta.model_validate(payload)
            elif kind == "prompt":
                meta_map[key] = AssetGroupPromptMeta.model_validate(payload)
            elif kind == "sibling":
                meta_map[key] = AssetGroupSiblingMeta.model_validate(payload)

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
    from sqlalchemy import select, union_all, distinct
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
