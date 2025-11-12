"""
Asset management API endpoints
"""
from fastapi import APIRouter, HTTPException, Query
from fastapi import status as http_status
from pixsim7_backend.shared.errors import InvalidOperationError
from pixsim7_backend.api.dependencies import CurrentUser, AssetSvc
from pixsim7_backend.shared.schemas.asset_schemas import (
    AssetResponse,
    AssetListResponse,
)
from pixsim7_backend.domain.enums import MediaType, SyncStatus, OperationType
from pixsim7_backend.shared.errors import ResourceNotFoundError

router = APIRouter()


# ===== LIST ASSETS =====

@router.get("/assets", response_model=AssetListResponse)
async def list_assets(
    user: CurrentUser,
    asset_service: AssetSvc,
    media_type: MediaType | None = Query(None, description="Filter by media type"),
    sync_status: SyncStatus | None = Query(None, description="Filter by sync status"),
    provider_id: str | None = Query(None, description="Filter by provider"),
    tag: str | None = Query(None, description="Filter assets containing tag"),
    q: str | None = Query(None, description="Full-text search over description/tags"),
    limit: int = Query(50, ge=1, le=100, description="Results per page"),
    offset: int = Query(0, ge=0, description="Pagination offset (legacy)"),
    cursor: str | None = Query(None, description="Opaque cursor for pagination"),
):
    """List assets for current user with optional filters.

    Supports either offset or cursor pagination (cursor takes precedence if provided).
    Assets returned newest first (created_at DESC, id DESC for tie-break).
    """
    try:
        # For now use existing service offset pagination; cursor support will be layered later.
        assets = await asset_service.list_assets(
            user=user,
            media_type=media_type,
            sync_status=sync_status,
            provider_id=provider_id,
            limit=limit,
            offset=offset if cursor is None else 0,  # ignore offset if cursor used (future implementation)
        )

        # Simple total (future: separate COUNT query)
        total = len(assets)

        # Placeholder cursor logic (future: encode last asset created_at|id)
        next_cursor = None
        if len(assets) == limit:
            last = assets[-1]
            # Opaque format created_at|id
            next_cursor = f"{last.created_at.isoformat()}|{last.id}"

        # Filter by tag/q post-query (temporary until pushed into SQL)
        if tag:
            assets = [a for a in assets if tag in (a.tags or [])]
        if q:
            q_lower = q.lower()
            assets = [
                a for a in assets
                if (a.description and q_lower in a.description.lower()) or any(q_lower in t.lower() for t in (a.tags or []))
            ]

        return AssetListResponse(
            assets=[AssetResponse.model_validate(a) for a in assets],
            total=total,
            limit=limit,
            offset=offset,
            next_cursor=next_cursor,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list assets: {str(e)}")


# ===== GET ASSET =====

@router.get("/assets/{asset_id}", response_model=AssetResponse)
async def get_asset(
    asset_id: int,
    user: CurrentUser,
    asset_service: AssetSvc
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
        return AssetResponse.model_validate(asset)

    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Asset not found")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get asset: {str(e)}")

@router.post("/assets/{asset_id}/sync", response_model=AssetResponse, status_code=http_status.HTTP_200_OK)
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

@router.delete("/assets/{asset_id}", status_code=204)
async def delete_asset(
    asset_id: int,
    user: CurrentUser,
    asset_service: AssetSvc
):
    """
    Delete an asset

    Deletes the asset record and local file (if downloaded).
    Does not delete the video from the provider.

    Users can only delete their own assets.
    """
    try:
        await asset_service.delete_asset(asset_id, user)
        return None

    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Asset not found")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete asset: {str(e)}")
