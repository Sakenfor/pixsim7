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
from sqlmodel import Session

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession
from pixsim7.backend.main.services.tag_service import TagService
from pixsim7.backend.main.shared.schemas.tag_schemas import (
    TagSummary,
    TagDetail,
    TagListResponse,
    CreateTagRequest,
    UpdateTagRequest,
    CreateAliasRequest,
    TagFilterRequest,
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
