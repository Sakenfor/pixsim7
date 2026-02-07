"""
AnalysisService - Asset analysis creation and lifecycle management

Handles the full lifecycle of asset analysis jobs:
- Creation with validation
- Status transitions
- Result storage
- ARQ job queueing
"""
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.domain import (
    User,
    Asset,
)
from pixsim7.backend.main.domain.assets.analysis import (
    AssetAnalysis,
    AnalysisStatus,
    AnalyzerType,
)
from pixsim7.backend.main.shared.errors import (
    ResourceNotFoundError,
    InvalidOperationError,
)
from pixsim7.backend.main.infrastructure.events.bus import event_bus

logger = logging.getLogger(__name__)

# Event types for analysis lifecycle
ANALYSIS_CREATED = "analysis.created"
ANALYSIS_STARTED = "analysis.started"
ANALYSIS_COMPLETED = "analysis.completed"
ANALYSIS_FAILED = "analysis.failed"


class AnalysisService:
    """
    Asset analysis service.

    Handles:
    - Analysis creation with asset validation
    - Status transitions with event publishing
    - Result storage
    - ARQ job queueing
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    # ===== CREATION =====

    async def create_analysis(
        self,
        user: User,
        asset_id: int,
        analyzer_type: AnalyzerType,
        provider_id: str,
        prompt: Optional[str] = None,
        params: Optional[Dict[str, Any]] = None,
        analyzer_version: Optional[str] = None,
        priority: int = 5,
    ) -> AssetAnalysis:
        """
        Create a new asset analysis job.

        Args:
            user: User creating the analysis
            asset_id: ID of the asset to analyze
            analyzer_type: Type of analysis to perform
            provider_id: Provider to use for analysis
            prompt: Optional prompt for the analysis
            params: Optional additional parameters
            analyzer_version: Optional version of the analyzer
            priority: Job priority (0=highest, 10=lowest)

        Returns:
            Created AssetAnalysis record

        Raises:
            ResourceNotFoundError: Asset not found
            InvalidOperationError: Invalid parameters
        """
        # Validate asset exists and user has access
        asset = await self._get_asset(asset_id)
        if asset.user_id != user.id:
            raise InvalidOperationError("Cannot analyze assets owned by other users")

        # Create analysis record
        analysis = AssetAnalysis(
            user_id=user.id,
            asset_id=asset_id,
            analyzer_type=analyzer_type,
            analyzer_version=analyzer_version,
            provider_id=provider_id,
            prompt=prompt,
            params=params or {},
            status=AnalysisStatus.PENDING,
            priority=priority,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        self.db.add(analysis)
        await self.db.commit()
        await self.db.refresh(analysis)

        logger.info(
            f"Analysis {analysis.id} created for asset {asset_id} "
            f"(type={analyzer_type.value}, provider={provider_id})"
        )

        # Emit event
        await event_bus.publish(ANALYSIS_CREATED, {
            "analysis_id": analysis.id,
            "asset_id": asset_id,
            "user_id": user.id,
            "analyzer_type": analyzer_type.value,
            "provider_id": provider_id,
        })

        # Queue for processing via ARQ
        try:
            from pixsim7.backend.main.infrastructure.redis import get_arq_pool
            arq_pool = await get_arq_pool()
            await arq_pool.enqueue_job(
                "process_analysis",
                analysis_id=analysis.id,
            )
            logger.info(f"Analysis {analysis.id} queued for processing")
        except Exception as e:
            logger.error(f"Failed to queue analysis {analysis.id}: {e}")
            # Don't fail creation if ARQ is down - worker can pick it up later

        return analysis

    # ===== LIFECYCLE =====

    async def mark_started(self, analysis_id: int) -> AssetAnalysis:
        """Mark analysis as started/processing"""
        analysis = await self._get_analysis(analysis_id)
        analysis.status = AnalysisStatus.PROCESSING
        analysis.started_at = datetime.now(timezone.utc)
        analysis.updated_at = datetime.now(timezone.utc)

        await self.db.commit()
        await self.db.refresh(analysis)

        await event_bus.publish(ANALYSIS_STARTED, {
            "analysis_id": analysis_id,
            "user_id": analysis.user_id,
            "asset_id": analysis.asset_id,
        })

        return analysis

    async def mark_completed(
        self,
        analysis_id: int,
        result: Dict[str, Any]
    ) -> AssetAnalysis:
        """
        Mark analysis as completed with result.

        Args:
            analysis_id: Analysis ID
            result: Analysis result data

        Returns:
            Updated analysis
        """
        analysis = await self._get_analysis(analysis_id)
        analysis.status = AnalysisStatus.COMPLETED
        analysis.completed_at = datetime.now(timezone.utc)
        analysis.updated_at = datetime.now(timezone.utc)
        analysis.result = result

        await self.db.commit()
        await self.db.refresh(analysis)

        logger.info(f"Analysis {analysis_id} completed")

        await event_bus.publish(ANALYSIS_COMPLETED, {
            "analysis_id": analysis_id,
            "user_id": analysis.user_id,
            "asset_id": analysis.asset_id,
        })

        return analysis

    async def mark_failed(
        self,
        analysis_id: int,
        error_message: str
    ) -> AssetAnalysis:
        """Mark analysis as failed"""
        analysis = await self._get_analysis(analysis_id)
        analysis.status = AnalysisStatus.FAILED
        analysis.completed_at = datetime.now(timezone.utc)
        analysis.updated_at = datetime.now(timezone.utc)
        analysis.error_message = error_message

        await self.db.commit()
        await self.db.refresh(analysis)

        logger.warning(f"Analysis {analysis_id} failed: {error_message}")

        await event_bus.publish(ANALYSIS_FAILED, {
            "analysis_id": analysis_id,
            "user_id": analysis.user_id,
            "asset_id": analysis.asset_id,
            "error": error_message,
        })

        return analysis

    async def cancel_analysis(
        self,
        analysis_id: int,
        user: User
    ) -> AssetAnalysis:
        """Cancel a pending or processing analysis"""
        analysis = await self._get_analysis(analysis_id)

        # Check authorization
        if analysis.user_id != user.id:
            raise InvalidOperationError("Cannot cancel other users' analyses")

        # Check if can be cancelled
        if analysis.is_terminal:
            raise InvalidOperationError(f"Analysis already {analysis.status.value}")

        analysis.status = AnalysisStatus.CANCELLED
        analysis.completed_at = datetime.now(timezone.utc)
        analysis.updated_at = datetime.now(timezone.utc)

        await self.db.commit()
        await self.db.refresh(analysis)

        logger.info(f"Analysis {analysis_id} cancelled by user {user.id}")

        return analysis

    # ===== QUERIES =====

    async def get_analysis(self, analysis_id: int) -> AssetAnalysis:
        """Get analysis by ID"""
        return await self._get_analysis(analysis_id)

    async def get_analyses_for_asset(
        self,
        asset_id: int,
        user: User,
        analyzer_type: Optional[AnalyzerType] = None,
        status: Optional[AnalysisStatus] = None,
        limit: int = 50,
    ) -> List[AssetAnalysis]:
        """
        Get analyses for an asset.

        Args:
            asset_id: Asset ID
            user: User requesting (for authorization)
            analyzer_type: Optional filter by analyzer type
            status: Optional filter by status
            limit: Maximum results to return

        Returns:
            List of analyses
        """
        # Validate asset exists and user has access
        asset = await self._get_asset(asset_id)
        if asset.user_id != user.id:
            raise InvalidOperationError("Cannot view analyses for assets owned by other users")

        query = (
            select(AssetAnalysis)
            .where(AssetAnalysis.asset_id == asset_id)
            .order_by(AssetAnalysis.created_at.desc())
            .limit(limit)
        )

        if analyzer_type:
            query = query.where(AssetAnalysis.analyzer_type == analyzer_type)
        if status:
            query = query.where(AssetAnalysis.status == status)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_pending_analyses(self, limit: int = 10) -> List[AssetAnalysis]:
        """Get pending analyses for requeue processing"""
        result = await self.db.execute(
            select(AssetAnalysis)
            .where(AssetAnalysis.status == AnalysisStatus.PENDING)
            .order_by(AssetAnalysis.priority, AssetAnalysis.created_at)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_processing_analyses(self) -> List[AssetAnalysis]:
        """Get all processing analyses for status polling"""
        result = await self.db.execute(
            select(AssetAnalysis)
            .where(AssetAnalysis.status == AnalysisStatus.PROCESSING)
            .order_by(AssetAnalysis.started_at)
        )
        return list(result.scalars().all())

    # ===== PRIVATE HELPERS =====

    async def _get_analysis(self, analysis_id: int) -> AssetAnalysis:
        """Get analysis by ID or raise ResourceNotFoundError"""
        analysis = await self.db.get(AssetAnalysis, analysis_id)
        if not analysis:
            raise ResourceNotFoundError(f"Analysis {analysis_id} not found")
        return analysis

    async def _get_asset(self, asset_id: int) -> Asset:
        """Get asset by ID or raise ResourceNotFoundError"""
        asset = await self.db.get(Asset, asset_id)
        if not asset:
            raise ResourceNotFoundError(f"Asset {asset_id} not found")
        return asset
