"""Durable, resumable asset-backfill run orchestration (shared layer).

See :mod:`pixsim7.backend.main.services.backfill.base` for the generic state
machine. Concrete consumers: ``AnalysisBackfillService`` (analysis jobs) and
``SignalBackfillService`` (signal-scan reprobe).
"""
from pixsim7.backend.main.services.backfill.base import BackfillRunServiceBase

__all__ = ["BackfillRunServiceBase"]
