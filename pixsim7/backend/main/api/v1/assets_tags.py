"""
Asset tag management API endpoints

Tag assignment, removal, and analysis.
"""
from fastapi import APIRouter, HTTPException

from pixsim7.backend.main.api.dependencies import CurrentUser, AssetSvc, DatabaseSession
from pixsim7.backend.main.shared.schemas.asset_schemas import AssetResponse
from pixsim7.backend.main.shared.schemas.tag_schemas import AssignTagsRequest
from pixsim7.backend.main.services.tag_service import TagService
from pixsim7.backend.main.domain.enums import MediaType
from pixsim7.backend.main.shared.errors import ResourceNotFoundError, InvalidOperationError
from pixsim_logging import get_logger
from pixsim7.backend.main.api.v1.assets_helpers import build_asset_response_with_tags

router = APIRouter(tags=["assets-tags"])
logger = get_logger()


# ===== ASSIGN TAGS =====

@router.post("/assets/{asset_id}/tags/assign", response_model=AssetResponse)
async def assign_tags_to_asset(
    asset_id: int,
    request: AssignTagsRequest,
    user: CurrentUser,
    asset_service: AssetSvc,
    db: DatabaseSession,
):
    """
    Assign/remove tags to/from an asset using structured hierarchical tags.

    Tags are automatically:
    - Normalized (lowercase, trimmed)
    - Resolved to canonical tags (aliases are followed)
    - Created if they don't exist
    """
    try:
        asset = await asset_service.get_asset_for_user(asset_id, user)
        tag_service = TagService(db)

        if request.add:
            await tag_service.assign_tags_to_asset(
                asset_id=asset_id,
                tag_slugs=request.add,
                auto_create=True,
            )

        if request.remove:
            await tag_service.remove_tags_from_asset(
                asset_id=asset_id,
                tag_slugs=request.remove,
            )

        return await build_asset_response_with_tags(asset, db)

    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Asset not found")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to assign tags: {str(e)}"
        )


# ===== ANALYZE ASSET =====

@router.post("/assets/{asset_id}/analyze")
async def analyze_asset_for_tags(
    asset_id: int,
    user: CurrentUser,
    asset_service: AssetSvc,
    db: DatabaseSession,
):
    """
    Analyze an asset and suggest tags using heuristics.

    Returns suggested tags based on:
    - Media type (image/video)
    - Dimensions and orientation
    - Duration (for videos)
    """
    try:
        asset = await asset_service.get_asset_for_user(asset_id, user)
        tag_service = TagService(db)
        suggestions = []

        # Add media type tag
        if asset.media_type:
            suggestions.append(asset.media_type.value)

        # Add provider tag
        if asset.provider_id:
            suggestions.append(f"from_{asset.provider_id}")

        # Analyze dimensions for orientation
        if asset.width and asset.height:
            if asset.width > asset.height:
                suggestions.append("landscape")
            elif asset.height > asset.width:
                suggestions.append("portrait")
            else:
                suggestions.append("square")

            if asset.width >= 1920 or asset.height >= 1080:
                suggestions.append("high_res")
            elif asset.width <= 640 or asset.height <= 480:
                suggestions.append("low_res")

        # Add duration-based tags for videos
        if asset.media_type == MediaType.VIDEO and asset.duration_sec:
            if asset.duration_sec <= 5:
                suggestions.append("short")
            elif asset.duration_sec >= 20:
                suggestions.append("long")
            suggestions.append("cinematic")

        existing_tags = [t.slug for t in await tag_service.get_asset_tags(asset.id)]

        return {
            "suggested_tags": suggestions,
            "existing_tags": existing_tags,
            "asset_id": asset.id,
            "media_type": asset.media_type.value
        }

    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Asset not found")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to analyze asset: {str(e)}"
        )
