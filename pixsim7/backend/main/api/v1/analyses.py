"""
Asset Analysis API endpoints

Handles asset analysis creation, status checking, and result retrieval.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

from pixsim7.backend.main.api.dependencies import CurrentUser, AnalysisSvc
from pixsim7.backend.main.domain.assets.analysis import AnalyzerType, AnalysisStatus
from pixsim7.backend.main.shared.errors import ResourceNotFoundError, InvalidOperationError

router = APIRouter()


# ===== REQUEST/RESPONSE SCHEMAS =====

class CreateAnalysisRequest(BaseModel):
    """Request to create a new asset analysis"""
    analyzer_type: AnalyzerType = Field(
        ...,
        description="Type of analysis to perform"
    )
    provider_id: str = Field(
        ...,
        description="Provider to use for analysis (e.g., 'openai', 'anthropic')"
    )
    prompt: Optional[str] = Field(
        None,
        description="Prompt for the analysis (e.g., 'Describe the scene')"
    )
    params: Optional[Dict[str, Any]] = Field(
        None,
        description="Additional parameters for the analysis"
    )
    analyzer_version: Optional[str] = Field(
        None,
        description="Version of the analyzer to use"
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
    analyzer_type: str
    analyzer_version: Optional[str]
    provider_id: str
    prompt: Optional[str]
    params: Dict[str, Any]
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
            analyzer_type=request.analyzer_type,
            provider_id=request.provider_id,
            prompt=request.prompt,
            params=request.params,
            analyzer_version=request.analyzer_version,
            priority=request.priority,
        )

        return AnalysisResponse(
            id=analysis.id,
            asset_id=analysis.asset_id,
            user_id=analysis.user_id,
            analyzer_type=analysis.analyzer_type.value,
            analyzer_version=analysis.analyzer_version,
            provider_id=analysis.provider_id,
            prompt=analysis.prompt,
            params=analysis.params or {},
            status=analysis.status.value,
            priority=analysis.priority,
            result=analysis.result,
            error_message=analysis.error_message,
            created_at=analysis.created_at,
            started_at=analysis.started_at,
            completed_at=analysis.completed_at,
        )

    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/assets/{asset_id}/analyses", response_model=AnalysisListResponse)
async def list_asset_analyses(
    asset_id: int,
    user: CurrentUser,
    analysis_service: AnalysisSvc,
    analyzer_type: Optional[AnalyzerType] = Query(None, description="Filter by analyzer type"),
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
            analyzer_type=analyzer_type,
            status=status,
            limit=limit,
        )

        items = [
            AnalysisResponse(
                id=a.id,
                asset_id=a.asset_id,
                user_id=a.user_id,
                analyzer_type=a.analyzer_type.value,
                analyzer_version=a.analyzer_version,
                provider_id=a.provider_id,
                prompt=a.prompt,
                params=a.params or {},
                status=a.status.value,
                priority=a.priority,
                result=a.result,
                error_message=a.error_message,
                created_at=a.created_at,
                started_at=a.started_at,
                completed_at=a.completed_at,
            )
            for a in analyses
        ]

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

        return AnalysisResponse(
            id=analysis.id,
            asset_id=analysis.asset_id,
            user_id=analysis.user_id,
            analyzer_type=analysis.analyzer_type.value,
            analyzer_version=analysis.analyzer_version,
            provider_id=analysis.provider_id,
            prompt=analysis.prompt,
            params=analysis.params or {},
            status=analysis.status.value,
            priority=analysis.priority,
            result=analysis.result,
            error_message=analysis.error_message,
            created_at=analysis.created_at,
            started_at=analysis.started_at,
            completed_at=analysis.completed_at,
        )

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

        return AnalysisResponse(
            id=analysis.id,
            asset_id=analysis.asset_id,
            user_id=analysis.user_id,
            analyzer_type=analysis.analyzer_type.value,
            analyzer_version=analysis.analyzer_version,
            provider_id=analysis.provider_id,
            prompt=analysis.prompt,
            params=analysis.params or {},
            status=analysis.status.value,
            priority=analysis.priority,
            result=analysis.result,
            error_message=analysis.error_message,
            created_at=analysis.created_at,
            started_at=analysis.started_at,
            completed_at=analysis.completed_at,
        )

    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))
