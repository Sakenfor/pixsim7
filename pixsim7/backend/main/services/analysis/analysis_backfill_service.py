"""
Analysis backfill orchestration service.

Durable, resumable batch orchestration that creates analysis jobs across
existing assets for a user. The generic run lifecycle (state machine, cursor
paging, re-enqueue) lives in ``BackfillRunServiceBase``; this subclass supplies
only the analysis-specific batch query and per-asset work.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, select

from pixsim7.backend.main.domain import Asset, User
from pixsim7.backend.main.domain.assets.analysis_backfill import AnalysisBackfillRun
from pixsim7.backend.main.domain.assets.backfill import BackfillStatus
from pixsim7.backend.main.domain.enums import MediaType
from pixsim7.backend.main.services.analysis.analysis_service import AnalysisService
from pixsim7.backend.main.services.backfill import BackfillRunServiceBase
from pixsim7.backend.main.services.prompt.parser import AnalyzerTarget, analyzer_registry
from pixsim7.backend.main.shared.errors import InvalidOperationError, ResourceNotFoundError


class AnalysisBackfillService(BackfillRunServiceBase[AnalysisBackfillRun]):
    """Durable analysis backfill run lifecycle and batch execution."""

    run_model = AnalysisBackfillRun
    enqueue_job_name = "run_analysis_backfill_batch"
    log_prefix = "analysis_backfill"

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
            status=BackfillStatus.PENDING,
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
        return await self._persist_new_run(run, enqueue=enqueue)

    # ---- hooks ------------------------------------------------------------
    async def _prepare_batch(self, run: AnalysisBackfillRun) -> Tuple[AnalysisService, User]:
        backfill_user = await self.db.get(User, run.user_id)
        if not backfill_user:
            raise ResourceNotFoundError(f"User {run.user_id} not found")
        return AnalysisService(self.db), backfill_user

    async def _process_asset(
        self, asset: Asset, run: AnalysisBackfillRun, ctx: Tuple[AnalysisService, User]
    ) -> Dict[str, int]:
        analysis_service, backfill_user = ctx
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
        return {"created": 1} if created else {"deduped": 1}

    def _apply_outcome(self, run: AnalysisBackfillRun, totals: Dict[str, int]) -> None:
        run.created_analyses += totals.get("created", 0)
        run.deduped_assets += totals.get("deduped", 0)

    async def _load_batch(self, run: AnalysisBackfillRun) -> List[Asset]:
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

    async def _has_more(self, run: AnalysisBackfillRun, cursor_asset_id: int) -> bool:
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

    # ---- scope counting / validation --------------------------------------
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
