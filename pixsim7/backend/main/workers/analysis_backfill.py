"""
Analysis backfill worker task.

Executes one durable backfill batch per invocation. All the lifecycle logic
lives in ``AnalysisBackfillService`` / ``BackfillRunServiceBase``; this is the
thin ARQ entrypoint registered in ``arq_worker``.
"""
from __future__ import annotations

from typing import Any, Dict

from pixsim7.backend.main.services.analysis.analysis_backfill_service import (
    AnalysisBackfillService,
)
from pixsim7.backend.main.workers.backfill_runner import run_backfill_batch


async def run_analysis_backfill_batch(ctx: dict, backfill_run_id: int) -> Dict[str, Any]:
    """Process a single analysis backfill batch."""
    return await run_backfill_batch(AnalysisBackfillService, backfill_run_id)
