"""Shared primitives for durable, resumable asset-backfill runs.

Both the analysis backfill (``analysis_backfill_runs``) and the signal-scan
reprobe (``signal_backfill_runs``) persist a run row with the *same* lifecycle:
a cursor over ``Asset.id`` for resumability, a status state machine for
pause/resume/cancel, and progress counters. The status enum is identical across
both, so it lives here and is shared (see ``services/backfill/base.py`` for the
generic service that drives the state machine).
"""
from __future__ import annotations

from enum import Enum


class BackfillStatus(str, Enum):
    """Lifecycle of a durable backfill run — shared by every backfill domain."""

    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


# Terminal states — a run here is finished and will not be re-enqueued.
TERMINAL_BACKFILL_STATUSES = frozenset(
    {BackfillStatus.COMPLETED, BackfillStatus.FAILED, BackfillStatus.CANCELLED}
)
