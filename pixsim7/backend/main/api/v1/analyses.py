"""
Asset Analysis API endpoints

Handles asset analysis creation, status checking, and result retrieval.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

from pixsim7.backend.main.api.dependencies import CurrentUser, AnalysisSvc
from pixsim7.backend.main.domain.assets.analysis import AnalysisStatus
from pixsim7.backend.main.domain.assets.analysis_backfill import AnalysisBackfillStatus
from pixsim7.backend.main.services.analysis import AnalysisBackfillService
from pixsim7.backend.main.shared.errors import ResourceNotFoundError, InvalidOperationError

router = APIRouter()


# ===== REQUEST/RESPONSE SCHEMAS =====

class CreateAnalysisRequest(BaseModel):
    """Request to create a new asset analysis"""
    analyzer_id: Optional[str] = Field(
        None,
        min_length=1,
        max_length=100,
        description=(
            "Analyzer ID to execute (e.g., 'asset:object-detection'). "
            "If omitted, resolves from user analyzer defaults by media type."
        ),
    )
    analyzer_intent: Optional[str] = Field(
        None,
        min_length=1,
        max_length=100,
        description=(
            "Optional asset-analysis intent key used to resolve a more specific "
            "default analyzer from user preferences (e.g. 'character_ingest_face')."
        ),
    )
    analysis_point: Optional[str] = Field(
        None,
        min_length=1,
        max_length=120,
        description=(
            "Optional analysis point key for routing/idempotency (e.g. "
            "'character_ingest_face'). If omitted, analyzer_intent or a "
            "derived manual point is used."
        ),
    )
    prompt: Optional[str] = Field(
        None,
        description="Prompt for the analysis (e.g., 'Describe the scene')"
    )
    params: Optional[Dict[str, Any]] = Field(
        None,
        description="Additional parameters for the analysis"
    )
    priority: int = Field(
        5,
        ge=0,
        le=10,
        description="Job priority (0=highest, 10=lowest)"
    )


class AnalysisResponse(BaseModel):
    """Response for a single analysis"""
    id: int
    asset_id: int
    user_id: int
    analyzer_id: str
    model_id: Optional[str]
    provider_id: str
    prompt: Optional[str]
    params: Dict[str, Any]
    analysis_point: str
    analyzer_definition_version: Optional[str]
    effective_config_hash: Optional[str]
    input_fingerprint: Optional[str]
    dedupe_key: Optional[str]
    status: str
    priority: int
    result: Optional[Dict[str, Any]]
    error_message: Optional[str]
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class AnalysisListResponse(BaseModel):
    """Response for listing analyses"""
    items: List[AnalysisResponse]
    total: int


class CreateAnalysisBackfillRequest(BaseModel):
    """Request to create a durable analysis backfill run."""

    media_type: Optional[str] = Field(
        None,
        description="Optional media type filter (image|video|audio|3d_model)",
    )
    analyzer_id: Optional[str] = Field(
        None,
        min_length=1,
        max_length=100,
        description="Optional explicit analyzer ID for all assets in the run",
    )
    analyzer_intent: Optional[str] = Field(
        None,
        min_length=1,
        max_length=100,
        description="Optional intent key used to resolve analyzer defaults",
    )
    analysis_point: Optional[str] = Field(
        None,
        min_length=1,
        max_length=120,
        description="Optional fixed analysis point used for all created analyses",
    )
    prompt: Optional[str] = Field(
        None,
        description="Optional analysis prompt passed to each analysis",
    )
    params: Optional[Dict[str, Any]] = Field(
        None,
        description="Optional params payload passed to each analysis",
    )
    priority: int = Field(
        5,
        ge=0,
        le=10,
        description="Job priority for created analyses (0=highest, 10=lowest)",
    )
    batch_size: int = Field(
        100,
        ge=1,
        le=1000,
        description="Assets processed per worker batch",
    )


class AnalysisBackfillResponse(BaseModel):
    """Response schema for analysis backfill runs."""

    id: int
    user_id: int
    status: str
    media_type: Optional[str]
    analyzer_id: Optional[str]
    analyzer_intent: Optional[str]
    analysis_point: Optional[str]
    prompt: Optional[str]
    params: Dict[str, Any]
    priority: int
    batch_size: int
    cursor_asset_id: int
    total_assets: int
    processed_assets: int
    created_analyses: int
    deduped_assets: int
    failed_assets: int
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    last_error: Optional[str]
    created_at: datetime
    updated_at: datetime


class AnalysisBackfillListResponse(BaseModel):
    items: List[AnalysisBackfillResponse]
    total: int


# ===== SERIALIZATION HELPERS =====

def _build_analysis_response(analysis) -> AnalysisResponse:
    return AnalysisResponse(
        id=analysis.id,
        asset_id=analysis.asset_id,
        user_id=analysis.user_id,
        analyzer_id=analysis.analyzer_id,
        model_id=analysis.model_id,
        provider_id=analysis.provider_id,
        prompt=analysis.prompt,
        params=analysis.params or {},
        analysis_point=analysis.analysis_point,
        analyzer_definition_version=analysis.analyzer_definition_version,
        effective_config_hash=analysis.effective_config_hash,
        input_fingerprint=analysis.input_fingerprint,
        dedupe_key=analysis.dedupe_key,
        status=analysis.status.value,
        priority=analysis.priority,
        result=analysis.result,
        error_message=analysis.error_message,
        created_at=analysis.created_at,
        started_at=analysis.started_at,
        completed_at=analysis.completed_at,
    )


def _build_backfill_response(run) -> AnalysisBackfillResponse:
    return AnalysisBackfillResponse(
        id=run.id,
        user_id=run.user_id,
        status=run.status.value if hasattr(run.status, "value") else str(run.status),
        media_type=run.media_type,
        analyzer_id=run.analyzer_id,
        analyzer_intent=run.analyzer_intent,
        analysis_point=run.analysis_point,
        prompt=run.prompt,
        params=run.params or {},
        priority=run.priority,
        batch_size=run.batch_size,
        cursor_asset_id=run.cursor_asset_id,
        total_assets=run.total_assets,
        processed_assets=run.processed_assets,
        created_analyses=run.created_analyses,
        deduped_assets=run.deduped_assets,
        failed_assets=run.failed_assets,
        started_at=run.started_at,
        completed_at=run.completed_at,
        last_error=run.last_error,
        created_at=run.created_at,
        updated_at=run.updated_at,
    )


# ===== ENDPOINTS =====

@router.post("/assets/{asset_id}/analyze", response_model=AnalysisResponse)
async def create_analysis(
    asset_id: int,
    request: CreateAnalysisRequest,
    user: CurrentUser,
    analysis_service: AnalysisSvc,
):
    """
    Create a new analysis job for an asset.

    The analysis will be queued for processing and executed asynchronously.
    Use GET /analyses/{id} to check status and retrieve results.
    """
    try:
        analysis = await analysis_service.create_analysis(
            user=user,
            asset_id=asset_id,
            analyzer_id=request.analyzer_id,
            analyzer_intent=request.analyzer_intent,
            analysis_point=request.analysis_point,
            prompt=request.prompt,
            params=request.params,
            priority=request.priority,
        )

        return _build_analysis_response(analysis)

    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/assets/{asset_id}/analyses", response_model=AnalysisListResponse)
async def list_asset_analyses(
    asset_id: int,
    user: CurrentUser,
    analysis_service: AnalysisSvc,
    analyzer_id: Optional[str] = Query(None, description="Filter by analyzer ID"),
    status: Optional[AnalysisStatus] = Query(None, description="Filter by status"),
    limit: int = Query(50, ge=1, le=100, description="Maximum results to return"),
):
    """
    List all analyses for an asset.

    Returns analyses ordered by creation time (newest first).
    """
    try:
        analyses = await analysis_service.get_analyses_for_asset(
            asset_id=asset_id,
            user=user,
            analyzer_id=analyzer_id,
            status=status,
            limit=limit,
        )

        items = [_build_analysis_response(a) for a in analyses]

        return AnalysisListResponse(
            items=items,
            total=len(items),
        )

    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/analyses/{analysis_id}", response_model=AnalysisResponse)
async def get_analysis(
    analysis_id: int,
    user: CurrentUser,
    analysis_service: AnalysisSvc,
):
    """
    Get a single analysis by ID.

    Returns the analysis including its current status and result (if completed).
    """
    try:
        analysis = await analysis_service.get_analysis(analysis_id)

        # Check authorization
        if analysis.user_id != user.id:
            raise HTTPException(status_code=403, detail="Not authorized to view this analysis")

        return _build_analysis_response(analysis)

    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/analyses/{analysis_id}/cancel", response_model=AnalysisResponse)
async def cancel_analysis(
    analysis_id: int,
    user: CurrentUser,
    analysis_service: AnalysisSvc,
):
    """
    Cancel a pending or processing analysis.

    Only the owner of the analysis can cancel it.
    """
    try:
        analysis = await analysis_service.cancel_analysis(analysis_id, user)

        return _build_analysis_response(analysis)

    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/analyses/backfills", response_model=AnalysisBackfillResponse, status_code=201)
async def create_analysis_backfill(
    request: CreateAnalysisBackfillRequest,
    user: CurrentUser,
    analysis_service: AnalysisSvc,
):
    """Create a durable analysis backfill run and enqueue its first batch."""
    try:
        service = AnalysisBackfillService(analysis_service.db)
        run = await service.create_run(
            user=user,
            media_type=request.media_type,
            analyzer_id=request.analyzer_id,
            analyzer_intent=request.analyzer_intent,
            analysis_point=request.analysis_point,
            prompt=request.prompt,
            params=request.params,
            priority=request.priority,
            batch_size=request.batch_size,
            enqueue=True,
        )
        return _build_backfill_response(run)
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/analyses/backfills", response_model=AnalysisBackfillListResponse)
async def list_analysis_backfills(
    user: CurrentUser,
    analysis_service: AnalysisSvc,
    status: Optional[AnalysisBackfillStatus] = Query(
        None,
        description="Filter by status",
    ),
    limit: int = Query(50, ge=1, le=200, description="Maximum results to return"),
):
    """List analysis backfill runs for the current user."""
    try:
        service = AnalysisBackfillService(analysis_service.db)
        runs = await service.list_runs(
            user_id=user.id,
            status=status,
            limit=limit,
        )
        items = [_build_backfill_response(run) for run in runs]
        return AnalysisBackfillListResponse(items=items, total=len(items))
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/analyses/backfills/{run_id}", response_model=AnalysisBackfillResponse)
async def get_analysis_backfill(
    run_id: int,
    user: CurrentUser,
    analysis_service: AnalysisSvc,
):
    """Get a single analysis backfill run."""
    try:
        service = AnalysisBackfillService(analysis_service.db)
        run = await service.get_run_for_user(run_id=run_id, user_id=user.id)
        return _build_backfill_response(run)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/analyses/backfills/{run_id}/pause", response_model=AnalysisBackfillResponse)
async def pause_analysis_backfill(
    run_id: int,
    user: CurrentUser,
    analysis_service: AnalysisSvc,
):
    """Pause an analysis backfill run."""
    try:
        service = AnalysisBackfillService(analysis_service.db)
        run = await service.pause_run(run_id=run_id, user=user)
        return _build_backfill_response(run)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/analyses/backfills/{run_id}/resume", response_model=AnalysisBackfillResponse)
async def resume_analysis_backfill(
    run_id: int,
    user: CurrentUser,
    analysis_service: AnalysisSvc,
):
    """Resume a paused analysis backfill run."""
    try:
        service = AnalysisBackfillService(analysis_service.db)
        run = await service.resume_run(run_id=run_id, user=user)
        return _build_backfill_response(run)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/analyses/backfills/{run_id}/cancel", response_model=AnalysisBackfillResponse)
async def cancel_analysis_backfill(
    run_id: int,
    user: CurrentUser,
    analysis_service: AnalysisSvc,
):
    """Cancel an analysis backfill run."""
    try:
        service = AnalysisBackfillService(analysis_service.db)
        run = await service.cancel_run(run_id=run_id, user=user)
        return _build_backfill_response(run)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))
