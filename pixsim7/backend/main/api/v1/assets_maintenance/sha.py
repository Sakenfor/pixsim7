from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from pixsim7.backend.main.api.dependencies import CurrentAdminUser, AssetSvc, DatabaseSession
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim_logging import get_logger
from .base import BackfillResultBase, _coverage_pct

router = APIRouter(tags=["assets-maintenance"])
logger = get_logger()


class SHAStatsResponse(BaseModel):
    """SHA hash coverage statistics"""
    total_assets: int
    with_sha: int
    without_sha: int
    without_sha_with_local: int
    without_sha_no_local: int
    percentage: float


class BackfillSHAResponse(BackfillResultBase):
    """Response from SHA backfill operation"""
    updated: int
    duplicates: int = 0


@router.get("/sha-stats", response_model=SHAStatsResponse)
async def get_sha_stats(
    admin: CurrentAdminUser,
    db: DatabaseSession,
) -> SHAStatsResponse:
    """
    Get statistics about SHA256 hash coverage for user's assets.

    Returns counts of assets with/without SHA hashes, and which ones
    can be backfilled (have local files).
    """

    # Count total assets
    total_result = await db.execute(
        select(func.count(Asset.id)).where(Asset.user_id == admin.id)
    )
    total = total_result.scalar() or 0

    # Count assets with SHA
    with_sha_result = await db.execute(
        select(func.count(Asset.id)).where(
            Asset.user_id == admin.id,
            Asset.sha256.isnot(None)
        )
    )
    with_sha = with_sha_result.scalar() or 0

    # Count assets without SHA but with local files (can be backfilled)
    without_sha_with_local_result = await db.execute(
        select(func.count(Asset.id)).where(
            Asset.user_id == admin.id,
            Asset.sha256.is_(None),
            Asset.local_path.isnot(None)
        )
    )
    without_sha_with_local = without_sha_with_local_result.scalar() or 0

    # Calculate derived stats
    without_sha = total - with_sha
    without_sha_no_local = without_sha - without_sha_with_local
    percentage = _coverage_pct(with_sha, total)

    return SHAStatsResponse(
        total_assets=total,
        with_sha=with_sha,
        without_sha=without_sha,
        without_sha_with_local=without_sha_with_local,
        without_sha_no_local=without_sha_no_local,
        percentage=round(percentage, 2)
    )


@router.post("/backfill-sha", response_model=BackfillSHAResponse)
async def backfill_sha_hashes(
    admin: CurrentAdminUser,
    asset_service: AssetSvc,
    db: DatabaseSession,
    limit: int = Query(default=100, ge=1, le=500, description="Max assets to process"),
) -> BackfillSHAResponse:
    """
    Backfill SHA256 hashes for assets that have local files but no hash.

    This enables duplicate detection for older assets that were created
    before SHA hashing was implemented.
    """
    import os

    try:
        # Find assets without SHA but with local files
        result = await db.execute(
            select(Asset).where(
                Asset.user_id == admin.id,
                Asset.sha256.is_(None),
                Asset.local_path.isnot(None)
            ).limit(limit)
        )
        assets = result.scalars().all()

        # Get existing SHA256s for this user to avoid constraint violations
        existing_result = await db.execute(
            select(Asset.sha256).where(
                Asset.user_id == admin.id,
                Asset.sha256.isnot(None)
            )
        )
        existing_sha256s = set(row[0] for row in existing_result.fetchall())

        processed = 0
        updated = 0
        skipped = 0
        duplicates = 0
        errors = 0

        # Track SHA256s we're adding in this batch to avoid intra-batch conflicts
        batch_sha256s: dict[str, int] = {}  # sha256 -> first asset id in batch

        for asset in assets:
            processed += 1

            # Check if local file exists
            if not asset.local_path or not os.path.exists(asset.local_path):
                skipped += 1
                continue

            try:
                # Compute SHA256
                sha256 = asset_service._compute_sha256(asset.local_path)

                # Check for duplicates - either existing in DB or earlier in this batch
                if sha256 in existing_sha256s:
                    logger.info(
                        "sha_backfill_duplicate_existing",
                        asset_id=asset.id,
                        sha256=sha256[:16]
                    )
                    duplicates += 1
                    continue
                elif sha256 in batch_sha256s:
                    logger.info(
                        "sha_backfill_duplicate_batch",
                        asset_id=asset.id,
                        original_id=batch_sha256s[sha256],
                        sha256=sha256[:16]
                    )
                    duplicates += 1
                    continue

                asset.sha256 = sha256
                batch_sha256s[sha256] = asset.id
                updated += 1
            except Exception as e:
                logger.warning(
                    "sha_backfill_asset_failed",
                    asset_id=asset.id,
                    error=str(e)
                )
                errors += 1

        await db.commit()

        return BackfillSHAResponse(
            success=True,
            processed=processed,
            updated=updated,
            skipped=skipped,
            duplicates=duplicates,
            errors=errors
        )

    except Exception as e:
        logger.error(
            "sha_backfill_failed",
            error=str(e),
            exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to backfill SHA hashes: {str(e)}"
        )
