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

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, select

from pixsim7.backend.main.domain import Asset, User
from pixsim7.backend.main.domain.assets.backfill import BackfillStatus
from pixsim7.backend.main.domain.assets.signal_backfill import SignalBackfillRun
from pixsim7.backend.main.infrastructure.queue import MEDIA_MAINTENANCE_QUEUE_NAME
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
    # Run on the isolated media-maintenance worker (single-slot) so a full-library
    # reprobe sweep doesn't contend with the generation hot path.
    queue_name = MEDIA_MAINTENANCE_QUEUE_NAME

    # ffmpeg probing is process-spawn-bound, not compute-bound — each asset spawns
    # 4 ffmpeg/ffprobe calls. Probe a bounded fan-out of assets concurrently off
    # the event loop (the DB stamping stays serial — the async session isn't
    # concurrency-safe). Capped so the maintenance worker doesn't starve the box.
    _PROBE_CONCURRENCY = 6

    # Per-batch ``{asset_id: raw_metrics | None}`` cache filled by
    # ``_prefetch_batch`` and consumed by ``_process_asset``. None = no prefetch
    # (e.g. unit tests calling _process_asset directly → inline probe).
    _probe_cache: Optional[Dict[int, Any]] = None

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

        # Don't spawn a duplicate sweep — if this user already has an active run
        # (pending/running), return it. The create call timing out client-side
        # (below) used to leave users clicking Start again and stacking runs.
        existing = await self._find_active_run(user_id=user.id)
        if existing is not None:
            return existing

        # `total_assets` (for the progress bar) is a single COUNT — cheap. The
        # heavy per-cohort render-baseline refresh is deferred to the first batch
        # (see _prepare_batch); doing it synchronously here blocked the request
        # past the client's 30s timeout on a full-library sweep.
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

    async def _find_active_run(self, *, user_id: int) -> Optional[SignalBackfillRun]:
        """The user's most recent still-active (pending/running) run, if any."""
        stmt = (
            select(SignalBackfillRun)
            .where(
                SignalBackfillRun.user_id == user_id,
                SignalBackfillRun.status.in_(
                    [BackfillStatus.PENDING, BackfillStatus.RUNNING]
                ),
            )
            .order_by(SignalBackfillRun.id.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    # ---- hooks ------------------------------------------------------------
    async def _prepare_batch(
        self, run: SignalBackfillRun
    ) -> Tuple[SignalAnalysisService, Dict[str, Any]]:
        from pixsim7.backend.main.services.asset.cohort_baselines import (
            load_cohort_baselines,
            refresh_cohort_baselines,
        )

        # Refresh the per-cohort render baselines ONCE, at the start of the run
        # (cursor still 0), rather than synchronously in create_run — which is what
        # blew past the client's create timeout. Later batches just load the cache.
        if run.cursor_asset_id == 0:
            await refresh_cohort_baselines(self.db, user_id=run.user_id)
        baselines = await load_cohort_baselines(self.db)
        return SignalAnalysisService(self.db), baselines

    async def _prefetch_batch(
        self,
        assets: List[Asset],
        run: SignalBackfillRun,
        ctx: Tuple[SignalAnalysisService, Dict[str, Any]],
    ) -> None:
        """Run each asset's ffmpeg probe concurrently (bounded) off the event
        loop, caching results for the serial DB-stamping loop. ``probe_raw`` is
        DB-free, so it's safe in a thread; the cohort render-context lookup and
        the stamp stay serial in ``_process_asset``."""
        signal_service, _ = ctx
        # Release the read transaction opened by _load_batch/_prepare_batch before
        # the (potentially minute-long) probe fan-out. Holding it idle across the
        # probe phase trips Postgres' idle_in_transaction_session_timeout (30s),
        # which terminates the connection and poisons the session for the stamp
        # loop. expire_on_commit=False keeps the already-loaded assets usable, and
        # nothing has been written yet, so this only ends a read-only transaction.
        await self.db.commit()
        sem = asyncio.Semaphore(self._PROBE_CONCURRENCY)
        cache: Dict[int, Any] = {}

        async def _probe(asset: Asset) -> None:
            async with sem:
                cache[asset.id] = await asyncio.to_thread(
                    signal_service.probe_raw, asset
                )

        await asyncio.gather(*(_probe(a) for a in assets))
        self._probe_cache = cache

    async def _process_asset(
        self,
        asset: Asset,
        run: SignalBackfillRun,
        ctx: Tuple[SignalAnalysisService, Dict[str, Any]],
    ) -> Dict[str, int]:
        signal_service, baselines = ctx
        kwargs: Dict[str, Any] = {
            "force": True,
            "commit": False,
            "cohort_baselines": baselines,
        }
        # Use the batch's parallel-probe result when present; otherwise the
        # service probes inline (keeps direct _process_asset callers working).
        cache = self._probe_cache
        if cache is not None and asset.id in cache:
            kwargs["prefetched"] = cache[asset.id]
        payload = await signal_service.probe_and_stamp(asset, **kwargs)
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
