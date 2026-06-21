"""Signal-scan reprobe backfill orchestration service.

Durable, resumable re-probe of stale videos to the current signal
``SCANNER_VERSION``. Unlike the cheap stored-metric rescore, this runs a FULL
``probe_and_stamp(force=True)`` per asset — the only path that computes the v3
``spectral_flatness`` tonal axis.

All run lifecycle (state machine, cursor paging, re-enqueue) lives in
``BackfillRunServiceBase``; this subclass supplies only the stale-video query
and the per-asset probe.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, select

from pixsim7.backend.main.domain import Asset, User
from pixsim7.backend.main.domain.assets.backfill import BackfillStatus
from pixsim7.backend.main.domain.assets.signal_backfill import SignalBackfillRun
from pixsim7.backend.main.services.backfill import BackfillRunServiceBase
from pixsim7.backend.main.services.asset.signal_analysis import (
    SCANNER_VERSION,
    SignalAnalysisService,
    stale_signal_video_conditions,
)
from pixsim7.backend.main.shared.errors import InvalidOperationError


class SignalBackfillService(BackfillRunServiceBase[SignalBackfillRun]):
    """Durable signal-scan reprobe run lifecycle and batch execution."""

    run_model = SignalBackfillRun
    enqueue_job_name = "run_signal_backfill_batch"
    log_prefix = "signal_backfill"

    async def create_run(
        self,
        *,
        user: User,
        target_scanner_version: Optional[str] = None,
        batch_size: int = 100,
        enqueue: bool = True,
    ) -> SignalBackfillRun:
        version = (target_scanner_version or SCANNER_VERSION).strip()
        if not version:
            raise InvalidOperationError("target_scanner_version must be non-empty")
        if batch_size < 1 or batch_size > 1000:
            raise InvalidOperationError("batch_size must be between 1 and 1000")

        # Refresh the per-cohort render baselines ONCE up front; each batch then
        # loads the cached blob (the render signal feeds the scorer).
        from pixsim7.backend.main.services.asset.cohort_baselines import (
            refresh_cohort_baselines,
        )

        await refresh_cohort_baselines(self.db, user_id=user.id)

        total_assets = await self._count_scope(user_id=user.id, version=version)

        run = SignalBackfillRun(
            user_id=user.id,
            status=BackfillStatus.PENDING,
            target_scanner_version=version,
            batch_size=batch_size,
            total_assets=total_assets,
            processed_assets=0,
            scanned_assets=0,
            broken_assets=0,
            skipped_assets=0,
            failed_assets=0,
            cursor_asset_id=0,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        return await self._persist_new_run(run, enqueue=enqueue)

    # ---- hooks ------------------------------------------------------------
    async def _prepare_batch(
        self, run: SignalBackfillRun
    ) -> Tuple[SignalAnalysisService, Dict[str, Any]]:
        from pixsim7.backend.main.services.asset.cohort_baselines import (
            load_cohort_baselines,
        )

        baselines = await load_cohort_baselines(self.db)
        return SignalAnalysisService(self.db), baselines

    async def _process_asset(
        self,
        asset: Asset,
        run: SignalBackfillRun,
        ctx: Tuple[SignalAnalysisService, Dict[str, Any]],
    ) -> Dict[str, int]:
        signal_service, baselines = ctx
        payload = await signal_service.probe_and_stamp(
            asset, force=True, commit=False, cohort_baselines=baselines
        )
        if payload is None:  # ineligible / unresolvable source / probe failed
            return {"skipped": 1}
        if payload.get("suspicious"):
            return {"scanned": 1, "broken": 1}
        return {"scanned": 1}

    def _apply_outcome(self, run: SignalBackfillRun, totals: Dict[str, int]) -> None:
        run.scanned_assets += totals.get("scanned", 0)
        run.broken_assets += totals.get("broken", 0)
        run.skipped_assets += totals.get("skipped", 0)

    async def _after_batch(self, run: SignalBackfillRun, totals: Dict[str, int]) -> None:
        # Scores changed -> drop the cached coverage snapshot so the dashboard's
        # broken-count recomputes.
        if totals.get("scanned"):
            from pixsim7.backend.main.services.asset.signal_stats_cache import (
                invalidate_signal_stats_cache,
            )

            await invalidate_signal_stats_cache(self.db, run.user_id)

    async def _load_batch(self, run: SignalBackfillRun) -> List[Asset]:
        conds = stale_signal_video_conditions(run.target_scanner_version, run.user_id)
        stmt = (
            select(Asset)
            .where(*conds, Asset.id > run.cursor_asset_id)
            .order_by(Asset.id)
            .limit(run.batch_size)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def _has_more(self, run: SignalBackfillRun, cursor_asset_id: int) -> bool:
        conds = stale_signal_video_conditions(run.target_scanner_version, run.user_id)
        stmt = (
            select(Asset.id)
            .where(*conds, Asset.id > cursor_asset_id)
            .order_by(Asset.id)
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def _count_scope(self, *, user_id: int, version: str) -> int:
        conds = stale_signal_video_conditions(version, user_id)
        result = await self.db.execute(select(func.count(Asset.id)).where(*conds))
        return int(result.scalar() or 0)
