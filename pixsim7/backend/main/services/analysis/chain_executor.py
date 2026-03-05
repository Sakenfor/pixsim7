"""
Shared Analyzer Chain Executor — strategy-based multi-analyzer resolution.

Phase 2 of the analyzer shared-kernel consolidation plan
(work item: ``kernel-chain-executor``).

Provides ``execute_first_success`` which formalises the candidate-loop
pattern previously inlined in ``AnalysisService`` and the silent fallback
in ``PromptAnalysisService``.

Both orchestrators now route through this module so chain behaviour,
error classification, and provenance tracking are consistent.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Awaitable, Callable, Optional, Sequence

from pixsim7.backend.main.services.analysis.error_taxonomy import (
    AnalyzerErrorCategory,
    classify_analyzer_error,
    should_try_next_in_chain,
)

logger = logging.getLogger(__name__)


class ChainStrategy(Enum):
    """Execution strategy for an analyzer chain."""

    FIRST_SUCCESS = "first_success"
    RUN_ALL = "run_all"


@dataclass(frozen=True)
class ChainStepOutcome:
    """Outcome of a single chain step."""

    analyzer_id: str
    success: bool
    result: Any = None
    error: Optional[Exception] = None
    error_category: Optional[AnalyzerErrorCategory] = None
    duration_ms: Optional[float] = None


@dataclass(frozen=True)
class ChainResult:
    """Aggregate result of executing an analyzer chain."""

    success: bool
    result: Any = None
    selected_analyzer_id: Optional[str] = None
    steps: list[ChainStepOutcome] = field(default_factory=list)
    total_duration_ms: Optional[float] = None

    @property
    def fallback_used(self) -> bool:
        """True if the successful step was not the first candidate tried."""
        return self.success and len(self.steps) > 1

    @property
    def fallback_depth(self) -> int:
        """Number of failed steps before success (0 = first candidate won)."""
        if not self.success:
            return len(self.steps)
        return len(self.steps) - 1

    @property
    def error_summary(self) -> str:
        """One-line summary of all step errors for diagnostics."""
        parts = []
        for step in self.steps:
            if not step.success and step.error is not None:
                parts.append(f"{step.analyzer_id}: {step.error}")
        return "; ".join(parts) if parts else "no errors"


async def execute_first_success(
    candidates: Sequence[str],
    step_fn: Callable[[str], Awaitable[Any]],
) -> ChainResult:
    """
    Execute *step_fn* for each candidate until one succeeds.

    Behaviour:
      * On success → return immediately with the result.
      * On error → classify via error taxonomy:
        - if ``should_try_next_in_chain`` → continue to next candidate.
        - otherwise → stop and return failure.
      * Duplicate candidate IDs are skipped.
      * Empty candidates list → immediate failure.

    Args:
        candidates: Ordered list of analyzer IDs to try.
        step_fn: Async callable that takes an analyzer_id and returns
            the resolved/executed result.  Must raise on failure.

    Returns:
        ``ChainResult`` with provenance for every step attempted.
    """
    steps: list[ChainStepOutcome] = []
    seen: set[str] = set()
    chain_start = time.monotonic()

    for analyzer_id in candidates:
        if analyzer_id in seen:
            continue
        seen.add(analyzer_id)

        step_start = time.monotonic()
        try:
            result = await step_fn(analyzer_id)
            step_ms = (time.monotonic() - step_start) * 1000
            step = ChainStepOutcome(
                analyzer_id=analyzer_id,
                success=True,
                result=result,
                duration_ms=step_ms,
            )
            steps.append(step)
            total_ms = (time.monotonic() - chain_start) * 1000
            return ChainResult(
                success=True,
                result=result,
                selected_analyzer_id=analyzer_id,
                steps=steps,
                total_duration_ms=total_ms,
            )
        except Exception as exc:
            step_ms = (time.monotonic() - step_start) * 1000
            category = classify_analyzer_error(exc)
            step = ChainStepOutcome(
                analyzer_id=analyzer_id,
                success=False,
                error=exc,
                error_category=category,
                duration_ms=step_ms,
            )
            steps.append(step)

            if not should_try_next_in_chain(category):
                logger.debug(
                    "chain_executor_stop category=%s analyzer=%s",
                    category.value,
                    analyzer_id,
                )
                total_ms = (time.monotonic() - chain_start) * 1000
                return ChainResult(success=False, steps=steps, total_duration_ms=total_ms)

            logger.debug(
                "chain_executor_skip category=%s analyzer=%s",
                category.value,
                analyzer_id,
            )

    total_ms = (time.monotonic() - chain_start) * 1000
    return ChainResult(success=False, steps=steps, total_duration_ms=total_ms)
