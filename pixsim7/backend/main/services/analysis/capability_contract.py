"""
Shared Analyzer Capability Contract — validation and compatibility checks.

Phase 4 of the analyzer shared-kernel consolidation plan
(work item: ``kernel-capability-contract``).

Provides capability validation that both prompt and asset orchestrators
use so that new analyzers can plug in without per-orchestrator hardcoding
and capability mismatches fail fast with clear errors.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from pixsim7.backend.main.services.prompt.parser.registry import (
    AnalyzerInfo,
    AnalyzerInputModality,
    AnalyzerTaskFamily,
)


class CapabilityMismatchError(Exception):
    """Raised when an analyzer cannot handle the requested capability."""

    def __init__(self, analyzer_id: str, message: str):
        self.analyzer_id = analyzer_id
        self.message = message
        super().__init__(f"Capability mismatch for '{analyzer_id}': {message}")


@dataclass(frozen=True)
class CapabilityRequest:
    """
    Describes what the caller needs from the analyzer.

    Orchestrators build this from the request context (media type,
    analysis point, flags) and pass it to ``validate_analyzer_capability``
    before dispatching.
    """

    input_modality: Optional[AnalyzerInputModality] = None
    task_family: Optional[AnalyzerTaskFamily] = None
    requires_batch: bool = False
    requires_streaming: bool = False
    output_schema_id: Optional[str] = None


# Modalities that a MULTIMODAL analyzer can accept.
_MULTIMODAL_ACCEPTS: frozenset[AnalyzerInputModality] = frozenset({
    AnalyzerInputModality.TEXT,
    AnalyzerInputModality.IMAGE,
    AnalyzerInputModality.VIDEO,
    AnalyzerInputModality.AUDIO,
    AnalyzerInputModality.MULTIMODAL,
})


def _modality_compatible(
    analyzer_modality: Optional[AnalyzerInputModality],
    request_modality: Optional[AnalyzerInputModality],
) -> bool:
    """Check whether the analyzer accepts the requested modality."""
    if request_modality is None or analyzer_modality is None:
        return True  # no constraint
    if analyzer_modality == request_modality:
        return True
    if analyzer_modality == AnalyzerInputModality.MULTIMODAL:
        return True  # multimodal accepts anything
    if request_modality == AnalyzerInputModality.MULTIMODAL:
        return True  # caller accepts anything, analyzer is specific
    return False


def validate_analyzer_capability(
    analyzer: AnalyzerInfo,
    request: CapabilityRequest,
) -> None:
    """
    Validate that *analyzer* can handle *request*.

    Raises ``CapabilityMismatchError`` on the first mismatch found.
    Does nothing if all checks pass.

    Checks (in order):
      1. Input modality compatibility
      2. Task family match
      3. Batch support
      4. Streaming support
      5. Output schema compatibility
    """
    # 1. Input modality
    if not _modality_compatible(analyzer.input_modality, request.input_modality):
        raise CapabilityMismatchError(
            analyzer.id,
            f"Analyzer accepts {analyzer.input_modality.value} input, "
            f"but request requires {request.input_modality.value}",
        )

    # 2. Task family
    if (
        request.task_family is not None
        and analyzer.task_family is not None
        and analyzer.task_family != request.task_family
    ):
        raise CapabilityMismatchError(
            analyzer.id,
            f"Analyzer produces {analyzer.task_family.value} output, "
            f"but request requires {request.task_family.value}",
        )

    # 3. Batch support
    if request.requires_batch and not analyzer.supports_batch:
        raise CapabilityMismatchError(
            analyzer.id,
            "Analyzer does not support batch execution",
        )

    # 4. Streaming support
    if request.requires_streaming and not analyzer.supports_streaming:
        raise CapabilityMismatchError(
            analyzer.id,
            "Analyzer does not support streaming",
        )

    # 5. Output schema
    if (
        request.output_schema_id is not None
        and analyzer.output_schema_id is not None
        and analyzer.output_schema_id != request.output_schema_id
    ):
        raise CapabilityMismatchError(
            analyzer.id,
            f"Analyzer output schema '{analyzer.output_schema_id}' "
            f"does not match required '{request.output_schema_id}'",
        )


def check_analyzer_capability(
    analyzer: AnalyzerInfo,
    request: CapabilityRequest,
) -> bool:
    """
    Non-raising version of ``validate_analyzer_capability``.

    Returns ``True`` if the analyzer can handle the request,
    ``False`` otherwise.
    """
    try:
        validate_analyzer_capability(analyzer, request)
        return True
    except CapabilityMismatchError:
        return False
