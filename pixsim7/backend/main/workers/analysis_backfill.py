"""
Analysis backfill worker task.

Executes one durable backfill batch per invocation. The service re-enqueues
itself until the run is completed, paused, cancelled, or failed.
"""
from __future__ import annotations

from pixsim_logging import configure_logging

from pixsim7.backend.main.infrastructure.database.session import get_db
from pixsim7.backend.main.services.analysis.analysis_backfill_service import (
    AnalysisBackfillService,
)

logger = configure_logging("worker")


async def run_analysis_backfill_batch(ctx: dict, backfill_run_id: int) -> dict:
    """Process a single analysis backfill batch."""
    async for db in get_db():
        service = AnalysisBackfillService(db)
        try:
            run = await service.process_run_batch(backfill_run_id)
            return {
                "status": run.status.value,
                "run_id": run.id,
                "processed_assets": run.processed_assets,
                "created_analyses": run.created_analyses,
                "deduped_assets": run.deduped_assets,
                "failed_assets": run.failed_assets,
                "cursor_asset_id": run.cursor_asset_id,
            }
        except Exception as exc:
            logger.error(
                "analysis_backfill_batch_failed run_id=%s error=%s",
                backfill_run_id,
                str(exc),
                exc_info=True,
            )
            try:
                await service.mark_failed(backfill_run_id, str(exc))
            except Exception:
                logger.error(
                    "analysis_backfill_mark_failed_error run_id=%s",
                    backfill_run_id,
                    exc_info=True,
                )
            raise
        finally:
            await db.close()
