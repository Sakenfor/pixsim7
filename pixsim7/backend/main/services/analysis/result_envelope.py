"""
Shared Analyzer Result Envelope — consistent provenance for all analyzer runs.

Phase 3 of the analyzer shared-kernel consolidation plan
(work item: ``kernel-envelope``).

Provides ``AnalyzerProvenance`` — a standard metadata attachment that both
prompt and asset orchestrators emit so that every analyzer execution carries
the same provenance contract regardless of path.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional

from pixsim7.backend.main.services.analysis.chain_executor import ChainResult
from pixsim7.backend.main.services.analysis.error_taxonomy import AnalyzerErrorCategory


@dataclass(frozen=True)
class StepTrace:
    """Compact provenance for one chain step."""

    analyzer_id: str
    success: bool
    duration_ms: Optional[float] = None
    error_category: Optional[str] = None


@dataclass(frozen=True)
class AnalyzerProvenance:
    """
    Standard provenance envelope attached to every analyzer result.

    Fields mirror the plan doc (Phase 3: Result Envelope + Provenance):
      - analyzer_id: which analyzer produced the result
      - provider_id / model_id: resolved execution target
      - duration_ms: wall-clock time for the successful step
      - chain_duration_ms: wall-clock time for the entire chain
      - fallback_used: whether a fallback candidate was needed
      - fallback_depth: number of failed steps before success
      - error_category: category of the terminal error (failure only)
      - chain_trace: compact per-step audit trail
    """

    analyzer_id: str
    provider_id: Optional[str] = None
    model_id: Optional[str] = None
    duration_ms: Optional[float] = None
    chain_duration_ms: Optional[float] = None
    fallback_used: bool = False
    fallback_depth: int = 0
    error_category: Optional[str] = None
    chain_trace: List[StepTrace] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Serialise to a JSON-safe dict, omitting None values."""
        raw = asdict(self)
        return {k: v for k, v in raw.items() if v is not None}


def build_provenance(
    chain_result: ChainResult,
    *,
    provider_id: Optional[str] = None,
    model_id: Optional[str] = None,
) -> AnalyzerProvenance:
    """
    Build ``AnalyzerProvenance`` from a ``ChainResult``.

    Args:
        chain_result: Outcome of ``execute_first_success()``.
        provider_id: Resolved provider (from ``ResolvedAnalyzerExecution``).
        model_id: Resolved model (from ``ResolvedAnalyzerExecution``).

    Returns:
        Provenance envelope ready to attach to the analyzer result dict.
    """
    # Build compact chain trace
    trace: List[StepTrace] = []
    for step in chain_result.steps:
        trace.append(StepTrace(
            analyzer_id=step.analyzer_id,
            success=step.success,
            duration_ms=round(step.duration_ms, 2) if step.duration_ms is not None else None,
            error_category=step.error_category.value if step.error_category else None,
        ))

    # Duration of the successful step (if any)
    step_duration: Optional[float] = None
    if chain_result.success and chain_result.steps:
        last_step = chain_result.steps[-1]
        if last_step.duration_ms is not None:
            step_duration = round(last_step.duration_ms, 2)

    # Terminal error category (failure only)
    terminal_error: Optional[str] = None
    if not chain_result.success and chain_result.steps:
        last_failed = chain_result.steps[-1]
        if last_failed.error_category:
            terminal_error = last_failed.error_category.value

    return AnalyzerProvenance(
        analyzer_id=chain_result.selected_analyzer_id or "unknown",
        provider_id=provider_id,
        model_id=model_id,
        duration_ms=step_duration,
        chain_duration_ms=(
            round(chain_result.total_duration_ms, 2)
            if chain_result.total_duration_ms is not None
            else None
        ),
        fallback_used=chain_result.fallback_used,
        fallback_depth=chain_result.fallback_depth,
        error_category=terminal_error,
        chain_trace=trace,
    )
