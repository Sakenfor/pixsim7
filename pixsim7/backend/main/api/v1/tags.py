"""
Tag management API endpoints

Handles:
- Tag CRUD operations
- Tag listing and search
- Tag hierarchy
- Tag aliasing
- Asset tag assignment
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional, List
from uuid import UUID

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession, AssetSvc
from pixsim7.backend.main.services.tag_service import TagService
from pixsim7.backend.main.domain.prompt.models import PromptVersion
from pixsim7.backend.main.shared.schemas.tag_schemas import (
    TagSummary,
    TagDetail,
    TagListResponse,
    CreateTagRequest,
    UpdateTagRequest,
    CreateAliasRequest,
    TagFilterRequest,
    TagAssertionTargetType,
    TagAssertionMutationMode,
    TagAssertionMutationRequest,
    TagAssertionRecord,
    TagAssertionListResponse,
)
from pixsim7.backend.main.shared.errors import ResourceNotFoundError, InvalidOperationError

router = APIRouter()


def get_tag_service(db: DatabaseSession) -> TagService:
    """Dependency to get TagService instance."""
    return TagService(db)


# ===== TAG CRUD =====

@router.get("/tags", response_model=TagListResponse)
async def list_tags(
    namespace: Optional[str] = Query(None, description="Filter by namespace"),
    q: Optional[str] = Query(None, description="Search query (name or slug)"),
    limit: int = Query(50, ge=1, le=100, description="Results per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    tag_service: TagService = Depends(get_tag_service),
):
    """
    List tags with optional filters.

    Examples:
    - GET /tags → all tags
    - GET /tags?namespace=character → all character tags
    - GET /tags?q=alice → tags matching 'alice'
    """
    try:
        tags = await tag_service.list_tags(
            namespace=namespace,
            q=q,
            limit=limit,
            offset=offset,
        )

        # Convert to TagSummary
        tag_summaries = [TagSummary.model_validate(tag) for tag in tags]

        return TagListResponse(
            tags=tag_summaries,
            total=len(tag_summaries),
            limit=limit,
            offset=offset,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list tags: {str(e)}")


async def _resolve_assertion_target_id(
    *,
    target_type: TagAssertionTargetType,
    target_id: str,
    user: CurrentUser,
    db: DatabaseSession,
    asset_service: AssetSvc,
) -> int | UUID:
    if target_type == TagAssertionTargetType.ASSET:
        try:
            asset_id = int(target_id)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="asset target_id must be an integer")
        await asset_service.get_asset_for_user(asset_id, user)
        return asset_id

    if target_type == TagAssertionTargetType.PROMPT_VERSION:
        try:
            prompt_version_id = UUID(str(target_id))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="prompt_version target_id must be a UUID")
        prompt_version = await db.get(PromptVersion, prompt_version_id)
        if not prompt_version:
            raise HTTPException(status_code=404, detail="Prompt version not found")
        return prompt_version_id

    raise HTTPException(status_code=400, detail=f"Unsupported target_type '{target_type}'")


def _build_assertion_response(
    *,
    target_type: TagAssertionTargetType,
    target_id: int | UUID,
    assertions: list[dict],
) -> TagAssertionListResponse:
    records = [
        TagAssertionRecord(
            tag=TagSummary.model_validate(item["tag"]),
            source=item.get("source") or "unknown",
            confidence=item.get("confidence"),
            created_at=item.get("created_at"),
        )
        for item in assertions
    ]
    return TagAssertionListResponse(
        target_type=target_type,
        target_id=str(target_id),
        assertions=records,
        total=len(records),
    )


@router.get(
    "/tags/assertions/{target_type}/{target_id}",
    response_model=TagAssertionListResponse,
)
async def list_tag_assertions(
    target_type: TagAssertionTargetType,
    target_id: str,
    user: CurrentUser,
    db: DatabaseSession,
    asset_service: AssetSvc,
    tag_service: TagService = Depends(get_tag_service),
):
    """List tag assertions (with provenance) for an asset or prompt version."""
    try:
        resolved_id = await _resolve_assertion_target_id(
            target_type=target_type,
            target_id=target_id,
            user=user,
            db=db,
            asset_service=asset_service,
        )
        if target_type == TagAssertionTargetType.ASSET:
            assertions = await tag_service.list_asset_tag_assertions(int(resolved_id))
        else:
            assertions = await tag_service.list_prompt_version_tag_assertions(resolved_id)
        return _build_assertion_response(
            target_type=target_type,
            target_id=resolved_id,
            assertions=assertions,
        )
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list tag assertions: {str(e)}")


@router.post(
    "/tags/assertions/{target_type}/{target_id}",
    response_model=TagAssertionListResponse,
)
async def mutate_tag_assertions(
    target_type: TagAssertionTargetType,
    target_id: str,
    request: TagAssertionMutationRequest,
    user: CurrentUser,
    db: DatabaseSession,
    asset_service: AssetSvc,
    tag_service: TagService = Depends(get_tag_service),
):
    """
    Mutate tag assertions for an asset or prompt version.

    Modes:
    - add: append assertions for provided slugs
    - remove: remove assertions for provided slugs
    - replace: replace all assertions on target with provided slugs
    - sync_source: replace only assertions from the specified source
    """
    try:
        resolved_id = await _resolve_assertion_target_id(
            target_type=target_type,
            target_id=target_id,
            user=user,
            db=db,
            asset_service=asset_service,
        )

        source = request.source or "manual"
        mode = request.mode

        if target_type == TagAssertionTargetType.ASSET:
            asset_id = int(resolved_id)
            if mode == TagAssertionMutationMode.ADD:
                await tag_service.assign_tags_to_asset(
                    asset_id=asset_id,
                    tag_slugs=request.tag_slugs,
                    auto_create=request.auto_create,
                    source=source,
                )
            elif mode == TagAssertionMutationMode.REMOVE:
                await tag_service.remove_tags_from_asset(
                    asset_id=asset_id,
                    tag_slugs=request.tag_slugs,
                )
            elif mode == TagAssertionMutationMode.REPLACE:
                await tag_service.replace_asset_tags(
                    asset_id=asset_id,
                    tag_slugs=request.tag_slugs,
                    auto_create=request.auto_create,
                    source=source,
                )
            elif mode == TagAssertionMutationMode.SYNC_SOURCE:
                await tag_service.sync_asset_tags_by_source(
                    asset_id=asset_id,
                    tag_slugs=request.tag_slugs,
                    source=source,
                    auto_create=request.auto_create,
                )
            assertions = await tag_service.list_asset_tag_assertions(asset_id)
            return _build_assertion_response(
                target_type=target_type,
                target_id=asset_id,
                assertions=assertions,
            )

        prompt_version_id = resolved_id
        if mode == TagAssertionMutationMode.ADD:
            await tag_service.assign_tags_to_prompt_version(
                prompt_version_id=prompt_version_id,
                tag_slugs=request.tag_slugs,
                auto_create=request.auto_create,
                source=source,
                confidence=request.confidence,
            )
        elif mode == TagAssertionMutationMode.REMOVE:
            await tag_service.remove_tags_from_prompt_version(
                prompt_version_id=prompt_version_id,
                tag_slugs=request.tag_slugs,
            )
        elif mode == TagAssertionMutationMode.REPLACE:
            await tag_service.replace_prompt_version_tags(
                prompt_version_id=prompt_version_id,
                tag_slugs=request.tag_slugs,
                auto_create=request.auto_create,
                source=source,
                confidence=request.confidence,
            )
        elif mode == TagAssertionMutationMode.SYNC_SOURCE:
            await tag_service.sync_prompt_version_tags_by_source(
                prompt_version_id=prompt_version_id,
                tag_slugs=request.tag_slugs,
                source=source,
                auto_create=request.auto_create,
                confidence=request.confidence,
            )

        assertions = await tag_service.list_prompt_version_tag_assertions(prompt_version_id)
        return _build_assertion_response(
            target_type=target_type,
            target_id=prompt_version_id,
            assertions=assertions,
        )

    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to mutate tag assertions: {str(e)}")


@router.get("/tags/{tag_id}", response_model=TagDetail)
async def get_tag(
    tag_id: int,
    tag_service: TagService = Depends(get_tag_service),
):
    """
    Get detailed information about a specific tag.

    Includes:
    - Tag identity (slug, namespace, name)
    - Hierarchy (parent_tag)
    - Aliasing (canonical_tag)
    - Metadata
    - Usage count
    """
    try:
        tag = await tag_service.get_tag_by_id(tag_id)

        # Get usage count
        usage_count = await tag_service.get_tag_usage_count(tag_id)

        # Build response
        response = TagDetail.model_validate(tag)
        response.usage_count = usage_count

        # Load parent tag if exists
        if tag.parent_tag_id:
            parent = await tag_service.get_tag_by_id(tag.parent_tag_id)
            response.parent_tag = TagSummary.model_validate(parent)

        # Load canonical tag if exists
        if tag.canonical_tag_id:
            canonical = await tag_service.get_tag_by_id(tag.canonical_tag_id)
            response.canonical_tag = TagSummary.model_validate(canonical)

        return response

    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Tag not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get tag: {str(e)}")


@router.post("/tags", response_model=TagDetail, status_code=201)
async def create_tag(
    request: CreateTagRequest,
    tag_service: TagService = Depends(get_tag_service),
):
    """
    Create a new tag.

    Example request:
    ```json
    {
      "namespace": "character",
      "name": "alice",
      "display_name": "Character: Alice",
      "parent_tag_id": null,
      "meta": {"source": "game"}
    }
    ```
    """
    try:
        tag = await tag_service.create_tag(
            namespace=request.namespace,
            name=request.name,
            display_name=request.display_name,
            parent_tag_id=request.parent_tag_id,
            meta=request.meta,
        )

        return TagDetail.model_validate(tag)

    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create tag: {str(e)}")


@router.patch("/tags/{tag_id}", response_model=TagDetail)
async def update_tag(
    tag_id: int,
    request: UpdateTagRequest,
    tag_service: TagService = Depends(get_tag_service),
):
    """
    Update tag fields.

    Example request:
    ```json
    {
      "display_name": "Updated Display Name",
      "parent_tag_id": 123
    }
    ```
    """
    try:
        tag = await tag_service.update_tag(
            tag_id=tag_id,
            display_name=request.display_name,
            parent_tag_id=request.parent_tag_id,
            meta=request.meta,
        )

        return TagDetail.model_validate(tag)

    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Tag not found")
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update tag: {str(e)}")


@router.post("/tags/{tag_id}/alias", response_model=TagDetail, status_code=201)
async def create_alias(
    tag_id: int,
    request: CreateAliasRequest,
    tag_service: TagService = Depends(get_tag_service),
):
    """
    Create an alias tag pointing to this canonical tag.

    Example request:
    ```json
    {
      "alias_slug": "char:alice",
      "display_name": "Char: Alice"
    }
    ```

    This creates a new tag 'char:alice' that resolves to 'character:alice'.
    """
    try:
        alias_tag = await tag_service.create_alias(
            canonical_tag_id=tag_id,
            alias_slug=request.alias_slug,
            display_name=request.display_name,
        )

        return TagDetail.model_validate(alias_tag)

    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Canonical tag not found")
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create alias: {str(e)}")
