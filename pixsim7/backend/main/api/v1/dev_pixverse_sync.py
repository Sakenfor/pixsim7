"""
Dev Pixverse Sync API

Dry-run inspection of Pixverse account videos for a given provider account.
Does NOT create or modify any assets; useful for checking what could be synced.
"""
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.api.dependencies import get_current_user, get_database
from pixsim7.backend.main.domain import Asset, User
from pixsim7.backend.main.domain.providers import ProviderAccount
from pixsim7.backend.main.services.provider.adapters.pixverse import PixverseProvider
from pixsim7.backend.main.shared.errors import ProviderError
from pixsim_logging import get_logger

logger = get_logger()

router = APIRouter(prefix="/dev/pixverse-sync", tags=["dev", "pixverse"])


def _extract_video_id(video: Dict[str, Any]) -> Optional[str]:
    """
    Best-effort extraction of a video ID from Pixverse video payload.

    Tries common keys ('video_id', 'VideoId', 'id'). Returns string or None.
    """
    for key in ("video_id", "VideoId", "id"):
        if key in video and video[key] is not None:
            return str(video[key])
    return None


@router.get("/dry-run")
async def pixverse_sync_dry_run(
    account_id: int = Query(..., description="ProviderAccount ID for Pixverse"),
    limit: int = Query(20, ge=1, le=100, description="Max videos to inspect"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_database),
):
    """
    Dry-run Pixverse video sync for a single account.

    - Uses the stored ProviderAccount (cookies/JWT/api_key) to list videos via pixverse-py.
    - Compares remote video IDs against local Asset rows for the same user/provider.
    - Returns which videos are already imported and which are candidates.

    This endpoint does not create or modify any assets.
    """
    # Look up provider account and validate ownership/provider
    stmt = select(ProviderAccount).where(
        ProviderAccount.id == account_id,
        ProviderAccount.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    account = result.scalar_one_or_none()

    if not account or account.provider_id != "pixverse":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pixverse account not found for current user",
        )

    # Instantiate PixverseProvider and client
    try:
        provider = PixverseProvider()
    except ImportError as e:
        logger.error("pixverse_py_not_installed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="pixverse-py is not installed on the backend",
        )

    client = provider._create_client(account)  # type: ignore[attr-defined]

    # Call pixverse-py list_videos (now returns a coroutine, so await directly)
    try:
        videos: List[Dict[str, Any]] = await client.list_videos(limit=limit, offset=offset)
    except Exception as e:
        logger.error(
            "pixverse_list_videos_failed",
            error=str(e),
            error_type=e.__class__.__name__,
            account_id=account_id,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to list Pixverse videos: {e}",
        )

    # Extract video IDs from remote payload
    remote_items: List[Dict[str, Any]] = []
    video_ids: List[str] = []
    for v in videos:
        vid = _extract_video_id(v)
        remote_items.append(
            {
                "video_id": vid,
                "raw": v,
            }
        )
        if vid:
            video_ids.append(vid)

    # Look up which video IDs already exist as Assets for this user/provider
    existing_ids: set[str] = set()
    if video_ids:
        stmt_assets = select(Asset.provider_asset_id).where(
            Asset.user_id == current_user.id,
            Asset.provider_id == "pixverse",
            Asset.provider_asset_id.in_(video_ids),
        )
        result_assets = await db.execute(stmt_assets)
        existing_ids = {row[0] for row in result_assets.fetchall()}

    # Build response
    items = []
    for item in remote_items:
        vid = item["video_id"]
        items.append(
            {
                "video_id": vid,
                "already_imported": bool(vid and vid in existing_ids),
                "raw": item["raw"],
            }
        )

    return {
        "provider_id": "pixverse",
        "account_id": account_id,
        "limit": limit,
        "offset": offset,
        "total_remote": len(videos),
        "existing_count": len(existing_ids),
        "videos": items,
    }

