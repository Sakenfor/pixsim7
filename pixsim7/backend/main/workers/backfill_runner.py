"""Shared ARQ glue for durable backfill batches.

Every backfill domain's ARQ task is the same five lines: open a DB session,
process one batch via its ``BackfillRunServiceBase``, return a progress dict,
and on failure mark the run failed and re-raise. That boilerplate lives here so
each domain's worker module is a thin wrapper.
"""
from __future__ import annotations

from typing import Any, Dict

from pixsim_logging import configure_logging
from pixsim7.backend.main.infrastructure.database.session import get_db
from pixsim7.backend.main.services.backfill import BackfillRunServiceBase

logger = configure_logging("worker")


async def run_backfill_batch(
    service_cls: type[BackfillRunServiceBase],
    backfill_run_id: int,
) -> Dict[str, Any]:
    """Process a single durable backfill batch for ``service_cls``.

    The service re-enqueues itself until the run is completed, paused,
    cancelled, or failed.
    """
    async for db in get_db():
        service = service_cls(db)
        try:
            run = await service.process_run_batch(backfill_run_id)
            return run.to_progress_dict()
        except Exception as exc:
            logger.error(
                "%s_batch_failed run_id=%s error=%s",
                service.log_prefix,
                backfill_run_id,
                str(exc),
                exc_info=True,
            )
            try:
                await service.mark_failed(backfill_run_id, str(exc))
            except Exception:
                logger.error(
                    "%s_mark_failed_error run_id=%s",
                    service.log_prefix,
                    backfill_run_id,
                    exc_info=True,
                )
            raise
        finally:
            await db.close()
