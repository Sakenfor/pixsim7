"""
Analysis backfill orchestration service.

Durable, resumable batch orchestration that creates analysis jobs across
existing assets for a user.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim_logging import configure_logging
from pixsim7.backend.main.domain import Asset, User
from pixsim7.backend.main.domain.assets.analysis_backfill import (
    AnalysisBackfillRun,
    AnalysisBackfillStatus,
)
from pixsim7.backend.main.domain.enums import MediaType
from pixsim7.backend.main.services.analysis.analysis_service import AnalysisService
from pixsim7.backend.main.services.prompt.parser import AnalyzerTarget, analyzer_registry
from pixsim7.backend.main.shared.errors import InvalidOperationError, ResourceNotFoundError

logger = configure_logging(__name__)


class AnalysisBackfillService:
    """Service for durable analysis backfill run lifecycle and batch execution."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_run(
        self,
        *,
        user: User,
        media_type: Optional[str] = None,
        analyzer_id: Optional[str] = None,
        analyzer_intent: Optional[str] = None,
        analysis_point: Optional[str] = None,
        prompt: Optional[str] = None,
        params: Optional[Dict[str, Any]] = None,
        priority: int = 5,
        batch_size: int = 100,
        enqueue: bool = True,
    ) -> AnalysisBackfillRun:
        normalized_media_type = self._normalize_media_type(media_type)
        normalized_analyzer_id = self._normalize_analyzer_id(analyzer_id)

        if batch_size < 1 or batch_size > 1000:
            raise InvalidOperationError("batch_size must be between 1 and 1000")

        total_assets = await self._count_assets_for_scope(
            user_id=user.id,
            media_type=normalized_media_type,
        )

        run = AnalysisBackfillRun(
            user_id=user.id,
            status=AnalysisBackfillStatus.PENDING,
            media_type=normalized_media_type,
            analyzer_id=normalized_analyzer_id,
            analyzer_intent=analyzer_intent,
            analysis_point=analysis_point,
            prompt=prompt,
            params=params or {},
            priority=priority,
            batch_size=batch_size,
            total_assets=total_assets,
            processed_assets=0,
            created_analyses=0,
            deduped_assets=0,
            failed_assets=0,
            cursor_asset_id=0,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        self.db.add(run)
        await self.db.commit()
        await self.db.refresh(run)

        logger.info(
            "analysis_backfill_created run_id=%s user_id=%s total_assets=%s",
            run.id,
            user.id,
            total_assets,
        )

        if enqueue:
            await self._enqueue_backfill_batch(run.id)

        return run

    async def list_runs(
        self,
        *,
        user_id: int,
        status: Optional[AnalysisBackfillStatus] = None,
        limit: int = 50,
    ) -> list[AnalysisBackfillRun]:
        stmt = (
            select(AnalysisBackfillRun)
            .where(AnalysisBackfillRun.user_id == user_id)
            .order_by(AnalysisBackfillRun.created_at.desc())
            .limit(limit)
        )
        if status:
            stmt = stmt.where(AnalysisBackfillRun.status == status)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_run(self, run_id: int) -> AnalysisBackfillRun:
        run = await self.db.get(AnalysisBackfillRun, run_id)
        if not run:
            raise ResourceNotFoundError(f"Analysis backfill run {run_id} not found")
        return run

    async def get_run_for_user(self, *, run_id: int, user_id: int) -> AnalysisBackfillRun:
        run = await self.get_run(run_id)
        if run.user_id != user_id:
            raise InvalidOperationError("Cannot access other users' backfill runs")
        return run

    async def pause_run(self, *, run_id: int, user: User) -> AnalysisBackfillRun:
        run = await self.get_run_for_user(run_id=run_id, user_id=user.id)
        if run.status not in {AnalysisBackfillStatus.PENDING, AnalysisBackfillStatus.RUNNING}:
            raise InvalidOperationError(f"Cannot pause backfill run in status '{run.status.value}'")

        run.status = AnalysisBackfillStatus.PAUSED
        run.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(run)
        return run

    async def resume_run(self, *, run_id: int, user: User) -> AnalysisBackfillRun:
        run = await self.get_run_for_user(run_id=run_id, user_id=user.id)
        if run.status != AnalysisBackfillStatus.PAUSED:
            raise InvalidOperationError(f"Can only resume paused runs, not '{run.status.value}'")

        run.status = AnalysisBackfillStatus.PENDING
        run.last_error = None
        run.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(run)

        await self._enqueue_backfill_batch(run.id)
        return run

    async def cancel_run(self, *, run_id: int, user: User) -> AnalysisBackfillRun:
        run = await self.get_run_for_user(run_id=run_id, user_id=user.id)
        if run.is_terminal:
            raise InvalidOperationError(f"Backfill run already {run.status.value}")

        run.status = AnalysisBackfillStatus.CANCELLED
        run.completed_at = datetime.now(timezone.utc)
        run.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(run)
        return run

    async def process_run_batch(self, run_id: int) -> AnalysisBackfillRun:
        run = await self.get_run(run_id)

        if run.status in {
            AnalysisBackfillStatus.PAUSED,
            AnalysisBackfillStatus.CANCELLED,
            AnalysisBackfillStatus.COMPLETED,
        }:
            return run

        if run.status == AnalysisBackfillStatus.FAILED:
            raise InvalidOperationError(
                f"Run {run_id} is failed and must be resumed manually"
            )

        if run.status == AnalysisBackfillStatus.PENDING:
            run.status = AnalysisBackfillStatus.RUNNING
            run.started_at = run.started_at or datetime.now(timezone.utc)
            run.updated_at = datetime.now(timezone.utc)
            await self.db.commit()
            await self.db.refresh(run)

        assets = await self._load_asset_batch(run)
        if not assets:
            run = await self.get_run(run_id)
            if run.status in {AnalysisBackfillStatus.PENDING, AnalysisBackfillStatus.RUNNING}:
                run.status = AnalysisBackfillStatus.COMPLETED
                run.completed_at = datetime.now(timezone.utc)
                run.updated_at = datetime.now(timezone.utc)
                await self.db.commit()
                await self.db.refresh(run)
            return run

        analysis_service = AnalysisService(self.db)
        backfill_user = await self.db.get(User, run.user_id)
        if not backfill_user:
            raise ResourceNotFoundError(f"User {run.user_id} not found")
        created_count = 0
        deduped_count = 0
        failed_count = 0
        last_error: Optional[str] = None

        for asset in assets:
            try:
                _, created = await analysis_service.create_analysis_with_meta(
                    user=backfill_user,
                    asset_id=asset.id,
                    analyzer_id=run.analyzer_id,
                    analyzer_intent=run.analyzer_intent,
                    analysis_point=run.analysis_point,
                    prompt=run.prompt,
                    params=run.params or {},
                    priority=run.priority,
                    enqueue=True,
                )
                if created:
                    created_count += 1
                else:
                    deduped_count += 1
            except Exception as exc:
                await self.db.rollback()
                failed_count += 1
                last_error = str(exc)
                logger.warning(
                    "analysis_backfill_asset_failed run_id=%s asset_id=%s error=%s",
                    run.id,
                    asset.id,
                    str(exc),
                )

        last_asset_id = assets[-1].id
        has_more = await self._has_more_assets(run, last_asset_id)

        run = await self.get_run(run_id)
        run.cursor_asset_id = last_asset_id
        run.processed_assets += len(assets)
        run.created_analyses += created_count
        run.deduped_assets += deduped_count
        run.failed_assets += failed_count
        if last_error:
            run.last_error = last_error

        if run.status == AnalysisBackfillStatus.RUNNING:
            if has_more:
                run.updated_at = datetime.now(timezone.utc)
            else:
                run.status = AnalysisBackfillStatus.COMPLETED
                run.completed_at = datetime.now(timezone.utc)
                run.updated_at = datetime.now(timezone.utc)

        await self.db.commit()
        await self.db.refresh(run)

        if run.status == AnalysisBackfillStatus.RUNNING and has_more:
            await self._enqueue_backfill_batch(run.id)

        return run

    async def mark_failed(self, run_id: int, error_message: str) -> AnalysisBackfillRun:
        run = await self.get_run(run_id)
        if run.is_terminal:
            return run

        run.status = AnalysisBackfillStatus.FAILED
        run.last_error = error_message
        run.completed_at = datetime.now(timezone.utc)
        run.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(run)
        return run

    async def _count_assets_for_scope(
        self,
        *,
        user_id: int,
        media_type: Optional[str],
    ) -> int:
        stmt = select(func.count(Asset.id)).where(Asset.user_id == user_id)
        if media_type:
            stmt = stmt.where(Asset.media_type == MediaType(media_type))
        result = await self.db.execute(stmt)
        return int(result.scalar() or 0)

    async def _load_asset_batch(self, run: AnalysisBackfillRun) -> list[Asset]:
        stmt = (
            select(Asset)
            .where(Asset.user_id == run.user_id)
            .where(Asset.id > run.cursor_asset_id)
            .order_by(Asset.id)
            .limit(run.batch_size)
        )
        if run.media_type:
            stmt = stmt.where(Asset.media_type == MediaType(run.media_type))

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def _has_more_assets(self, run: AnalysisBackfillRun, cursor_asset_id: int) -> bool:
        stmt = (
            select(Asset.id)
            .where(Asset.user_id == run.user_id)
            .where(Asset.id > cursor_asset_id)
            .order_by(Asset.id)
            .limit(1)
        )
        if run.media_type:
            stmt = stmt.where(Asset.media_type == MediaType(run.media_type))

        result = await self.db.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def _enqueue_backfill_batch(self, run_id: int) -> None:
        try:
            from pixsim7.backend.main.infrastructure.redis import get_arq_pool

            arq_pool = await get_arq_pool()
            await arq_pool.enqueue_job(
                "run_analysis_backfill_batch",
                backfill_run_id=run_id,
            )
            logger.info("analysis_backfill_queued run_id=%s", run_id)
        except Exception as exc:
            logger.error(
                "analysis_backfill_queue_failed run_id=%s error=%s",
                run_id,
                str(exc),
            )
            raise

    def _normalize_media_type(self, media_type: Optional[str]) -> Optional[str]:
        if media_type is None:
            return None
        normalized = media_type.strip().lower()
        if not normalized:
            return None
        try:
            return MediaType(normalized).value
        except ValueError as exc:
            raise InvalidOperationError(f"Invalid media_type '{media_type}'") from exc

    def _normalize_analyzer_id(self, analyzer_id: Optional[str]) -> Optional[str]:
        if analyzer_id is None:
            return None
        normalized = analyzer_id.strip()
        if not normalized:
            return None

        canonical_id = analyzer_registry.resolve_legacy(normalized)
        analyzer = analyzer_registry.get(canonical_id)
        if not analyzer:
            raise InvalidOperationError(f"Analyzer '{analyzer_id}' is not registered")
        if analyzer.target != AnalyzerTarget.ASSET:
            raise InvalidOperationError(
                f"Analyzer '{analyzer_id}' is not an asset analyzer"
            )
        if not analyzer.enabled:
            raise InvalidOperationError(f"Analyzer '{analyzer_id}' is disabled")

        return canonical_id
