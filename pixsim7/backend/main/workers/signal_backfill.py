"""
Signal-scan reprobe backfill worker task.

Executes one durable reprobe batch per invocation. All lifecycle logic lives in
``SignalBackfillService`` / ``BackfillRunServiceBase``; this is the thin ARQ
entrypoint registered in ``arq_worker``.
"""
from __future__ import annotations

from typing import Any, Dict

from pixsim7.backend.main.services.asset.signal_backfill_service import (
    SignalBackfillService,
)
from pixsim7.backend.main.workers.backfill_runner import run_backfill_batch


async def run_signal_backfill_batch(ctx: dict, backfill_run_id: int) -> Dict[str, Any]:
    """Process a single signal reprobe backfill batch."""
    return await run_backfill_batch(SignalBackfillService, backfill_run_id)
