from __future__ import annotations

from typing import Any, Optional

from .types import ResolutionTrace, TraceEvent


def add_trace_event(
    trace: ResolutionTrace,
    *,
    kind: str,
    target_key: Optional[str] = None,
    candidate_block_id: Optional[str] = None,
    score: Optional[float] = None,
    message: Optional[str] = None,
    data: Optional[dict[str, Any]] = None,
) -> None:
    trace.events.append(
        TraceEvent(
            kind=kind,
            target_key=target_key,
            candidate_block_id=candidate_block_id,
            score=score,
            message=message,
            data=dict(data or {}),
        )
    )
