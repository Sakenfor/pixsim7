from datetime import datetime
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional
from pixsim7.backend.main.api.dependencies import CurrentAdminUser, DatabaseSession
from pixsim_logging import get_logger
from pixsim7.backend.main.domain.assets.backfill import BackfillStatus
from pixsim7.backend.main.services.asset.signal_backfill_service import (
    SignalBackfillService,
)
from pixsim7.backend.main.shared.errors import (
    InvalidOperationError,
    ResourceNotFoundError,
)

router = APIRouter(tags=["assets-maintenance"])
logger = get_logger()


class CreateSignalBackfillRunRequest(BaseModel):
    """Request to start a durable signal-scan reprobe run."""

    target_scanner_version: Optional[str] = Field(
        None,
        description="Scanner version to bring videos up to (defaults to current SCANNER_VERSION).",
    )
    mode: str = Field(
        "reprobe",
        description=(
            "'reprobe' = full ffmpeg probe over stale videos (captures chroma_fp + "
            "metrics); 'rescore' = no ffmpeg, re-apply the fingerprint matcher + "
            "scoring over every previously-scored video's stored metrics."
        ),
    )
    batch_size: int = Field(
        100,
        ge=1,
        le=1000,
        description="Videos processed per worker batch.",
    )


class SignalBackfillRunResponse(BaseModel):
    """Response schema for a durable signal-scan reprobe run."""

    id: int
    user_id: int
    status: str
    target_scanner_version: str
    mode: str
    batch_size: int
    cursor_asset_id: int
    total_assets: int
    processed_assets: int
    scanned_assets: int
    broken_assets: int
    skipped_assets: int
    failed_assets: int
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    last_error: Optional[str]
    created_at: datetime
    updated_at: datetime


class SignalBackfillRunListResponse(BaseModel):
    items: List[SignalBackfillRunResponse]
    total: int


def _build_signal_backfill_response(run) -> SignalBackfillRunResponse:
    return SignalBackfillRunResponse(
        id=run.id,
        user_id=run.user_id,
        status=run.status.value if hasattr(run.status, "value") else str(run.status),
        target_scanner_version=run.target_scanner_version,
        mode=getattr(run, "mode", "reprobe"),
        batch_size=run.batch_size,
        cursor_asset_id=run.cursor_asset_id,
        total_assets=run.total_assets,
        processed_assets=run.processed_assets,
        scanned_assets=run.scanned_assets,
        broken_assets=run.broken_assets,
        skipped_assets=run.skipped_assets,
        failed_assets=run.failed_assets,
        started_at=run.started_at,
        completed_at=run.completed_at,
        last_error=run.last_error,
        created_at=run.created_at,
        updated_at=run.updated_at,
    )


@router.post(
    "/signal-backfill-runs",
    response_model=SignalBackfillRunResponse,
    status_code=201,
)
async def create_signal_backfill_run(
    request: CreateSignalBackfillRunRequest,
    admin: CurrentAdminUser,
    db: DatabaseSession,
) -> SignalBackfillRunResponse:
    """Start a durable signal-scan run and enqueue its first batch.

    ``mode='reprobe'`` (default) re-probes every stale video with ffmpeg
    (captures chroma_fp + audio/visual metrics); ``mode='rescore'`` skips ffmpeg
    and re-applies the fingerprint matcher + scoring over every previously-scored
    video's stored metrics — the cheap pass for reference-curation / threshold
    tuning. One batch at a time, resumable across worker restarts; poll/pause/
    cancel via the sibling endpoints.
    """
    try:
        service = SignalBackfillService(db)
        run = await service.create_run(
            user=admin,
            target_scanner_version=request.target_scanner_version,
            batch_size=request.batch_size,
            mode=request.mode,
            enqueue=True,
        )
        return _build_signal_backfill_response(run)
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/signal-backfill-runs", response_model=SignalBackfillRunListResponse)
async def list_signal_backfill_runs(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    status: Optional[BackfillStatus] = Query(None, description="Filter by status"),
    limit: int = Query(50, ge=1, le=200, description="Maximum results to return"),
) -> SignalBackfillRunListResponse:
    """List signal-scan reprobe runs for the current admin."""
    service = SignalBackfillService(db)
    runs = await service.list_runs(user_id=admin.id, status=status, limit=limit)
    items = [_build_signal_backfill_response(r) for r in runs]
    return SignalBackfillRunListResponse(items=items, total=len(items))


@router.get(
    "/signal-backfill-runs/{run_id}",
    response_model=SignalBackfillRunResponse,
)
async def get_signal_backfill_run(
    run_id: int,
    admin: CurrentAdminUser,
    db: DatabaseSession,
) -> SignalBackfillRunResponse:
    """Get a single signal-scan reprobe run (live progress)."""
    try:
        service = SignalBackfillService(db)
        run = await service.get_run_for_user(run_id=run_id, user_id=admin.id)
        return _build_signal_backfill_response(run)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/signal-backfill-runs/{run_id}/pause",
    response_model=SignalBackfillRunResponse,
)
async def pause_signal_backfill_run(
    run_id: int,
    admin: CurrentAdminUser,
    db: DatabaseSession,
) -> SignalBackfillRunResponse:
    """Pause a running signal-scan reprobe run."""
    try:
        service = SignalBackfillService(db)
        run = await service.pause_run(run_id=run_id, user=admin)
        return _build_signal_backfill_response(run)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/signal-backfill-runs/{run_id}/resume",
    response_model=SignalBackfillRunResponse,
)
async def resume_signal_backfill_run(
    run_id: int,
    admin: CurrentAdminUser,
    db: DatabaseSession,
) -> SignalBackfillRunResponse:
    """Resume a paused signal-scan reprobe run (re-enqueues a batch)."""
    try:
        service = SignalBackfillService(db)
        run = await service.resume_run(run_id=run_id, user=admin)
        return _build_signal_backfill_response(run)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/signal-backfill-runs/{run_id}/cancel",
    response_model=SignalBackfillRunResponse,
)
async def cancel_signal_backfill_run(
    run_id: int,
    admin: CurrentAdminUser,
    db: DatabaseSession,
) -> SignalBackfillRunResponse:
    """Cancel a signal-scan reprobe run."""
    try:
        service = SignalBackfillService(db)
        run = await service.cancel_run(run_id=run_id, user=admin)
        return _build_signal_backfill_response(run)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))
