"""
Dialogue Analytics API endpoints.

Provides cost tracking, engagement metrics, quality analysis,
and model/program performance comparisons.
"""

from typing import Dict, Any, Optional

from fastapi import APIRouter

from pixsim7_backend.api.dependencies import CurrentUser, DatabaseSession
from pixsim7_backend.services.npc import DialogueAnalyticsService


router = APIRouter()


@router.get("/cost-summary")
async def get_cost_summary(
    db: DatabaseSession,
    user: CurrentUser,
    npc_id: Optional[int] = None,
    days: int = 30
) -> Dict[str, Any]:
    """
    Get cost summary for dialogue generation

    Shows LLM costs, cache savings, and usage statistics
    """
    analytics_service = DialogueAnalyticsService(db)

    summary = await analytics_service.get_cost_summary(
        npc_id=npc_id,
        user_id=user.id,
        days=days
    )

    return summary


@router.get("/engagement")
async def get_engagement_metrics(
    db: DatabaseSession,
    user: CurrentUser,
    npc_id: Optional[int] = None,
    days: int = 30
) -> Dict[str, Any]:
    """
    Get player engagement metrics

    Shows response rates, conversation continuation, and sentiment
    """
    analytics_service = DialogueAnalyticsService(db)

    metrics = await analytics_service.get_engagement_metrics(
        npc_id=npc_id,
        days=days
    )

    return metrics


@router.get("/quality")
async def get_quality_metrics(
    db: DatabaseSession,
    user: CurrentUser,
    npc_id: Optional[int] = None,
    days: int = 30
) -> Dict[str, Any]:
    """
    Get dialogue quality metrics

    Shows memory reference rate, emotional consistency, and dialogue length
    """
    analytics_service = DialogueAnalyticsService(db)

    metrics = await analytics_service.get_quality_metrics(
        npc_id=npc_id,
        days=days
    )

    return metrics


@router.get("/model-performance")
async def get_model_performance(
    db: DatabaseSession,
    user: CurrentUser,
    days: int = 30
) -> Dict[str, Any]:
    """
    Compare performance across different LLM models
    """
    analytics_service = DialogueAnalyticsService(db)

    performance = await analytics_service.get_model_performance(
        days=days
    )

    return performance


@router.get("/program-performance")
async def get_program_performance(
    db: DatabaseSession,
    user: CurrentUser,
    npc_id: Optional[int] = None,
    days: int = 30
) -> Dict[str, Any]:
    """
    Analyze performance by prompt program
    """
    analytics_service = DialogueAnalyticsService(db)

    performance = await analytics_service.get_program_performance(
        npc_id=npc_id,
        days=days
    )

    return performance
