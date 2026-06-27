"""Signal-scan backfill orchestration service.

Durable, resumable bring-up of videos to the current signal ``SCANNER_VERSION``,
in one of two modes (``SignalBackfillRun.mode``):

* ``reprobe`` — a FULL ``probe_and_stamp(force=True)`` per asset (ffmpeg decode →
  chroma_fp + audio/visual metrics). The only path that captures the probe
  fields; runs over STALE videos (scanner_version distinct from target).
* ``rescore`` — no ffmpeg: ``rescore_from_stored`` re-applies the broken-audio
  fingerprint matcher + scoring over already-stored metrics. The pass you repeat
  after curating ``signalref:*`` references / retuning thresholds, so it sweeps
  EVERY previously-scored video, not just stale ones (after a reprobe everything
  is already current, yet the matcher result still changes as references grow).

Both modes load the ``signalref:*`` reference fingerprints once per batch and
feed them to the scorer, so a reprobe run after references exist computes
``audio_ref_match`` too.

All run lifecycle (state machine, cursor paging, re-enqueue) lives in
``BackfillRunServiceBase``; this subclass supplies only the per-mode scope query
and the per-asset work.
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

# Run modes. "reprobe" = full ffmpeg; "rescore" = stored-metrics re-score.
REPROBE_MODE = "reprobe"
RESCORE_MODE = "rescore"
# Like reprobe (full ffmpeg) but restricted to clips with a LOCAL file — defers
# archive-tiered clips that fetch slowly over the network. Run this first to get
# the bulk + the local signalref references onto the scanner fast, then a normal
# reprobe mops up the archive tier.
LOCAL_REPROBE_MODE = "reprobe_local"
VALID_MODES = (REPROBE_MODE, RESCORE_MODE, LOCAL_REPROBE_MODE)


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
    # concurrency-safe). Live-tuned via MediaSettings; these are the fallbacks if
    # settings can't be read.
    _PROBE_CONCURRENCY = 6
    _FFMPEG_THREADS = 1

    def _probe_tunables(self) -> Tuple[int, int]:
        """(concurrency, ffmpeg_threads) for this batch, read fresh from
        MediaSettings so a frontend change applies on the next batch without a
        worker restart. Falls back to the class defaults if settings are
        unavailable (e.g. cache not yet hydrated)."""
        try:
            from pixsim7.backend.main.services.media.settings import get_media_settings

            settings = get_media_settings()
            settings.reload()  # pull the latest cross-process-synced values
            concurrency = max(1, int(settings.signal_reprobe_concurrency))
            threads = max(0, int(settings.signal_reprobe_ffmpeg_threads))
            return concurrency, threads
        except Exception:  # noqa: BLE001 — never let config reads break a batch
            return self._PROBE_CONCURRENCY, self._FFMPEG_THREADS

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
        mode: str = REPROBE_MODE,
        enqueue: bool = True,
    ) -> SignalBackfillRun:
        version = (target_scanner_version or SCANNER_VERSION).strip()
        if not version:
            raise InvalidOperationError("target_scanner_version must be non-empty")
        if batch_size < 1 or batch_size > 1000:
            raise InvalidOperationError("batch_size must be between 1 and 1000")
        mode = (mode or REPROBE_MODE).strip()
        if mode not in VALID_MODES:
            raise InvalidOperationError(f"mode must be one of {VALID_MODES}")

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
        total_assets = await self._count_scope(
            user_id=user.id, version=version, mode=mode
        )

        run = SignalBackfillRun(
            user_id=user.id,
            status=BackfillStatus.PENDING,
            target_scanner_version=version,
            mode=mode,
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

    # ---- scope (per-mode) -------------------------------------------------
    def _scope_conditions(self, run_or_version, user_id: int, mode: str) -> list:
        """WHERE conditions for the run's in-scope videos, by mode.

        reprobe → stale videos with a resolvable source (shared with the sync
        endpoint). rescore → EVERY previously-scored video (signal_score set),
        regardless of version: the matcher result changes as references grow even
        when the clip is already at the current scanner, so the rescore sweep must
        re-touch current rows, not just stale ones.
        """
        version = (
            run_or_version
            if isinstance(run_or_version, str)
            else run_or_version.target_scanner_version
        )
        if mode == RESCORE_MODE:
            return [
                Asset.user_id == user_id,
                Asset.media_type == "VIDEO",
                Asset.is_archived == False,  # noqa: E712
                Asset.signal_score.isnot(None),
            ]
        # reprobe (all) or reprobe_local (defer archive-tiered / remote-fetch clips).
        return stale_signal_video_conditions(
            version, user_id, local_only=(mode == LOCAL_REPROBE_MODE)
        )

    # ---- hooks ------------------------------------------------------------
    async def _prepare_batch(
        self, run: SignalBackfillRun
    ) -> Tuple[SignalAnalysisService, Dict[str, Any], List[Any]]:
        from pixsim7.backend.main.services.asset.cohort_baselines import (
            load_cohort_baselines,
            refresh_cohort_baselines,
        )
        from pixsim7.backend.main.services.asset.audio_fingerprint import (
            load_reference_fingerprints,
        )

        # Refresh the per-cohort render baselines ONCE, at the start of the run
        # (cursor still 0), rather than synchronously in create_run — which is what
        # blew past the client's create timeout. Later batches just load the cache.
        if run.cursor_asset_id == 0:
            await refresh_cohort_baselines(self.db, user_id=run.user_id)
        baselines = await load_cohort_baselines(self.db)
        # Load the broken-audio fingerprint references once per batch (cheap) so
        # both modes can compute audio_ref_match. Empty until the signalref:*
        # clips have themselves been probed under a fingerprint-capable scanner.
        ref_fingerprints = await load_reference_fingerprints(self.db)
        return SignalAnalysisService(self.db), baselines, ref_fingerprints

    async def _prefetch_batch(
        self,
        assets: List[Asset],
        run: SignalBackfillRun,
        ctx: Tuple[SignalAnalysisService, Dict[str, Any], List[Any]],
    ) -> None:
        """Run each asset's ffmpeg probe concurrently (bounded) off the event
        loop, caching results for the serial DB-stamping loop. ``probe_raw`` is
        DB-free, so it's safe in a thread; the cohort render-context lookup and
        the stamp stay serial in ``_process_asset``.

        No-op in rescore mode — that path re-scores stored metrics with no ffmpeg.
        """
        if run.mode == RESCORE_MODE:
            self._probe_cache = None
            return
        signal_service, _, _ = ctx
        concurrency, ffmpeg_threads = self._probe_tunables()
        # Release the read transaction opened by _load_batch/_prepare_batch before
        # the (potentially minute-long) probe fan-out. Holding it idle across the
        # probe phase trips Postgres' idle_in_transaction_session_timeout (30s),
        # which terminates the connection and poisons the session for the stamp
        # loop. expire_on_commit=False keeps the already-loaded assets usable, and
        # nothing has been written yet, so this only ends a read-only transaction.
        await self.db.commit()
        sem = asyncio.Semaphore(concurrency)
        cache: Dict[int, Any] = {}

        async def _probe(asset: Asset) -> None:
            async with sem:
                cache[asset.id] = await asyncio.to_thread(
                    signal_service.probe_raw, asset, ffmpeg_threads=ffmpeg_threads
                )

        await asyncio.gather(*(_probe(a) for a in assets))
        self._probe_cache = cache

    async def _process_asset(
        self,
        asset: Asset,
        run: SignalBackfillRun,
        ctx: Tuple[SignalAnalysisService, Dict[str, Any], List[Any]],
    ) -> Dict[str, int]:
        signal_service, baselines, ref_fingerprints = ctx
        if run.mode == RESCORE_MODE:
            # No ffmpeg: re-apply the matcher + scoring over stored metrics.
            payload = await signal_service.rescore_from_stored(
                asset,
                commit=False,
                cohort_baselines=baselines,
                ref_fingerprints=ref_fingerprints,
            )
        else:
            kwargs: Dict[str, Any] = {
                "force": True,
                "commit": False,
                "cohort_baselines": baselines,
                "ref_fingerprints": ref_fingerprints,
            }
            # Use the batch's parallel-probe result when present; otherwise the
            # service probes inline (keeps direct _process_asset callers working).
            cache = self._probe_cache
            if cache is not None and asset.id in cache:
                kwargs["prefetched"] = cache[asset.id]
            payload = await signal_service.probe_and_stamp(asset, **kwargs)
        if payload is None:  # ineligible / unresolvable source / no stored metrics
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
        conds = self._scope_conditions(run, run.user_id, run.mode)
        stmt = (
            select(Asset)
            .where(*conds, Asset.id > run.cursor_asset_id)
            .order_by(Asset.id)
            .limit(run.batch_size)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def _has_more(self, run: SignalBackfillRun, cursor_asset_id: int) -> bool:
        conds = self._scope_conditions(run, run.user_id, run.mode)
        stmt = (
            select(Asset.id)
            .where(*conds, Asset.id > cursor_asset_id)
            .order_by(Asset.id)
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def _count_scope(
        self, *, user_id: int, version: str, mode: str = REPROBE_MODE
    ) -> int:
        conds = self._scope_conditions(version, user_id, mode)
        result = await self.db.execute(select(func.count(Asset.id)).where(*conds))
        return int(result.scalar() or 0)
