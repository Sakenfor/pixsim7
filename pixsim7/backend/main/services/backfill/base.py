"""Generic durable-backfill run service.

Owns the entire lifecycle that every asset-backfill domain shares — the status
state machine (pending/running/paused/cancelled/failed/completed),
pause/resume/cancel, cursor-paged batch processing over assets, progress
counting and self-re-enqueuing — leaving each domain to implement only:

  * which run table it persists (``run_model``) and which ARQ job re-enqueues a
    batch (``enqueue_job_name``);
  * which assets are stale (``_load_batch`` / ``_has_more``);
  * what to do per asset (``_process_asset``) and how that rolls up into the
    domain's own progress counters (``_apply_outcome``).

This is the durable-orchestration twin of ``VersioningServiceBase`` — one
canonical pattern instead of a copy per domain. The ARQ *worker* that calls
``process_run_batch`` is just thin glue; see
``workers/backfill_runner.run_backfill_batch``.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Dict, Generic, List, Optional, TypeVar

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim_logging import configure_logging
from pixsim7.backend.main.domain import Asset, User
from pixsim7.backend.main.domain.assets.backfill import BackfillStatus
from pixsim7.backend.main.shared.errors import (
    InvalidOperationError,
    ResourceNotFoundError,
)

logger = configure_logging("service.backfill")

# A run row — duck-typed: must carry the columns the generic state machine
# reads/writes (status, cursor_asset_id, batch_size, *_assets counters,
# timestamps, last_error, is_terminal, to_progress_dict).
TRun = TypeVar("TRun")


class BackfillRunServiceBase(ABC, Generic[TRun]):
    """Generic state machine + batch driver for durable backfill runs."""

    # ---- subclass configuration -------------------------------------------
    run_model: type  # the SQLModel run table (e.g. AnalysisBackfillRun)
    enqueue_job_name: str  # ARQ task name that processes one batch
    log_prefix: str  # log-event prefix, e.g. "analysis_backfill"

    def __init__(self, db: AsyncSession):
        self.db = db

    # ---- lifecycle: read --------------------------------------------------
    async def get_run(self, run_id: int) -> TRun:
        run = await self.db.get(self.run_model, run_id)
        if not run:
            raise ResourceNotFoundError(
                f"{self.log_prefix} run {run_id} not found"
            )
        return run

    async def get_run_for_user(self, *, run_id: int, user_id: int) -> TRun:
        run = await self.get_run(run_id)
        if run.user_id != user_id:
            raise InvalidOperationError("Cannot access other users' backfill runs")
        return run

    async def list_runs(
        self,
        *,
        user_id: int,
        status: Optional[BackfillStatus] = None,
        limit: int = 50,
    ) -> List[TRun]:
        from sqlalchemy import select

        stmt = (
            select(self.run_model)
            .where(self.run_model.user_id == user_id)
            .order_by(self.run_model.created_at.desc())
            .limit(limit)
        )
        if status:
            stmt = stmt.where(self.run_model.status == status)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # ---- lifecycle: transitions -------------------------------------------
    async def pause_run(self, *, run_id: int, user: User) -> TRun:
        run = await self.get_run_for_user(run_id=run_id, user_id=user.id)
        if run.status not in {BackfillStatus.PENDING, BackfillStatus.RUNNING}:
            raise InvalidOperationError(
                f"Cannot pause backfill run in status '{run.status.value}'"
            )
        run.status = BackfillStatus.PAUSED
        run.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(run)
        return run

    async def resume_run(self, *, run_id: int, user: User) -> TRun:
        run = await self.get_run_for_user(run_id=run_id, user_id=user.id)
        if run.status != BackfillStatus.PAUSED:
            raise InvalidOperationError(
                f"Can only resume paused runs, not '{run.status.value}'"
            )
        run.status = BackfillStatus.PENDING
        run.last_error = None
        run.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(run)
        await self._enqueue_batch(run.id)
        return run

    async def cancel_run(self, *, run_id: int, user: User) -> TRun:
        run = await self.get_run_for_user(run_id=run_id, user_id=user.id)
        if run.is_terminal:
            raise InvalidOperationError(f"Backfill run already {run.status.value}")
        run.status = BackfillStatus.CANCELLED
        run.completed_at = datetime.now(timezone.utc)
        run.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(run)
        return run

    async def mark_failed(self, run_id: int, error_message: str) -> TRun:
        run = await self.get_run(run_id)
        if run.is_terminal:
            return run
        run.status = BackfillStatus.FAILED
        run.last_error = error_message
        run.completed_at = datetime.now(timezone.utc)
        run.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(run)
        return run

    # ---- batch processing -------------------------------------------------
    async def process_run_batch(self, run_id: int) -> TRun:
        """Process one batch, advance the cursor, re-enqueue until drained."""
        run = await self.get_run(run_id)

        if run.status in {
            BackfillStatus.PAUSED,
            BackfillStatus.CANCELLED,
            BackfillStatus.COMPLETED,
        }:
            return run
        if run.status == BackfillStatus.FAILED:
            raise InvalidOperationError(
                f"Run {run_id} is failed and must be resumed manually"
            )
        if run.status == BackfillStatus.PENDING:
            run.status = BackfillStatus.RUNNING
            run.started_at = run.started_at or datetime.now(timezone.utc)
            run.updated_at = datetime.now(timezone.utc)
            await self.db.commit()
            await self.db.refresh(run)

        assets = await self._load_batch(run)
        if not assets:
            run = await self.get_run(run_id)
            if run.status in {BackfillStatus.PENDING, BackfillStatus.RUNNING}:
                run.status = BackfillStatus.COMPLETED
                run.completed_at = datetime.now(timezone.utc)
                run.updated_at = datetime.now(timezone.utc)
                await self.db.commit()
                await self.db.refresh(run)
            return run

        ctx = await self._prepare_batch(run)
        totals: Dict[str, int] = {}
        failed_count = 0
        last_error: Optional[str] = None

        for asset in assets:
            try:
                outcome = await self._process_asset(asset, run, ctx)
                for key, delta in (outcome or {}).items():
                    totals[key] = totals.get(key, 0) + delta
            except Exception as exc:  # noqa: BLE001 — never let one asset kill the batch
                await self.db.rollback()
                failed_count += 1
                last_error = str(exc)
                logger.warning(
                    "%s_asset_failed run_id=%s asset_id=%s error=%s",
                    self.log_prefix,
                    run.id,
                    asset.id,
                    str(exc),
                )

        last_asset_id = assets[-1].id

        # Re-fetch the run before mutating counters: a rollback above may have
        # expired the in-memory instance, and the status may have changed
        # (pause/cancel) while the batch ran.
        run = await self.get_run(run_id)
        has_more = await self._has_more(run, last_asset_id)

        run.cursor_asset_id = last_asset_id
        run.processed_assets += len(assets)
        run.failed_assets += failed_count
        self._apply_outcome(run, totals)
        if last_error:
            run.last_error = last_error

        if run.status == BackfillStatus.RUNNING:
            if has_more:
                run.updated_at = datetime.now(timezone.utc)
            else:
                run.status = BackfillStatus.COMPLETED
                run.completed_at = datetime.now(timezone.utc)
                run.updated_at = datetime.now(timezone.utc)

        await self.db.commit()
        await self.db.refresh(run)

        await self._after_batch(run, totals)

        if run.status == BackfillStatus.RUNNING and has_more:
            await self._enqueue_batch(run.id)

        return run

    # ---- shared helpers (subclasses call these) ---------------------------
    async def _persist_new_run(self, run: TRun, *, enqueue: bool = True) -> TRun:
        """Commit a freshly-built run row and (optionally) kick off batch 1."""
        self.db.add(run)
        await self.db.commit()
        await self.db.refresh(run)
        logger.info(
            "%s_created run_id=%s user_id=%s total_assets=%s",
            self.log_prefix,
            run.id,
            run.user_id,
            run.total_assets,
        )
        if enqueue:
            await self._enqueue_batch(run.id)
        return run

    async def _enqueue_batch(self, run_id: int) -> None:
        try:
            from pixsim7.backend.main.infrastructure.redis import get_arq_pool

            arq_pool = await get_arq_pool()
            await arq_pool.enqueue_job(self.enqueue_job_name, backfill_run_id=run_id)
            logger.info("%s_queued run_id=%s", self.log_prefix, run_id)
        except Exception as exc:
            logger.error(
                "%s_queue_failed run_id=%s error=%s",
                self.log_prefix,
                run_id,
                str(exc),
            )
            raise

    # ---- subclass hooks ---------------------------------------------------
    @abstractmethod
    async def _load_batch(self, run: TRun) -> List[Asset]:
        """Load the next cursor-paged batch of stale assets for this run."""

    @abstractmethod
    async def _has_more(self, run: TRun, cursor_asset_id: int) -> bool:
        """Whether any stale asset remains beyond ``cursor_asset_id``."""

    @abstractmethod
    async def _process_asset(
        self, asset: Asset, run: TRun, ctx: Any
    ) -> Dict[str, int]:
        """Process one asset; return a map of domain counter-name -> delta.

        Raise to mark the asset failed (the batch continues). ``ctx`` is
        whatever ``_prepare_batch`` returned for this batch.
        """

    @abstractmethod
    def _apply_outcome(self, run: TRun, totals: Dict[str, int]) -> None:
        """Fold the batch's accumulated counter deltas onto the run row."""

    async def _prepare_batch(self, run: TRun) -> Any:
        """Per-batch setup shared by every asset (e.g. load cohort baselines).

        Returns an opaque context handed to each ``_process_asset`` call.
        Defaults to ``None``; override when the domain needs batch-wide state.
        """
        return None

    async def _after_batch(self, run: TRun, totals: Dict[str, int]) -> None:
        """Post-commit hook fired once per processed batch (after the run row is
        persisted). Override for side effects like cache invalidation. ``totals``
        is the batch's accumulated counter deltas. Defaults to no-op.
        """
        return None
