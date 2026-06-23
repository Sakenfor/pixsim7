"""ProcessingOutcome — the host-agnostic result of processing one generation.

The arq generation worker reports back to ARQ two ways: **return a dict** (job
is done — skipped/scheduled/submitted/requeued/failed) or **raise** (ARQ should
retry). That raise-vs-return split is the only genuinely transport-bound thing
about ``process_generation``. ``ProcessingOutcome`` makes it data instead of
control flow, so the processing logic (``GenerationProcessingService``) is
callable and testable without ARQ: the thin worker glue translates the outcome
back into dict-or-raise (worker-thin-host-canon plan).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class ProcessingOutcome:
    """Either a terminal result dict (job done) or an error to re-raise (retry)."""

    result: Optional[dict] = None
    error: Optional[BaseException] = None
    raise_for_retry: bool = False

    @classmethod
    def done(cls, result: dict) -> "ProcessingOutcome":
        """Job finished — caller returns ``result`` to ARQ (no retry)."""
        return cls(result=result)

    @classmethod
    def retry(cls, error: BaseException) -> "ProcessingOutcome":
        """Job should be retried — caller re-raises ``error`` so ARQ retries."""
        return cls(error=error, raise_for_retry=True)
