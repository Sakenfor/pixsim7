"""
Shared Analyzer Observability — structured logging and run metrics.

Phase 3 of the analyzer shared-kernel consolidation plan
(work item: ``kernel-observability``).

Single instrumentation layer consumed by both prompt and asset orchestrators
so that log fields and metric semantics are consistent across paths.
"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, Dict, Optional

from pixsim7.backend.main.services.analysis.result_envelope import AnalyzerProvenance

logger = logging.getLogger("pixsim7.analyzers")


@dataclass
class AnalyzerRunMetrics:
    """Metrics collected during an analyzer run."""

    path: str  # "prompt" or "asset"
    analyzer_id: str
    provider_id: Optional[str] = None
    model_id: Optional[str] = None
    success: bool = False
    fallback_used: bool = False
    fallback_depth: int = 0
    duration_ms: Optional[float] = None
    chain_duration_ms: Optional[float] = None
    error_category: Optional[str] = None
    candidate_count: int = 0
    empty_result: bool = False


def log_analyzer_run(
    provenance: AnalyzerProvenance,
    *,
    path: str,
    success: bool,
    candidate_count: int = 0,
    empty_result: bool = False,
    extra: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Emit a structured log entry for an analyzer run.

    Both prompt and asset orchestrators call this after execution
    so that log fields are consistent and searchable.

    Args:
        provenance: Result envelope provenance.
        path: Orchestrator path ("prompt" or "asset").
        success: Whether the run produced a result.
        candidate_count: Number of candidates in the chain.
        empty_result: Whether the result had no meaningful content.
        extra: Additional fields to merge into the log.
    """
    fields: Dict[str, Any] = {
        "event": "analyzer_run",
        "path": path,
        "analyzer_id": provenance.analyzer_id,
        "success": success,
        "fallback_used": provenance.fallback_used,
        "fallback_depth": provenance.fallback_depth,
        "candidate_count": candidate_count,
    }

    if provenance.provider_id:
        fields["provider_id"] = provenance.provider_id
    if provenance.model_id:
        fields["model_id"] = provenance.model_id
    if provenance.duration_ms is not None:
        fields["duration_ms"] = provenance.duration_ms
    if provenance.chain_duration_ms is not None:
        fields["chain_duration_ms"] = provenance.chain_duration_ms
    if provenance.error_category:
        fields["error_category"] = provenance.error_category
    if empty_result:
        fields["empty_result"] = True

    if extra:
        fields.update(extra)

    if success:
        logger.info("analyzer_run %s", fields)
    else:
        logger.warning("analyzer_run_failed %s", fields)


@asynccontextmanager
async def analyzer_timer():
    """
    Async context manager that measures wall-clock duration.

    Usage::

        async with analyzer_timer() as t:
            result = await do_analysis()
        print(t.duration_ms)
    """
    timer = _Timer()
    timer.start()
    try:
        yield timer
    finally:
        timer.stop()


class _Timer:
    """Simple monotonic timer."""

    __slots__ = ("_start", "_end")

    def __init__(self) -> None:
        self._start: Optional[float] = None
        self._end: Optional[float] = None

    def start(self) -> None:
        self._start = time.monotonic()

    def stop(self) -> None:
        self._end = time.monotonic()

    @property
    def duration_ms(self) -> Optional[float]:
        if self._start is None:
            return None
        end = self._end if self._end is not None else time.monotonic()
        return round((end - self._start) * 1000, 2)
