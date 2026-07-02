from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from pixsim7.backend.main.api.dependencies import CurrentAdminUser, DatabaseSession
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim_logging import get_logger
from .base import BackfillResultBase, _coverage_pct

router = APIRouter(tags=["assets-maintenance"])
logger = get_logger()


class UploadMethodStatsResponse(BaseModel):
    """Upload method coverage statistics"""
    total_assets: int
    with_upload_method: int
    without_upload_method: int
    by_method: dict[str, int]
    percentage: float


class InferenceRuleInfo(BaseModel):
    """Info about an upload method inference rule"""
    name: str
    description: str


class UploadMethodConfigResponse(BaseModel):
    """Upload method configuration and available rules"""
    default_method: str
    available_methods: dict[str, str]
    inference_rules: list[InferenceRuleInfo]


@router.get("/upload-method-config", response_model=UploadMethodConfigResponse)
async def get_upload_method_config(
    admin: CurrentAdminUser,
) -> UploadMethodConfigResponse:
    """
    Get upload method configuration including available methods and inference rules.

    Useful for understanding how upload_method is inferred during backfill.
    """
    from pixsim7.backend.main.domain.assets.upload_attribution import (
        DEFAULT_UPLOAD_METHOD,
        UPLOAD_METHOD_LABELS,
        INFERENCE_RULES,
    )

    rules = [
        InferenceRuleInfo(
            name=name,
            description=fn.__doc__.strip() if fn.__doc__ else f"Rule: {name}",
        )
        for name, fn in INFERENCE_RULES
    ]

    return UploadMethodConfigResponse(
        default_method=DEFAULT_UPLOAD_METHOD,
        available_methods=UPLOAD_METHOD_LABELS,
        inference_rules=rules,
    )


@router.get("/upload-method-stats", response_model=UploadMethodStatsResponse)
async def get_upload_method_stats(
    admin: CurrentAdminUser,
    db: DatabaseSession,
) -> UploadMethodStatsResponse:
    """
    Get statistics about upload_method coverage for user's assets.

    Shows how many assets have upload_method set, and breakdown by method.
    Useful for identifying assets that need backfill.
    """

    # Total assets
    total_result = await db.execute(
        select(func.count(Asset.id)).where(Asset.user_id == admin.id)
    )
    total = total_result.scalar() or 0

    # Assets with upload_method
    with_method_result = await db.execute(
        select(func.count(Asset.id)).where(
            Asset.user_id == admin.id,
            Asset.upload_method.isnot(None)
        )
    )
    with_method = with_method_result.scalar() or 0

    without_method = total - with_method

    # Breakdown by method
    by_method_result = await db.execute(
        select(Asset.upload_method, func.count(Asset.id))
        .where(
            Asset.user_id == admin.id,
            Asset.upload_method.isnot(None)
        )
        .group_by(Asset.upload_method)
    )
    by_method = {row[0]: row[1] for row in by_method_result.fetchall()}

    percentage = _coverage_pct(with_method, total)

    return UploadMethodStatsResponse(
        total_assets=total,
        with_upload_method=with_method,
        without_upload_method=without_method,
        by_method=by_method,
        percentage=round(percentage, 2),
    )


class BackfillUploadMethodResponse(BackfillResultBase):
    """Response from upload method backfill operation"""
    updated: int
    by_method: dict[str, int]


@router.post("/backfill-upload-method", response_model=BackfillUploadMethodResponse)
async def backfill_upload_method(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    limit: int = Query(default=500, ge=1, le=2000, description="Max assets to process"),
    dry_run: bool = Query(default=False, description="If true, don't actually update"),
) -> BackfillUploadMethodResponse:
    """
    Backfill upload_method from asset metadata using centralized inference rules.

    Uses the rule-based inference system from upload_attribution module which checks:
    - Explicit upload_method in metadata (normalized)
    - source_folder_id -> 'local'
    - Pixverse metadata/provider -> 'pixverse_sync'
    - source_url/source_site -> 'web'
    - source_generation_id -> 'generated'
    - Default fallback -> 'web'

    Rules can be extended by adding to INFERENCE_RULES in upload_attribution.py
    """
    from pixsim7.backend.main.domain.assets.upload_attribution import infer_upload_method_from_asset

    try:
        # Get assets without upload_method
        result = await db.execute(
            select(Asset).where(
                Asset.user_id == admin.id,
                Asset.upload_method.is_(None)
            ).limit(limit)
        )
        assets = result.scalars().all()

        processed = 0
        updated = 0
        skipped = 0
        errors = 0
        by_method: dict[str, int] = {}

        for asset in assets:
            processed += 1
            try:
                # Use centralized inference from upload_attribution module
                inferred_method = infer_upload_method_from_asset(asset)

                if inferred_method:
                    if not dry_run:
                        asset.upload_method = inferred_method
                        db.add(asset)
                    updated += 1
                    by_method[inferred_method] = by_method.get(inferred_method, 0) + 1
                else:
                    skipped += 1
            except Exception as exc:
                logger.warning(
                    "upload_method_backfill_failed",
                    asset_id=asset.id,
                    error=str(exc),
                )
                errors += 1

        if not dry_run:
            await db.commit()

        return BackfillUploadMethodResponse(
            success=True,
            processed=processed,
            updated=updated,
            by_method=by_method,
            skipped=skipped,
            errors=errors,
        )
    except Exception as exc:
        logger.error(
            "upload_method_backfill_error",
            error=str(exc),
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to backfill upload method: {str(exc)}"
        )
